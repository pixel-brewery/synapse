/**
 * Execution guarantees that a driver actually implements.
 *
 * @public
 */
export interface IAiCapabilities {
    /**
     * Native execution policies that can be enforced before launch.
     */
    readonly modes: readonly ('read-only' | 'workspace-write')[];

    /**
     * Whether native sessions can be resumed for the same profile/candidate.
     */
    readonly resume: boolean;

    /**
     * Native schema support or local result validation availability.
     */
    readonly structuredOutput: 'native' | 'validated' | 'none';

    /**
     * Whether the driver supports agent tool operations.
     */
    readonly tools: boolean;
}
