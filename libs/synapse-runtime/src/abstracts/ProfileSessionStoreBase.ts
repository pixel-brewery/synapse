// #region Imports

import type { IAiInstance, IAiProfile } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Persistent authentication-generation boundary, independent of native provider credentials.
 *
 * @public
 */
export abstract class ProfileSessionStoreBase {
    // #region Methods

    /**
     * Binds native continuations to the current driver, configuration, environment and stable profile paths.
     *
     * @param instance - Explicit instance whose profile the caller exclusively owns.
     * @returns Current generation; the first binding preserves an absent legacy generation.
     * @throws An AiError on unsupported or oversized configuration, unknown persisted versions or persistence failure.
     * @remarks Changing an existing configuration binding advances the generation before native execution. Implementations must not persist configuration or environment plaintext. Temporary execution directories do not affect this binding.
     *
     * @public
     */
    public abstract bind(instance: IAiInstance): Promise<string | undefined>;

    /**
     * Reads the current generation without creating or resetting missing/unknown state.
     *
     * @param profile - Explicit application/account profile.
     * @returns Persisted generation, or undefined before its first credential or configuration transition.
     * @throws An AiError when existing state is malformed, belongs to another profile or cannot be read.
     *
     * @public
     */
    public abstract read(profile: IAiProfile): Promise<string | undefined>;

    /**
     * Advances the generation after execution drains and before credentials change.
     *
     * @param profile - Explicit profile exclusively owned by the caller.
     * @returns Newly persisted generation, distinct from the previous one.
     * @throws An AiError on invalid/unknown state or persistence failure; native mutation must not proceed.
     *
     * @public
     */
    public abstract advance(profile: IAiProfile): Promise<string>;

    // #endregion
}
