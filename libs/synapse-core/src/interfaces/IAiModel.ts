/**
 * Safe provider metadata, distinct from consumer model-catalog policy.
 *
 * @public
 */
export interface IAiModel {
    /**
     * Provider-supplied model description, without consumer catalog policy.
     */
    readonly description?: string;

    /**
     * Whether the provider advertises this as its native default.
     */
    readonly isDefault?: boolean;

    /**
     * Provider-advertised default reasoning setting, if known.
     */
    readonly defaultReasoningEffort?: string;

    /**
     * Safe explanations keyed by the advertised native reasoning setting.
     */
    readonly reasoningDescriptions?: Readonly<Record<string, string>>;

    /**
     * Provider-native model identifier.
     */
    readonly id: string;

    /**
     * Optional provider-supplied display name.
     */
    readonly name?: string;

    /**
     * Advertised native reasoning settings, if known.
     */
    readonly reasoningEfforts?: readonly string[];
}
