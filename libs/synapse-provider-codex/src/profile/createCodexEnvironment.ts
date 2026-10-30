// #region Imports

import type { IAiInstance } from '@pixel-brewery/synapse-core';
import { createProfileEnvironment } from '@pixel-brewery/synapse-runtime';
import { join } from 'node:path';

// #endregion

/**
 * Creates the isolated native Codex environment for an explicit operation.
 *
 * @param instance - Application/account instance with explicit legacy-compatible paths.
 * @param codexHome - Native credential or execution home selected by the operation.
 * @returns An allowlisted environment with profile-bound native state locations.
 *
 * @public
 */
export async function createCodexEnvironment(
    instance: IAiInstance,
    codexHome = instance.profile.paths.credentials,
): Promise<Readonly<Record<string, string>>> {
    return createProfileEnvironment(instance, {
        CODEX_HOME: codexHome,
        CODEX_SQLITE_HOME:
            instance.profile.paths.sqlite ?? join(instance.profile.paths.execution, 'sqlite'),
    });
}
