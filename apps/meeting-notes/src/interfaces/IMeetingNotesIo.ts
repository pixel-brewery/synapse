/**
 * Explicit host CLI presentation and protected input boundary.
 *
 * @internal
 */
export interface IMeetingNotesIo {
    /**
     * Writes the final JSON result.
     *
     * @param value - Serialized host result, without credentials.
     */
    output(value: string): void;

    /**
     * Presents progress or explicit login instructions on stderr.
     *
     * @param value - Safe diagnostic or native authentication instruction.
     */
    diagnostic(value: string): void;

    /**
     * Requests native login input without recording its value.
     *
     * @param label - Native input label.
     * @param secret - Whether terminal echo must remain disabled.
     * @param signal - Cancellation when the native login completes or expires.
     * @returns In-memory input provided by the user.
     */
    input(label: string, secret: boolean, signal: AbortSignal): Promise<string>;
}
