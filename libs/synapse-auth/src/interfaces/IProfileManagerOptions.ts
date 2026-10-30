/**
 * Application-owned storage options for isolated CLI profiles.
 *
 * @public
 */
export interface IProfileManagerOptions {
    /**
     * Absolute private storage root. Construction performs no filesystem access.
     */
    readonly rootDirectory: string;

    /**
     * Maximum remembered profile mappings per manager; defaults to 1024.
     */
    readonly maxProfiles?: number;
}
