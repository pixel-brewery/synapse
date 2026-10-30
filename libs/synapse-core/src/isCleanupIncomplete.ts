/**
 * Recognizes an explicitly unconfirmed process-cleanup failure through bounded Error causes and aggregates.
 *
 * @param value - Native, runtime or host error whose ownership outcome is being assessed.
 * @returns Whether one of at most sixteen inspected Error nodes carries cleanupIncomplete=true.
 * @remarks Cycles and untyped non-Error values stop traversal. A true result must block new work and credential mutations for the affected profile until the host confirms owned processes have stopped.
 *
 * @public
 */
export function isCleanupIncomplete(value: unknown): boolean {
    const visited = new Set<Error>();
    const pending: unknown[] = [value];

    while (pending.length && visited.size < 16) {
        const current = pending.pop();

        if (!(current instanceof Error) || visited.has(current)) continue;

        if ('cleanupIncomplete' in current && current.cleanupIncomplete === true) return true;

        visited.add(current);

        if (current instanceof AggregateError) {
            const errors: unknown = current.errors;

            if (Array.isArray(errors)) {
                for (const error of errors.slice(0, Math.max(0, 15 - pending.length)))
                    pending.push(error);
            }
        }

        if (pending.length < 16 && current.cause instanceof Error) pending.push(current.cause);
    }

    return false;
}
