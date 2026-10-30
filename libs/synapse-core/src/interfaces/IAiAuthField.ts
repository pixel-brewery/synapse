/**
 * One declared input for a native credentials interaction.
 *
 * @public
 */
export interface IAiAuthField {
    /**
     * Stable input identity used in the response values map.
     */
    readonly id: string;

    /**
     * User-facing input label.
     */
    readonly label: string;

    /**
     * Whether the value is a secret and must never be logged.
     */
    readonly secret: boolean;

    /**
     * Whether a response must include this input.
     */
    readonly required?: boolean;
}
