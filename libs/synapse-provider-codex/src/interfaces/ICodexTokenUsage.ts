/**
 * Native account usage statistics, distinct from per-turn token usage.
 *
 * @public
 */
export interface ICodexTokenUsage {
    /**
     * Native lifetime token total when reported.
     */
    readonly lifetimeTokens?: number;

    /**
     * Native highest daily token total when reported.
     */
    readonly peakDailyTokens?: number;

    /**
     * Native current activity streak in calendar days.
     */
    readonly currentStreakDays?: number;
}
