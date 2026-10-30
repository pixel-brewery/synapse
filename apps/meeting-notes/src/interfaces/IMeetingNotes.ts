/**
 * Host-owned structured notes decoded from a completed AI text operation.
 *
 * @internal
 */
export interface IMeetingNotes {
    /**
     * Concise meeting summary.
     */
    readonly summary: string;

    /**
     * Decisions explicitly present in the supplied transcript.
     */
    readonly decisions: readonly string[];

    /**
     * Follow-up actions and optional explicitly mentioned owners.
     */
    readonly tasks: readonly {
        /**
         * Action to complete.
         */
        readonly description: string;

        /**
         * Named person, if one was stated.
         */
        readonly owner?: string;
    }[];
}
