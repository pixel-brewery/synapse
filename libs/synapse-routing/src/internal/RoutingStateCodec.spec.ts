// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutingStateCodec } from './RoutingStateCodec.js';

// #endregion

afterEach(() => vi.restoreAllMocks());

describe('RoutingStateCodec', () => {
    it('rejects an unknown persisted version without modifying the original data', () => {
        // Arrange
        const persisted = {
            schemaVersion: 2,
            scopeId: 'app',
            accountId: 'account',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
        };

        // Act
        const decode = () => RoutingStateCodec.cooldown(persisted);

        // Assert
        expect(decode).toThrow(expect.objectContaining({ code: 'persistence' }));
        expect(persisted.schemaVersion).toBe(2);
    });

    it('rejects invalid telemetry counters at the persisted-data boundary', () => {
        // Arrange
        const persisted = {
            schemaVersion: 1,
            scopeId: 'app',
            kind: 'candidate',
            id: 'a',
            attemptCount: -1,
            successCount: 0,
            failureCount: 0,
            consecutiveFailures: 0,
        };

        // Act
        const decode = () => RoutingStateCodec.telemetry(persisted);

        // Assert
        expect(decode).toThrow(expect.objectContaining({ code: 'persistence' }));
    });

    it('projects only defined safe routing fields from untrusted persisted data', () => {
        // Arrange
        const persisted = {
            schemaVersion: 1,
            scopeId: 'app',
            accountId: 'account',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
            unexpected: 'private source data',
        };

        // Act
        const decoded = RoutingStateCodec.cooldown(persisted);

        // Assert
        expect(decoded).toEqual({
            schemaVersion: 1,
            scopeId: 'app',
            accountId: 'account',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
        });
    });
});
