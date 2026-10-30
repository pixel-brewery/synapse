// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '@pixel-brewery/synapse-core';
import { RouteGovernor } from './RouteGovernor.js';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';
import type { IRoute } from '../interfaces/IRoute.js';
import type { IRouteTelemetry } from '../interfaces/IRouteTelemetry.js';
import type { RouteStrategy } from '../models/RouteStrategy.js';

// #endregion

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function route(strategy: RouteStrategy = 'priority'): IRoute {
    return {
        id: 'route',
        scopeId: 'app',
        strategy,
        candidates: [
            {
                id: 'a',
                instanceId: 'one',
                accountId: 'account-a',
                priority: 0,
                costClass: 'paid',
                qualityScore: 20,
                sessionAffinity: true,
            },
            {
                id: 'b',
                instanceId: 'two',
                accountId: 'account-b',
                priority: 1,
                costClass: 'local',
                qualityScore: 90,
            },
        ],
    };
}

function history(id: string, values: Partial<IRouteTelemetry>): IRouteTelemetry {
    return {
        schemaVersion: 1,
        scopeId: 'app',
        kind: 'candidate',
        id,
        attemptCount: 0,
        successCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
        ...values,
    };
}

describe('RouteGovernor', () => {
    it.each<[RouteStrategy, string]>([
        ['priority', 'a'],
        ['quality-first', 'b'],
        ['last-known-good', 'b'],
        ['lowest-cost', 'b'],
        ['lowest-latency', 'b'],
        ['most-reliable', 'b'],
        ['least-used', 'b'],
        ['reset-aware', 'b'],
        ['balanced', 'b'],
    ])('preserves the %s selection strategy', (strategy, expected) => {
        // Arrange
        const store = new MemoryRoutingStore();

        store.saveTelemetry(
            history('a', {
                attemptCount: 6,
                successCount: 2,
                failureCount: 2,
                consecutiveFailures: 2,
                averageLatencyMilliseconds: 100,
                lastSuccessAt: 100,
                lastAttemptAt: 10,
            }),
        );
        store.saveTelemetry(
            history('b', {
                attemptCount: 1,
                successCount: 1,
                averageLatencyMilliseconds: 50,
                lastSuccessAt: 200,
                lastAttemptAt: 20,
            }),
        );

        const governor = new RouteGovernor(store);

        // Act
        const ordered = governor.order(route(strategy));

        // Assert
        expect(ordered[0]?.id).toBe(expected);
    });

    it('applies native session affinity only to an explicitly opted-in matching candidate', () => {
        // Arrange
        const governor = new RouteGovernor();

        // Act
        const ordered = governor.order(route('quality-first'), 'a');

        // Assert
        expect(ordered.map((candidate) => candidate.id)).toEqual(['a', 'b']);
    });

    it('opens a shared provider circuit and admits it again after the bounded pause', () => {
        // Arrange
        let now = 1000;
        const value = {
            ...route(),
            candidates: route().candidates.map((candidate) => ({
                ...candidate,
                providerId: 'driver',
            })),
        };
        const candidate = value.candidates[0]!;
        const governor = new RouteGovernor(new MemoryRoutingStore(), {
            now: () => now,
            failureThreshold: 2,
            circuitCooldownMilliseconds: 100,
        });

        governor.recordAttempt(value, candidate);
        governor.recordFailure(value, candidate, 10);
        governor.recordAttempt(value, candidate);
        governor.recordFailure(value, candidate, 30);

        // Act
        const paused = () => governor.order(value);

        expect(paused).toThrow(AiError);
        now = 1100;

        const ordered = governor.order(value);

        // Assert
        expect(ordered).toHaveLength(2);
        expect(governor.history(value, candidate).averageLatencyMilliseconds).toBe(20);
    });

    it('does not open another account candidate through account-only failure evidence', () => {
        // Arrange
        const value = {
            ...route(),
            candidates: route().candidates.map((candidate) => ({
                ...candidate,
                providerId: 'driver',
            })),
        };
        const candidate = value.candidates[0]!;
        const governor = new RouteGovernor(new MemoryRoutingStore(), { failureThreshold: 1 });

        governor.recordAttempt(value, candidate);
        governor.recordFailure(value, candidate, 10, false);

        // Act
        const ordered = governor.order(value);

        // Assert
        expect(ordered.map((entry) => entry.id)).toEqual(['b']);
    });

    it('keeps stable input order when unknown latency histories tie', () => {
        // Arrange
        const governor = new RouteGovernor();
        const value = {
            ...route('lowest-latency'),
            candidates: route().candidates.map((candidate) => ({ ...candidate, priority: 0 })),
        };

        // Act
        const ordered = governor.order(value);

        // Assert
        expect(ordered.map((candidate) => candidate.id)).toEqual(['a', 'b']);
    });
});
