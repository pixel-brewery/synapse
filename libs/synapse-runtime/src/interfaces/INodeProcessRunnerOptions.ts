/**
 * Native process ownership budgets, independent of a particular CLI.
 *
 * @public
 */
export interface INodeProcessRunnerOptions {
    /**
     * Unix graceful termination window before SIGKILL, default 500 milliseconds.
     */
    readonly terminationGraceMs?: number;

    /**
     * Maximum concurrent owned subprocesses, default 32.
     */
    readonly maximumProcesses?: number;
}
