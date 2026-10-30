// #region Imports

import { describe, expect, it } from 'vitest';
import { AiError } from './errors/AiError.js';
import { parseSessionReference } from './parseSessionReference.js';

// #endregion

const binding = {
    driverId: 'fixture-driver',
    instanceId: 'fixture-instance',
    profileId: 'fixture-profile',
    candidateId: 'fixture-candidate',
    nativeId: 'fixture-native-session',
    authenticationGeneration: 'fixture_generation-2',
};

describe('parseSessionReference', () => {
    it('restores the original complete binding and authentication generation', () => {
        // Arrange
        const encoded = 'synapse-session:v1:' + JSON.stringify(binding);

        // Act
        const decoded = parseSessionReference(encoded);

        // Assert
        expect(decoded).toEqual(binding);
        expect(decoded).not.toBe(binding);
    });

    it.each(['fixture-native-session', 'legacy-session:with-provider-punctuation'])(
        'leaves the raw legacy native reference %s unbound',
        (reference) => {
            // Arrange
            // Act
            const decoded = parseSessionReference(reference);

            // Assert
            expect(decoded).toBeUndefined();
        },
    );

    it('rejects a future version as configuration instead of silently treating it as legacy', () => {
        // Arrange
        const encoded = 'synapse-session:v2:' + JSON.stringify(binding);

        // Act
        const parse = () => parseSessionReference(encoded);

        // Assert
        expect(parse).toThrow(AiError);
        expect(parse).toThrow(expect.objectContaining({ code: 'configuration' }));
    });

    it.each(['', '{', 'null', '[]', '42', '"native-session"'])(
        'rejects malformed versioned payload %s as an unusable session',
        (payload) => {
            // Arrange
            const encoded = 'synapse-session:v1:' + payload;

            // Act
            const parse = () => parseSessionReference(encoded);

            // Assert
            expect(parse).toThrow(AiError);
            expect(parse).toThrow(
                expect.objectContaining({ code: 'session-unavailable', sessionUsable: false }),
            );
        },
    );

    it.each(['driverId', 'instanceId', 'profileId', 'candidateId', 'nativeId'])(
        'rejects a missing %s rather than rebinding an incomplete continuation',
        (missingField) => {
            // Arrange
            const incomplete = Object.fromEntries(
                Object.entries(binding).filter(([key]) => key !== missingField),
            );
            const encoded = 'synapse-session:v1:' + JSON.stringify(incomplete);

            // Act
            const parse = () => parseSessionReference(encoded);

            // Assert
            expect(parse).toThrow(
                expect.objectContaining({ code: 'session-unavailable', sessionUsable: false }),
            );
        },
    );

    it('rejects an invalid serialized generation without assigning current credentials', () => {
        // Arrange
        const encoded =
            'synapse-session:v1:' + JSON.stringify({ ...binding, authenticationGeneration: 2 });

        // Act
        const parse = () => parseSessionReference(encoded);

        // Assert
        expect(parse).toThrow(
            expect.objectContaining({ code: 'session-unavailable', sessionUsable: false }),
        );
    });

    it('enforces the envelope budget even when the binding fields themselves are valid', () => {
        // Arrange
        const encoded =
            'synapse-session:v1:' +
            JSON.stringify({ ...binding, oversizedData: 'x'.repeat(131_072) });

        // Act
        const parse = () => parseSessionReference(encoded);

        // Assert
        expect(parse).toThrow(
            expect.objectContaining({ code: 'session-unavailable', sessionUsable: false }),
        );
    });
});
