// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';

// #endregion

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('MemoryRoutingStore', () => {
    it('refuses overflow while retaining an active account pause', () => {
        // Arrange
        const store = new MemoryRoutingStore(1);

        store.saveCooldown({
            schemaVersion: 1,
            scopeId: 'app',
            accountId: 'a',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
        });

        // Act
        const save = () =>
            store.saveCooldown({
                schemaVersion: 1,
                scopeId: 'app',
                accountId: 'b',
                reason: 'quota',
                observedAt: 100,
                retryAt: 200,
            });

        // Assert
        expect(save).toThrow(expect.objectContaining({ code: 'persistence' }));
        expect(store.loadCooldown('app', 'a')?.retryAt).toBe(200);
        expect(store.loadCooldown('app', 'b')).toBeUndefined();
    });

    it('removes only the selected scope and allows its released capacity to be reused', () => {
        // Arrange
        const store = new MemoryRoutingStore(2);

        store.saveCooldown({
            schemaVersion: 1,
            scopeId: 'app',
            accountId: 'a',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
        });
        store.saveCooldown({
            schemaVersion: 1,
            scopeId: 'other',
            accountId: 'a',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
        });

        // Act
        store.clearScope('app');
        store.saveCooldown({
            schemaVersion: 1,
            scopeId: 'new',
            accountId: 'b',
            reason: 'quota',
            observedAt: 100,
            retryAt: 200,
        });

        // Assert
        expect(store.loadCooldown('other', 'a')).toBeDefined();
        expect(store.loadCooldown('app', 'a')).toBeUndefined();
        expect(store.loadCooldown('new', 'b')).toBeDefined();
    });
});
