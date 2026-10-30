/**
 * One externally supplied native-process response, without importing a concrete AI provider.
 *
 * @public
 */
export interface IProcessReplay {
    /**
     * Optional expected executable; mismatches reject rather than replaying the wrong procedure.
     */
    readonly executable?: string;

    /**
     * Optional exact expected argument vector; no prompts or credentials are recorded by the runner.
     */
    readonly args?: readonly string[];

    /**
     * Ordered standard-output fragments, retaining the external protocol's actual framing.
     */
    readonly stdout?: readonly string[];

    /**
     * Ordered standard-error fragments; consumers must redact them before presentation.
     */
    readonly stderr?: readonly string[];

    /**
     * Native status, defaulting to zero.
     */
    readonly exitCode?: number | null;

    /**
     * Native signal name, defaulting to null.
     */
    readonly signal?: string | null;

    /**
     * Whether the external process remains live after its fragments until cancellation or stop.
     */
    readonly waitForStop?: boolean;

    /**
     * Optional explicit observer for native stdin, which may contain secrets.
     *
     * @param value - Original stdin data; the replay runner itself never stores or logs it.
     */
    readonly onInput?: (value: string) => void;
}
