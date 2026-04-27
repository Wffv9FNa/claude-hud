import { yellow, green, dim, label } from "./colors.js";
import { t } from "../i18n/index.js";
export function renderTodosLine(ctx) {
    const { todos } = ctx.transcript;
    const colors = ctx.config?.colors;
    if (!todos || todos.length === 0) {
        return null;
    }
    const format = ctx.config?.display?.todosFormat ?? 'line';
    if (format === 'checklist') {
        return renderChecklist(todos, colors);
    }
    return renderLine(todos, colors);
}
function renderLine(todos, colors) {
    const inProgress = todos.find((todo) => todo.status === "in_progress");
    const completed = todos.filter((todo) => todo.status === "completed").length;
    const total = todos.length;
    if (!inProgress) {
        if (completed === total && total > 0) {
            return `${green("✓")} ${t("status.allTodosComplete")} ${label(`(${completed}/${total})`, colors)}`;
        }
        return null;
    }
    const content = truncateContent(inProgress.content);
    const progress = label(`(${completed}/${total})`, colors);
    return `${yellow("▸")} ${content} ${progress}`;
}
function renderChecklist(todos, colors) {
    if (todos.length === 0) {
        return null;
    }
    const completedItems = todos.filter((t) => t.status === "completed");
    const lastCompleted = completedItems.length > 0
        ? completedItems[completedItems.length - 1]
        : null;
    const inProgress = todos.find((t) => t.status === "in_progress") ?? null;
    const nextPending = todos.find((t) => t.status === "pending") ?? null;
    const completedCount = completedItems.length;
    const total = todos.length;
    const progress = label(`(${completedCount}/${total})`, colors);
    const lines = [];
    if (lastCompleted) {
        lines.push(`${green("✓")} ${dim(truncateContent(lastCompleted.content))}`);
    }
    if (inProgress) {
        lines.push(`${yellow("▸")} ${truncateContent(inProgress.content)} ${progress}`);
    }
    if (nextPending) {
        lines.push(`${label("○", colors)} ${label(truncateContent(nextPending.content), colors)}`);
    }
    if (lines.length === 0) {
        // All items exist but none match the three categories -- shouldn't happen
        // given the status enum, but guard for safety.
        return null;
    }
    // If we have no in-progress line, progress summary still belongs somewhere.
    if (!inProgress) {
        lines.push(progress);
    }
    return lines.join('\n');
}
function truncateContent(content, maxLen = 50) {
    if (content.length <= maxLen)
        return content;
    return content.slice(0, maxLen - 3) + "...";
}
//# sourceMappingURL=todos-line.js.map