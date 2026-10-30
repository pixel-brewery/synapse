/**
 * Explicit stdin and termination controls for a live native authentication process.
 *
 * @public
 */
export interface IInteractiveProcess {
    /**
     * Writes input to the owned process without logging its contents.
     *
     * @param value - Native procedure input, possibly a secret.
     */
    write(value: string): void;

    /**
     * Closes stdin after the final native procedure input.
     */
    end(): void;

    /**
     * Stops and awaits the owned process tree.
     *
     * @returns Completion of bounded process-tree cleanup.
     */
    stop(): Promise<void>;
}
