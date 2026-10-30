// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiAuthStatus } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Validates native status metadata and omits provider-supplied free-form output.
 *
 * @param value - Unknown native adapter status.
 * @returns Bounded safe account metadata with no credential values or raw CLI message.
 * @throws An AiError when status violates the native inspection contract.
 *
 * @internal
 */
export function normalizeAuthStatus(value: unknown): IAiAuthStatus {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('authenticated' in value) ||
        typeof value.authenticated !== 'boolean'
    ) {
        throw new AiError('protocol', 'The native authentication status was malformed.');
    }

    const field = (name: string): string | undefined => {
        const item: unknown = name in value ? Reflect.get(value, name) : undefined;

        if (item === undefined) return undefined;

        if (
            typeof item !== 'string' ||
            item.length > 1024 ||
            [...item].some(
                (character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f,
            )
        ) {
            throw new AiError('protocol', 'The native authentication metadata was malformed.');
        }

        return item;
    };
    const accountId = field('accountId');
    const displayName = field('displayName');
    const plan = field('plan');
    const method = field('method');

    return Object.freeze({
        authenticated: value.authenticated,
        ...(accountId !== undefined ? { accountId } : {}),
        ...(displayName !== undefined ? { displayName } : {}),
        ...(plan !== undefined ? { plan } : {}),
        ...(method !== undefined ? { method } : {}),
        ...(!value.authenticated
            ? { message: 'The native CLI account is not authenticated.' }
            : {}),
    });
}
