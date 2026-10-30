// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '@pixel-brewery/synapse-core';
import { AccountCooldowns } from './AccountCooldowns.js';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';

// #endregion

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('AccountCooldowns', () => {
    it('shares only explicit account capacity across sibling routes and isolates host scopes', () => {
        // Arrange
        const cooldowns = new AccountCooldowns(new MemoryRoutingStore(), { now: () => 1000 });
        const failure = new AiError('quota', 'capacity', {
            capacityScope: 'account',
            retryAt: 5000,
        });

        cooldowns.recordFailure('app', 'account', failure);

        // Act
        const active = cooldowns.active('app', 'account');

        // Assert
        expect(active?.retryAt).toBe(5000);
        expect(cooldowns.active('other-app', 'account')).toBeUndefined();
        expect(cooldowns.active('app', 'other-account')).toBeUndefined();
    });

    it.each([undefined, 'model'] as const)(
        'does not pause an account for %s scoped 429 evidence',
        (capacityScope) => {
            // Arrange
            const cooldowns = new AccountCooldowns();

            // Act
            const result = cooldowns.recordFailure(
                'app',
                'account',
                new AiError('rate-limit', 'capacity', { capacityScope }),
            );

            // Assert
            expect(result).toBeUndefined();
            expect(cooldowns.active('app', 'account')).toBeUndefined();
        },
    );

    it('clamps far-future reset hints and removes only the expired account pause', () => {
        // Arrange
        let now = 1000;
        const store = new MemoryRoutingStore();
        const cooldowns = new AccountCooldowns(store, {
            now: () => now,
            rateLimitMilliseconds: 10,
            quotaMilliseconds: 20,
            maximumMilliseconds: 100,
        });

        cooldowns.recordFailure(
            'app',
            'account',
            new AiError('quota', 'capacity', { capacityScope: 'account', retryAt: 999999 }),
        );

        // Act
        const before = cooldowns.active('app', 'account');

        now = 1100;

        const after = cooldowns.active('app', 'account');

        // Assert
        expect(before?.retryAt).toBe(1100);
        expect(after).toBeUndefined();
        expect(store.loadCooldown('app', 'account')).toBeUndefined();
    });
});
