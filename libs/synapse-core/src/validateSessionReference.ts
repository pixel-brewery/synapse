// #region Imports

import { AiError } from './errors/AiError.js';
import type { IAiSessionReference } from './interfaces/IAiSessionReference.js';

// #endregion

/**
 * Validates the serialized neutral continuation boundary without importing Node or providers.
 *
 * @param value - Unknown decoded reference.
 * @returns A safe projection containing only supported binding fields.
 * @throws An AiError when the reference is malformed.
 *
 * @internal
 */
export function validateSessionReference(value: unknown): IAiSessionReference {
    if (!value || typeof value !== 'object') throw invalid();

    const text = (key: string): string => {
        if (!(key in value)) throw invalid();

        const result: unknown = Reflect.get(value, key);

        if (typeof result !== 'string' || !result.trim() || result.length > 4096) throw invalid();

        return result;
    };
    const generation: unknown =
        'authenticationGeneration' in value ? value.authenticationGeneration : undefined;

    if (
        generation !== undefined &&
        (typeof generation !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(generation))
    )
        throw invalid();

    return {
        driverId: text('driverId'),
        instanceId: text('instanceId'),
        profileId: text('profileId'),
        candidateId: text('candidateId'),
        nativeId: text('nativeId'),
        ...(generation !== undefined ? { authenticationGeneration: generation } : {}),
    };
}

function invalid(): AiError {
    return new AiError('session-unavailable', 'The continuation reference is malformed.', {
        sessionUsable: false,
    });
}
