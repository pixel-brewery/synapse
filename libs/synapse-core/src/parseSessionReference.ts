// #region Imports

import { AiError } from './errors/AiError.js';
import type { IAiSessionReference } from './interfaces/IAiSessionReference.js';
import { validateSessionReference } from './validateSessionReference.js';

// #endregion

/**
 * Decodes a stored binding without stamping current credentials onto legacy native IDs.
 *
 * @param value - Opaque host continuation text, possibly a pre-Synapse native ID.
 * @returns Complete original binding, or undefined for a non-versioned legacy native ID.
 * @throws An AiError for malformed references or unsupported newer versions.
 * @remarks Unknown versions fail as configuration errors so a downgraded host does not silently clear newer state.
 *
 * @public
 */
export function parseSessionReference(value: string): IAiSessionReference | undefined {
    if (!value.startsWith('synapse-session:')) return undefined;

    if (!value.startsWith('synapse-session:v1:'))
        throw new AiError('configuration', 'The continuation reference version is unsupported.');

    if (value.length > 131_072)
        throw new AiError(
            'session-unavailable',
            'The continuation reference exceeded its storage budget.',
            { sessionUsable: false },
        );

    let decoded: unknown;

    try {
        decoded = JSON.parse(value.slice('synapse-session:v1:'.length));
    } catch (cause) {
        throw new AiError('session-unavailable', 'The continuation reference is malformed.', {
            cause,
            sessionUsable: false,
        });
    }

    return validateSessionReference(decoded);
}
