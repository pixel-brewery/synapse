// #region Imports

import type { IAiInstance } from '@pixel-brewery/synapse-core';
import { createProfileEnvironment } from '@pixel-brewery/synapse-runtime';
import { prepareClaudeHome } from './prepareClaudeHome.js';

// #endregion

/**
 * Creates the isolated native Claude environment, including explicit secure-storage identity.
 *
 * @param instance - Selected application/account profile and explicit environment additions.
 * @returns An allowlisted profile environment without ambient provider credentials.
 * @throws An AiError for private directory or native secure-storage preparation failure.
 *
 * @public
 */
export async function createClaudeEnvironment(
    instance: IAiInstance,
): Promise<Readonly<Record<string, string>>> {
    const environment = await createProfileEnvironment(instance, {
        CLAUDE_CONFIG_DIR: instance.profile.paths.configuration,
        CLAUDE_SECURESTORAGE_CONFIG_DIR: instance.profile.paths.configuration,
        CLAUDE_CODE_SAFE_MODE: '1',
    });

    await prepareClaudeHome(instance);

    return environment;
}
