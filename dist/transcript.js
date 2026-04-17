import * as fs from 'fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'readline';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
let createReadStreamImpl = fs.createReadStream;
function normalizeTokenCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.trunc(value));
}
function normalizeSessionTokens(tokens) {
    if (!tokens || typeof tokens !== 'object') {
        return undefined;
    }
    const raw = tokens;
    return {
        inputTokens: normalizeTokenCount(raw.inputTokens),
        outputTokens: normalizeTokenCount(raw.outputTokens),
        cacheCreationTokens: normalizeTokenCount(raw.cacheCreationTokens),
        cacheReadTokens: normalizeTokenCount(raw.cacheReadTokens),
    };
}
function getTranscriptCachePath(transcriptPath, homeDir) {
    const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
    return path.join(getHudPluginDir(homeDir), 'transcript-cache', `${hash}.json`);
}
function readTranscriptFileState(transcriptPath) {
    try {
        const stat = fs.statSync(transcriptPath);
        if (!stat.isFile()) {
            return null;
        }
        return {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
        };
    }
    catch {
        return null;
    }
}
function serializeTranscriptData(data) {
    return {
        tools: data.tools.map((tool) => ({
            ...tool,
            startTime: tool.startTime.toISOString(),
            endTime: tool.endTime?.toISOString(),
        })),
        agents: data.agents.map((agent) => ({
            ...agent,
            startTime: agent.startTime.toISOString(),
            endTime: agent.endTime?.toISOString(),
        })),
        todos: data.todos.map((todo) => ({ ...todo })),
        sessionStart: data.sessionStart?.toISOString(),
        sessionName: data.sessionName,
        sessionTokens: data.sessionTokens,
    };
}
function deserializeTranscriptData(data) {
    return {
        tools: data.tools.map((tool) => ({
            ...tool,
            startTime: new Date(tool.startTime),
            endTime: tool.endTime ? new Date(tool.endTime) : undefined,
        })),
        agents: data.agents.map((agent) => ({
            ...agent,
            startTime: new Date(agent.startTime),
            endTime: agent.endTime ? new Date(agent.endTime) : undefined,
        })),
        todos: data.todos.map((todo) => ({ ...todo })),
        sessionStart: data.sessionStart ? new Date(data.sessionStart) : undefined,
        sessionName: data.sessionName,
        sessionTokens: normalizeSessionTokens(data.sessionTokens),
    };
}
function readTranscriptCache(transcriptPath, state) {
    try {
        const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
        const raw = fs.readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.transcriptPath !== path.resolve(transcriptPath)
            || parsed.transcriptState?.mtimeMs !== state.mtimeMs
            || parsed.transcriptState?.size !== state.size) {
            return null;
        }
        return deserializeTranscriptData(parsed.data);
    }
    catch {
        return null;
    }
}
function writeTranscriptCache(transcriptPath, state, data) {
    try {
        const cachePath = getTranscriptCachePath(transcriptPath, os.homedir());
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const payload = {
            transcriptPath: path.resolve(transcriptPath),
            transcriptState: state,
            data: serializeTranscriptData(data),
        };
        fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf8');
    }
    catch {
        // Cache failures are non-fatal; fall back to fresh parsing next time.
    }
}
export async function parseTranscript(transcriptPath) {
    const result = {
        tools: [],
        agents: [],
        todos: [],
    };
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        return result;
    }
    const transcriptState = readTranscriptFileState(transcriptPath);
    if (!transcriptState) {
        return result;
    }
    const cached = readTranscriptCache(transcriptPath, transcriptState);
    if (cached) {
        return cached;
    }
    const toolMap = new Map();
    const agentMap = new Map();
    const backgroundAgentMap = new Map();
    let latestTodos = [];
    const taskIdToIndex = new Map();
    let latestSlug;
    let customTitle;
    const sessionTokens = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
    };
    let parsedCleanly = false;
    try {
        const fileStream = createReadStreamImpl(transcriptPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
                    customTitle = entry.customTitle;
                }
                else if (typeof entry.slug === 'string') {
                    latestSlug = entry.slug;
                }
                // Accumulate token usage from assistant messages
                if (entry.type === 'assistant' && entry.message?.usage) {
                    const usage = entry.message.usage;
                    sessionTokens.inputTokens += normalizeTokenCount(usage.input_tokens);
                    sessionTokens.outputTokens += normalizeTokenCount(usage.output_tokens);
                    sessionTokens.cacheCreationTokens += normalizeTokenCount(usage.cache_creation_input_tokens);
                    sessionTokens.cacheReadTokens += normalizeTokenCount(usage.cache_read_input_tokens);
                }
                processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result, backgroundAgentMap);
            }
            catch {
                // Skip malformed lines
            }
        }
        parsedCleanly = true;
    }
    catch {
        // Return partial results on error
    }
    result.tools = Array.from(toolMap.values()).slice(-20);
    result.agents = Array.from(agentMap.values()).slice(-10);
    result.todos = latestTodos;
    result.sessionName = customTitle ?? latestSlug;
    result.sessionTokens = sessionTokens;
    if (parsedCleanly) {
        writeTranscriptCache(transcriptPath, transcriptState, result);
    }
    return result;
}
export function _setCreateReadStreamForTests(impl) {
    createReadStreamImpl = impl ?? fs.createReadStream;
}
/**
 * Extract the background agent ID from an "Async agent launched" tool_result.
 * Matches the first `agentId: xxx` token in the content text.
 */
function extractBackgroundAgentId(content) {
    if (content == null)
        return null;
    const text = typeof content === 'string'
        ? content
        : (content.find((c) => c?.type === 'text')?.text ?? '');
    const match = text.match(/agentId:\s*([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}
/**
 * Parse a `<task-notification>` block reporting a background-agent completion.
 *
 * Claude Code emits the real payload with hyphen-cased tags (`<task-id>`,
 * `<tool-use-id>`, `<status>`). Accept the underscore variant too for defence
 * in depth against future schema changes.
 */
function parseTaskOutputResult(content) {
    if (content == null)
        return null;
    const text = typeof content === 'string'
        ? content
        : (content.find((c) => c?.type === 'text')?.text ?? '');
    const taskIdMatch = text.match(/<task-id>([^<]+)<\/task-id>/)
        ?? text.match(/<task_id>([^<]+)<\/task_id>/);
    const statusMatch = text.match(/<status>([^<]+)<\/status>/);
    const toolUseIdMatch = text.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)
        ?? text.match(/<tool_use_id>([^<]+)<\/tool_use_id>/);
    if (taskIdMatch && statusMatch) {
        return {
            taskId: taskIdMatch[1],
            toolUseId: toolUseIdMatch ? toolUseIdMatch[1] : null,
            status: statusMatch[1],
        };
    }
    return null;
}
const ASYNC_LAUNCH_PREFIX = 'Async agent launched';
function startsWithAsyncLaunch(text) {
    return !!text && text.trimStart().startsWith(ASYNC_LAUNCH_PREFIX);
}
function isAsyncAgentLaunchResult(content) {
    if (content == null)
        return false;
    if (typeof content === 'string') {
        return startsWithAsyncLaunch(content);
    }
    if (!Array.isArray(content) || content.length === 0)
        return false;
    const first = content[0];
    if (!first || typeof first !== 'object')
        return false;
    if (first.type !== 'text')
        return false;
    return startsWithAsyncLaunch(first.text);
}
function processEntry(entry, toolMap, agentMap, taskIdToIndex, latestTodos, result, backgroundAgentMap) {
    const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
    if (!result.sessionStart && entry.timestamp) {
        result.sessionStart = timestamp;
    }
    const content = entry.message?.content;
    // Claude Code emits background-agent completion as a user-role message whose
    // `content` is a plain string rather than a content-block array, e.g.
    // `<task-notification>...<tool-use-id>...</tool-use-id>
    //  ...<status>completed</status>...</task-notification>`.
    // The block-based parser below only handles array content; without this
    // early branch, background agents (subagents launched with run_in_background)
    // never flip from "running" to "completed" in the HUD.
    if (typeof content === 'string') {
        if (content.includes('<task-notification>')
            || content.includes('<task_id>')
            || content.includes('<task-id>')) {
            const taskOutput = parseTaskOutputResult(content);
            if (taskOutput && taskOutput.status === 'completed') {
                // Prefer direct tool-use-id lookup; fall back to the agentId mapping
                // recorded at launch time.
                let toolUseId;
                if (taskOutput.toolUseId) {
                    toolUseId = taskOutput.toolUseId;
                }
                else if (backgroundAgentMap) {
                    toolUseId = backgroundAgentMap.get(taskOutput.taskId);
                }
                if (toolUseId) {
                    const agent = agentMap.get(toolUseId);
                    if (agent && agent.status === 'running') {
                        agent.status = 'completed';
                        agent.endTime = timestamp;
                    }
                }
            }
        }
        return;
    }
    if (!content || !Array.isArray(content))
        return;
    for (const block of content) {
        if (block.type === 'tool_use' && block.id && block.name) {
            const toolEntry = {
                id: block.id,
                name: block.name,
                target: extractTarget(block.name, block.input),
                status: 'running',
                startTime: timestamp,
            };
            if (block.name === 'Task'
                || block.name === 'proxy_Task'
                || block.name === 'Agent'
                || block.name === 'proxy_Agent') {
                const input = block.input;
                const agentEntry = {
                    id: block.id,
                    type: input?.subagent_type ?? 'unknown',
                    model: input?.model ?? undefined,
                    description: input?.description ?? undefined,
                    status: 'running',
                    startTime: timestamp,
                };
                agentMap.set(block.id, agentEntry);
            }
            else if (block.name === 'TodoWrite' || block.name === 'proxy_TodoWrite') {
                const input = block.input;
                if (input?.todos && Array.isArray(input.todos)) {
                    // Build reverse map: content → taskIds from existing state
                    const contentToTaskIds = new Map();
                    for (const [taskId, idx] of taskIdToIndex) {
                        if (idx < latestTodos.length) {
                            const content = latestTodos[idx].content;
                            const ids = contentToTaskIds.get(content) ?? [];
                            ids.push(taskId);
                            contentToTaskIds.set(content, ids);
                        }
                    }
                    latestTodos.length = 0;
                    taskIdToIndex.clear();
                    latestTodos.push(...input.todos);
                    // Re-register taskId mappings for items whose content matches
                    for (let i = 0; i < latestTodos.length; i++) {
                        const ids = contentToTaskIds.get(latestTodos[i].content);
                        if (ids) {
                            for (const taskId of ids) {
                                taskIdToIndex.set(taskId, i);
                            }
                            contentToTaskIds.delete(latestTodos[i].content);
                        }
                    }
                }
            }
            else if (block.name === 'TaskCreate') {
                const input = block.input;
                const subject = typeof input?.subject === 'string' ? input.subject : '';
                const description = typeof input?.description === 'string' ? input.description : '';
                const content = subject || description || 'Untitled task';
                const status = normalizeTaskStatus(input?.status) ?? 'pending';
                latestTodos.push({ content, status });
                const rawTaskId = input?.taskId;
                const taskId = typeof rawTaskId === 'string' || typeof rawTaskId === 'number'
                    ? String(rawTaskId)
                    : block.id;
                if (taskId) {
                    taskIdToIndex.set(taskId, latestTodos.length - 1);
                }
            }
            else if (block.name === 'TaskUpdate') {
                const input = block.input;
                const index = resolveTaskIndex(input?.taskId, taskIdToIndex, latestTodos);
                if (index !== null) {
                    const status = normalizeTaskStatus(input?.status);
                    if (status) {
                        latestTodos[index].status = status;
                    }
                    const subject = typeof input?.subject === 'string' ? input.subject : '';
                    const description = typeof input?.description === 'string' ? input.description : '';
                    const content = subject || description;
                    if (content) {
                        latestTodos[index].content = content;
                    }
                }
            }
            else {
                toolMap.set(block.id, toolEntry);
            }
        }
        if (block.type === 'tool_result' && block.tool_use_id) {
            const tool = toolMap.get(block.tool_use_id);
            if (tool) {
                tool.status = block.is_error ? 'error' : 'completed';
                tool.endTime = timestamp;
            }
            const agent = agentMap.get(block.tool_use_id);
            if (agent) {
                const blockContent = block.content;
                // Background-agent launch ACKs look like a tool_result whose text
                // STARTS with "Async agent launched" — these are not completions,
                // they just confirm the agent spawned in the background. A real
                // completion report can easily quote the launch phrase elsewhere in
                // its prose, so use `startsWith` on the trimmed text rather than
                // `.includes()` to avoid misclassifying legitimate foreground
                // completions.
                if (isAsyncAgentLaunchResult(blockContent)) {
                    // Record the agentId -> tool_use_id mapping so we can resolve the
                    // matching <task-notification> completion later.
                    if (backgroundAgentMap && blockContent != null) {
                        const bgAgentId = extractBackgroundAgentId(blockContent);
                        if (bgAgentId) {
                            backgroundAgentMap.set(bgAgentId, block.tool_use_id);
                        }
                    }
                    // Keep status as 'running' — launch is not a completion.
                }
                else {
                    // Foreground agent completion (synchronous Task tool_result).
                    agent.status = 'completed';
                    agent.endTime = timestamp;
                }
            }
            // Foreground tool_results may also carry an inline <task-notification>
            // completion block — handle that case for parity with OMC.
            if (block.content != null) {
                const taskOutput = parseTaskOutputResult(block.content);
                if (taskOutput && taskOutput.status === 'completed') {
                    let toolUseId;
                    if (taskOutput.toolUseId) {
                        toolUseId = taskOutput.toolUseId;
                    }
                    else if (backgroundAgentMap) {
                        toolUseId = backgroundAgentMap.get(taskOutput.taskId);
                    }
                    if (toolUseId) {
                        const bgAgent = agentMap.get(toolUseId);
                        if (bgAgent && bgAgent.status === 'running') {
                            bgAgent.status = 'completed';
                            bgAgent.endTime = timestamp;
                        }
                    }
                }
            }
        }
    }
}
function extractTarget(toolName, input) {
    if (!input)
        return undefined;
    switch (toolName) {
        case 'Read':
        case 'Write':
        case 'Edit':
            return input.file_path ?? input.path;
        case 'Glob':
            return input.pattern;
        case 'Grep':
            return input.pattern;
        case 'Bash':
            const cmd = input.command;
            return cmd?.slice(0, 30) + (cmd?.length > 30 ? '...' : '');
    }
    return undefined;
}
function resolveTaskIndex(taskId, taskIdToIndex, latestTodos) {
    if (typeof taskId === 'string' || typeof taskId === 'number') {
        const key = String(taskId);
        const mapped = taskIdToIndex.get(key);
        if (typeof mapped === 'number') {
            return mapped;
        }
        if (/^\d+$/.test(key)) {
            const numericIndex = Number.parseInt(key, 10) - 1;
            if (numericIndex >= 0 && numericIndex < latestTodos.length) {
                return numericIndex;
            }
        }
    }
    return null;
}
function normalizeTaskStatus(status) {
    if (typeof status !== 'string')
        return null;
    switch (status) {
        case 'pending':
        case 'not_started':
            return 'pending';
        case 'in_progress':
        case 'running':
            return 'in_progress';
        case 'completed':
        case 'complete':
        case 'done':
            return 'completed';
        default:
            return null;
    }
}
//# sourceMappingURL=transcript.js.map