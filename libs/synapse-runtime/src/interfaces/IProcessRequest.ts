// #region Imports

import type { IInteractiveProcess } from './IInteractiveProcess.js';

// #endregion

/**
 * Explicit subprocess intent; runtime owns launch, bounds, stream decoding and teardown.
 *
 * @public
 */
export interface IProcessRequest {
    /**
     * Resolved executable or CLI name to find through this request's environment.
     */
    readonly executable: string;

    /**
     * Native argument vector, never an interpolated shell command.
     */
    readonly args: readonly string[];

    /**
     * Existing working directory for this process.
     */
    readonly workingDirectory: string;

    /**
     * Complete allowlisted environment, supplied explicitly by the profile owner.
     */
    readonly environment: Readonly<Record<string, string>>;

    /**
     * Initial stdin payload; may contain sensitive prompt or credentials.
     */
    readonly input?: string;

    /**
     * Whether stdin stays open for an interactive authentication procedure; default false.
     */
    readonly keepInputOpen?: boolean;

    /**
     * Cancellation stops and awaits the process tree.
     */
    readonly signal?: AbortSignal;

    /**
     * Elapsed timeout in milliseconds; default 5 minutes, at most 2147483647 for the native runner.
     */
    readonly timeoutMs?: number;

    /**
     * Combined stdout/stderr byte budget; default 4 MiB.
     */
    readonly maxOutputBytes?: number;

    /**
     * Optional serialized stdout callback; exceptions cancel and drain the process.
     *
     * @param chunk - UTF-8 text decoded across native byte-fragment boundaries.
     * @returns Optional asynchronous processing completion.
     */
    readonly onStdout?: (chunk: string) => void | Promise<void>;

    /**
     * Optional serialized stderr callback, with the same failure semantics.
     *
     * @param chunk - Native stderr text; treat as untrusted and sensitive.
     * @returns Optional asynchronous processing completion.
     */
    readonly onStderr?: (chunk: string) => void | Promise<void>;

    /**
     * Supplies interactive stdin controls immediately after spawn.
     *
     * @param process - Controls restricted to the owned subprocess.
     */
    readonly onStart?: (process: IInteractiveProcess) => void;
}
