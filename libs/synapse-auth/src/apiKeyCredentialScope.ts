// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiInstance } from '@pixel-brewery/synapse-core';
import type { IApiKeyCredentialScope } from './interfaces/IApiKeyCredentialScope.js';

// #endregion

/**
 * Captures the canonical storage identity for one authorized API-key connection.
 *
 * @param instance - Backend-selected application/account/provider connection; never browser authority.
 * @returns A detached, frozen scope shared by authentication and backend secret resolution.
 * @throws An AiError when any identity is empty, contains controls or exceeds 512 characters.
 * @remarks This function performs no credential read or authorization. The backend first resolves
 * the authorized instance, then uses this same scope with ApiKeyStoreBase when configuring its
 * Vercel AI SDK provider. No native paths, instance environment or credential values are copied.
 *
 * @public
 */
export function apiKeyCredentialScope(instance: IAiInstance): IApiKeyCredentialScope {
    if (!instance || typeof instance !== 'object' || !instance.profile)
        throw new AiError('configuration', 'The API-key connection identity is invalid.');

    const scope = {
        applicationId: instance.profile.applicationId,
        accountId: instance.profile.accountId,
        driverId: instance.driverId,
        instanceId: instance.id,
        profileId: instance.profile.id,
    };

    if (
        Object.values(scope).some(
            (value) =>
                typeof value !== 'string' ||
                !value.trim() ||
                value.length > 512 ||
                [...value].some(
                    (character) =>
                        character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f,
                ),
        )
    )
        throw new AiError('configuration', 'The API-key connection identity is invalid.');

    return Object.freeze(scope);
}
