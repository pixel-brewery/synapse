// #region Imports

import { describe, expect, it } from 'vitest';
import { AiError } from './errors/AiError.js';
import type { IAiSessionReference } from './interfaces/IAiSessionReference.js';
import { encodeSessionReference } from './encodeSessionReference.js';
import { parseSessionReference } from './parseSessionReference.js';

// #endregion

const binding: IAiSessionReference = {
    driverId: 'fixture-driver',
    instanceId: 'fixture-instance',
    profileId: 'fixture-profile',
    candidateId: 'fixture-candidate',
    nativeId: 'fixture-native-session',
    authenticationGeneration: 'fixture_generation-2',
};

describe('encodeSessionReference', () => {
    it('roundtrips every original binding field and generation without mutating the caller', () => {
        // Arrange
        const original = Object.freeze({ ...binding, unrelatedHostValue: 'not-a-session-field' });
        const before = { ...original };

        // Act
        const encoded = encodeSessionReference(original);
        const decoded = parseSessionReference(encoded);

        // Assert
        expect(decoded).toEqual(binding);
        expect(decoded).not.toBe(original);
        expect(original).toEqual(before);
        expect(encoded).not.toContain('unrelatedHostValue');
    });

    it('preserves generation absence instead of introducing a current authentication binding', () => {
        // Arrange
        const original: IAiSessionReference = {
            driverId: binding.driverId,
            instanceId: binding.instanceId,
            profileId: binding.profileId,
            candidateId: binding.candidateId,
            nativeId: binding.nativeId,
        };

        // Act
        const decoded = parseSessionReference(encodeSessionReference(original));

        // Assert
        expect(decoded).toEqual(original);
        expect(decoded).not.toHaveProperty('authenticationGeneration');
    });

    it.each([
        { name: 'blank native identifier', reference: { ...binding, nativeId: ' ' } },
        {
            name: 'oversized native identifier',
            reference: { ...binding, nativeId: 'x'.repeat(4097) },
        },
        { name: 'empty generation', reference: { ...binding, authenticationGeneration: '' } },
        {
            name: 'unsafe generation',
            reference: { ...binding, authenticationGeneration: 'account/new' },
        },
        {
            name: 'oversized generation',
            reference: { ...binding, authenticationGeneration: 'g'.repeat(129) },
        },
    ])('rejects $name before creating a persisted reference', ({ reference }) => {
        // Arrange
        const candidate = { ...reference };

        // Act
        const encode = () => encodeSessionReference(candidate);

        // Assert
        expect(encode).toThrow(AiError);
        expect(encode).toThrow(
            expect.objectContaining({ code: 'session-unavailable', sessionUsable: false }),
        );
    });
});
