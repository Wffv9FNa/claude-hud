import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getOverrideFilePath } from './transcript-paths.js';
import { readOverride } from './overrides.js';
/**
 * Parse `--clear=<targets>`, `--transcript=<path>`, `--quiet` from argv.
 *
 * Returns `isClearMode = false` when no `--clear` flag is present so the caller
 * falls through to the normal stdin/render path.
 */
export function parseClearArgs(argv) {
    let clearRaw;
    let transcript;
    let quiet = false;
    let sawClear = false;
    for (const arg of argv) {
        if (arg === '--quiet') {
            quiet = true;
            continue;
        }
        if (arg.startsWith('--clear=')) {
            sawClear = true;
            clearRaw = arg.slice('--clear='.length);
            continue;
        }
        if (arg === '--clear') {
            sawClear = true;
            clearRaw = '';
            continue;
        }
        if (arg.startsWith('--transcript=')) {
            transcript = arg.slice('--transcript='.length);
            continue;
        }
    }
    if (!sawClear) {
        return { ok: true, isClearMode: false };
    }
    if (clearRaw === undefined || clearRaw.trim() === '') {
        return { ok: false, isClearMode: true, error: '--clear requires a value (agents, todos, or all)' };
    }
    const tokens = clearRaw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) {
        return { ok: false, isClearMode: true, error: '--clear requires a value (agents, todos, or all)' };
    }
    const hasAll = tokens.includes('all');
    const hasNamed = tokens.some((t) => t === 'agents' || t === 'todos');
    if (hasAll && (hasNamed || tokens.length > 1)) {
        return { ok: false, isClearMode: true, error: "'all' cannot be combined with named targets" };
    }
    const targets = new Set();
    for (const tok of tokens) {
        if (tok === 'all') {
            targets.add('agents');
            targets.add('todos');
        }
        else if (tok === 'agents' || tok === 'todos') {
            targets.add(tok);
        }
        else {
            return { ok: false, isClearMode: true, error: `unknown --clear target: ${tok}` };
        }
    }
    if (!transcript || transcript.trim() === '') {
        return { ok: false, isClearMode: true, error: '--transcript=<path> is required when --clear is given' };
    }
    return { ok: true, isClearMode: true, args: { transcript, targets, quiet } };
}
/**
 * Apply a `--clear` request: read existing override (if any), monotonically
 * advance the requested timestamps, atomically write the merged file, and
 * roundtrip-verify the result. Stdout MUST remain empty on every code path -
 * all messages go to stderr.
 */
export function runClear(args, deps = {}) {
    const homeDir = deps.homeDir ?? os.homedir();
    const nowMs = deps.now ? deps.now() : Date.now();
    const transcriptPath = path.resolve(args.transcript);
    const finalPath = getOverrideFilePath(transcriptPath, homeDir);
    const overrideDir = path.dirname(finalPath);
    try {
        fs.mkdirSync(overrideDir, { recursive: true });
    }
    catch (e) {
        console.error(`claude-hud: cannot create override directory: ${e.message}`);
        return 1;
    }
    const existing = readOverride(transcriptPath, homeDir);
    const monotonic = (incomingMs, prior) => {
        const priorMs = prior ? Date.parse(prior) : NaN;
        const safePrior = Number.isFinite(priorMs) ? priorMs : 0;
        return new Date(Math.max(incomingMs, safePrior)).toISOString();
    };
    const next = {
        version: 1,
        transcriptPath,
        writtenAt: new Date(nowMs).toISOString(),
    };
    if (args.targets.has('agents')) {
        next.clearAgentsBefore = monotonic(nowMs, existing?.clearAgentsBefore);
    }
    else if (existing?.clearAgentsBefore) {
        next.clearAgentsBefore = existing.clearAgentsBefore;
    }
    if (args.targets.has('todos')) {
        next.clearTodosBefore = monotonic(nowMs, existing?.clearTodosBefore);
    }
    else if (existing?.clearTodosBefore) {
        next.clearTodosBefore = existing.clearTodosBefore;
    }
    const tmpPath = `${finalPath}.tmp.${process.pid}`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf8');
        fs.renameSync(tmpPath, finalPath);
    }
    catch (e) {
        try {
            fs.unlinkSync(tmpPath);
        }
        catch { /* ignore */ }
        console.error(`claude-hud: override write failed: ${e.message}`);
        return 1;
    }
    // Roundtrip verify: read back, parse, assert shape.
    try {
        const verifyRaw = fs.readFileSync(finalPath, 'utf8');
        const verify = JSON.parse(verifyRaw);
        if (!verify || typeof verify !== 'object')
            throw new Error('parsed value not an object');
        if (verify.version !== 1)
            throw new Error('schema mismatch');
        if (typeof verify.transcriptPath !== 'string')
            throw new Error('missing transcriptPath');
        if (typeof verify.writtenAt !== 'string')
            throw new Error('missing writtenAt');
        if (args.targets.has('agents') && typeof verify.clearAgentsBefore !== 'string') {
            throw new Error('missing clearAgentsBefore');
        }
        if (args.targets.has('todos') && typeof verify.clearTodosBefore !== 'string') {
            throw new Error('missing clearTodosBefore');
        }
    }
    catch (e) {
        console.error(`claude-hud: override verify failed: ${e.message}`);
        return 1;
    }
    if (!args.quiet) {
        const labels = [...args.targets].sort().join('+');
        console.error(`claude-hud: cleared ${labels} for transcript ${path.basename(transcriptPath)}`);
    }
    return 0;
}
//# sourceMappingURL=run-clear.js.map