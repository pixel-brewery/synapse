/**
 * Bounded captured output and native completion status of one owned subprocess.
 *
 * @public
 */
export interface IProcessResult {
    /**
     * Decoded standard output, bounded by the requested combined output budget.
     */
    readonly stdout: string;

    /**
     * Decoded standard error; never expose this raw value in user-facing diagnostics.
     */
    readonly stderr: string;

    /**
     * Native exit status, or null when terminated by a signal.
     */
    readonly exitCode: number | null;

    /**
     * Native termination signal name, if any.
     */
    readonly signal: string | null;
}
