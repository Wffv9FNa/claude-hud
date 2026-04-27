import type { Language } from './i18n/types.js';
export type LineLayoutType = 'compact' | 'expanded';
export type AutocompactBufferMode = 'enabled' | 'disabled';
export type ContextValueMode = 'percent' | 'tokens' | 'remaining' | 'both';
/**
 * Controls how the model name is displayed in the HUD badge.
 *
 *   full:    Show the raw display name as-is (e.g. "Opus 4.6 (1M context)")
 *   compact: Strip redundant context-window suffix (e.g. "Opus 4.6")
 *   short:   Strip context suffix AND "Claude " prefix (e.g. "Opus 4.6")
 */
export type ModelFormatMode = 'full' | 'compact' | 'short';
/**
 * Agent display format:
 *   compact  - Single-line per agent: ◐ explore [haiku]: desc (2m 15s)
 *   multiline - Tree-style per agent: ├─ e explore  45s  searching for test files
 */
export type AgentsFormat = 'compact' | 'multiline';
/**
 * Todos display format:
 *   line      - Single-line summary (existing behaviour)
 *   checklist - Multi-line: last-completed + active + next-pending
 */
export type TodosFormat = 'line' | 'checklist';
export type HudElement = 'project' | 'context' | 'usage' | 'memory' | 'environment' | 'tools' | 'agents' | 'todos';
export type HudColorName = 'dim' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan' | 'brightBlue' | 'brightMagenta';
/** A color value: named preset, 256-color index (0-255), or hex string (#rrggbb). */
export type HudColorValue = HudColorName | number | string;
export interface HudColorOverrides {
    context: HudColorValue;
    usage: HudColorValue;
    warning: HudColorValue;
    usageWarning: HudColorValue;
    critical: HudColorValue;
    model: HudColorValue;
    project: HudColorValue;
    git: HudColorValue;
    gitBranch: HudColorValue;
    label: HudColorValue;
    custom: HudColorValue;
}
export declare const DEFAULT_ELEMENT_ORDER: HudElement[];
export interface HudConfig {
    language: Language;
    lineLayout: LineLayoutType;
    showSeparators: boolean;
    pathLevels: 1 | 2 | 3;
    elementOrder: HudElement[];
    gitStatus: {
        enabled: boolean;
        showDirty: boolean;
        showAheadBehind: boolean;
        showFileStats: boolean;
        pushWarningThreshold: number;
        pushCriticalThreshold: number;
    };
    display: {
        showModel: boolean;
        showProject: boolean;
        showContextBar: boolean;
        contextValue: ContextValueMode;
        showConfigCounts: boolean;
        showCost: boolean;
        showDuration: boolean;
        showSpeed: boolean;
        showTokenBreakdown: boolean;
        showUsage: boolean;
        usageBarEnabled: boolean;
        alwaysShowWeekly: boolean;
        showTools: boolean;
        mergeEnvWithTools: boolean;
        showAgents: boolean;
        agentsFormat: AgentsFormat;
        agentsMaxLines: number;
        showTodos: boolean;
        /**
         * When true (and terminal is wide enough), render `agents` and `todos`
         * as side-by-side columns separated by ` │ `. Falls back to stacked
         * layout when `terminalWidth < columnsMinWidth` or either column empty.
         */
        columns: boolean;
        /** Todos rendering mode: `line` (single-line summary) or `checklist` (multi-line). */
        todosFormat: TodosFormat;
        /**
         * Minimum terminal width (in columns) required to activate the
         * side-by-side `columns` layout. Clamped to [60, 500].
         *
         * Default `100` leaves ~48 chars per column after the ` │ ` separator
         * ((100 - 3) / 2 = 48). The agents-multiline renderer consumes ~24
         * chars of overhead per row (icon + shortName(12) + duration(4) +
         * spacing), leaving ~24 chars for the description at the minimum --
         * tight but acceptable. Bump to `120` for roomier descriptions.
         */
        columnsMinWidth: number;
        showSessionName: boolean;
        showClaudeCodeVersion: boolean;
        showMemoryUsage: boolean;
        showSessionTokens: boolean;
        showOutputStyle: boolean;
        autocompactBuffer: AutocompactBufferMode;
        usageThreshold: number;
        sevenDayThreshold: number;
        environmentThreshold: number;
        modelFormat: ModelFormatMode;
        modelOverride: string;
        customLine: string;
    };
    colors: HudColorOverrides;
}
export declare const DEFAULT_CONFIG: HudConfig;
export declare function getConfigPath(): string;
export declare function mergeConfig(userConfig: Partial<HudConfig>): HudConfig;
export declare function loadConfig(): Promise<HudConfig>;
//# sourceMappingURL=config.d.ts.map