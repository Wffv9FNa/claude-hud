---
description: Clear stuck running agents/todos from the claude-hud statusline
argument-hint: "[agents|todos|all]"
allowed-tools: Bash, Read
---

# /claude-hud:clear

Flushes stale "running" agents or "in_progress" todos from the claude-hud
display for the current Claude Code session. Use this when an agent or todo
has been killed, crashed, or otherwise stopped reporting and the HUD still
shows it as active. New agents/todos started after this command are
unaffected.

The override is persisted to:
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/overrides/<sha256>.json`

The `<sha256>` is the hash of the resolved transcript path. Override files
older than 14 days are auto-cleaned the next time the renderer reads them.

## Usage

- `/claude-hud:clear` - clears both agents and todos (default `all`)
- `/claude-hud:clear agents` - clears stuck agents only
- `/claude-hud:clear todos` - clears stuck todos only
- `/claude-hud:clear all` - same as no argument

The argument the user passed is `$ARGUMENTS`. If empty, treat it as `all`.
Reject any value other than `agents`, `todos`, or `all` (the renderer
rejects mixed forms like `all,agents` itself).

## Implementation steps

Follow these steps in order. ASCII only, British English in any user-facing
report.

### Step 1: Resolve the configured statusline command

Read the user's settings file:

```bash
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
command cat "$SETTINGS" | jq -r '.statusLine.command'
```

The returned string is the same `bash -c '...'` (or `powershell -Command
"..."`) wrapper that `/claude-hud:setup` writes. Extract two values:

- `RUNTIME_PATH` - the absolute path to the `bun` or `node` binary that
  appears as `exec "<runtime>"` (bash) or `& '<runtime>'` (PowerShell)
  inside the wrapper.
- `PLUGIN_ENTRY` - the trailing argument that points at
  `<plugin-dir>/dist/index.js` or `<plugin-dir>/src/index.ts`.

If `settings.json` is missing or `statusLine.command` is unset, fall back
to the same resolution `setup.md` performs:

```bash
PLUGIN_DIR=$(command ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null \
  | awk -F/ '{ print $(NF-1) "\t" $(0) }' \
  | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n \
  | tail -1 | cut -f2-)
RUNTIME_PATH=$(command -v node 2>/dev/null || command -v bun 2>/dev/null)
PLUGIN_ENTRY="${PLUGIN_DIR}dist/index.js"
```

If neither path can be resolved, stop and tell the user the plugin does
not appear to be installed; suggest re-running `/claude-hud:setup`.

### Step 2: Locate the active transcript

Claude Code stores the per-project transcript JSONL files under
`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<cwd-slug>/`. The cwd slug
replaces `/` with `-` and trims the leading `-`.

```bash
CWD_SLUG=$(pwd | tr '/' '-' | sed 's/^-//')
TRANSCRIPT=$(command ls -t "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/${CWD_SLUG}"/*.jsonl 2>/dev/null | head -1)
```

If no transcript is found, stop and tell the user no active transcript
could be located for the current working directory.

### Step 3: Invoke the override-write mode

Validate `$ARGUMENTS`:

- empty -> `TARGET=all`
- `agents`, `todos`, or `all` -> `TARGET=$ARGUMENTS`
- anything else -> stop with an error explaining the accepted values.

Then run:

```bash
"$RUNTIME_PATH" "$PLUGIN_ENTRY" --clear="$TARGET" --transcript="$TRANSCRIPT" --quiet
```

The CLI writes nothing to stdout. Success and error messages go to stderr
and the exit code distinguishes outcomes:

- `0` - override written successfully.
- `1` - filesystem write or roundtrip-verify failure.
- `2` - argument validation failure (should not happen if Step 3 above is
  correct).

### Step 4: Report the result

If the exit code is `0`, tell the user the requested targets were cleared
for the current transcript and that the HUD will reflect the change on
its next refresh tick (typically within 300ms). If the exit code is
non-zero, surface the captured stderr verbatim so the user can see what
went wrong.
