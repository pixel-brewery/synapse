// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { RoutingStoreBase } from '../abstracts/RoutingStoreBase.js';
import type { IRoute } from '../interfaces/IRoute.js';
import type { IRouteCandidate } from '../interfaces/IRouteCandidate.js';
import type { IRouteGovernorOptions } from '../interfaces/IRouteGovernorOptions.js';
import type { IRouteTelemetry } from '../interfaces/IRouteTelemetry.js';
import type { RouteStrategy } from '../models/RouteStrategy.js';
import { RoutingStateCodec } from '../internal/RoutingStateCodec.js';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';

// #endregion

/**
 * Deterministic candidate ordering and persisted candidate/provider circuit evidence.
 *
 * @public
 */
export class RouteGovernor {
    // #region Fields

    private readonly _now: () => number;
    private readonly _threshold: number;
    private readonly _cooldown: number;

    // #endregion

    // #region Ctor

    /**
     * Composes a governor without reading persisted state until used.
     *
     * @param _store - Host persistence or bounded runtime-local memory.
     * @param options - Clock and circuit policy.
     * @throws An AiError for invalid circuit configuration.
     *
     * @public
     */
    public constructor(
        private readonly _store: RoutingStoreBase = new MemoryRoutingStore(),
        options: IRouteGovernorOptions = {},
    ) {
        this._now = options.now ?? Date.now;
        this._threshold = options.failureThreshold ?? 2;
        this._cooldown = options.circuitCooldownMilliseconds ?? 300000;

        if (
            !Number.isSafeInteger(this._threshold) ||
            this._threshold < 1 ||
            !Number.isFinite(this._cooldown) ||
            this._cooldown < 1
        )
            throw new AiError('configuration', 'Invalid routing circuit policy.');
    }

    // #endregion

    // #region Methods

    /**
     * Orders eligible candidates with stable ties and optional same-candidate session affinity.
     *
     * @param route - Host-authorized candidates and strategy.
     * @param affinityCandidateId - Candidate owning an existing native session.
     * @returns Ordered candidates whose local and shared provider circuits are closed.
     * @throws An AiError when all circuits are open or persistence fails.
     *
     * @public
     */
    public order(route: IRoute, affinityCandidateId?: string): readonly IRouteCandidate[] {
        const ranked = route.candidates
            .filter((candidate) => this.isAvailable(route, candidate))
            .map((candidate, index) => ({
                candidate,
                index,
                history: this.history(route, candidate),
            }));

        if (!ranked.length && route.candidates.length) {
            const retryAt = route.candidates
                .flatMap((candidate) => [
                    this.history(route, candidate).circuitOpenUntil,
                    candidate.providerId
                        ? this.load(route.scopeId, 'provider', candidate.providerId)
                              .circuitOpenUntil
                        : undefined,
                ])
                .filter((value): value is number => value !== undefined && value > this._now())
                .sort((a, b) => a - b)[0];

            throw new AiError('provider', 'All eligible routing circuits are cooling down.', {
                retryable: true,
                retryAt,
            });
        }

        const result = ranked
            .sort(
                (left, right) =>
                    compare(route.strategy ?? 'priority', left, right) || left.index - right.index,
            )
            .map((value) => value.candidate);
        const affinity = result.findIndex(
            (candidate) => candidate.sessionAffinity && candidate.id === affinityCandidateId,
        );

        return affinity > 0
            ? [result[affinity]!, ...result.slice(0, affinity), ...result.slice(affinity + 1)]
            : result;
    }

    /**
     * Checks candidate and explicitly grouped provider circuits at the current clock instant.
     *
     * @param route - Host routing scope.
     * @param candidate - Candidate to check.
     * @returns Whether both circuit windows have expired.
     * @throws An AiError when persisted state cannot be read.
     *
     * @public
     */
    public isAvailable(route: IRoute, candidate: IRouteCandidate): boolean {
        return (
            (this.history(route, candidate).circuitOpenUntil ?? 0) <= this._now() &&
            (!candidate.providerId ||
                (this.load(route.scopeId, 'provider', candidate.providerId).circuitOpenUntil ??
                    0) <= this._now())
        );
    }

    /**
     * Reads a safe candidate history for host projections and policy decisions.
     *
     * @param route - Host routing scope.
     * @param candidate - Candidate whose history is requested.
     * @returns Validated candidate telemetry or an empty history.
     * @throws An AiError for corrupt, unsupported or unavailable storage.
     *
     * @public
     */
    public history(route: IRoute, candidate: IRouteCandidate): IRouteTelemetry {
        return this.load(route.scopeId, 'candidate', candidate.id);
    }

    /**
     * Records admission before native execution; failures stop before provider launch.
     *
     * @param route - Host routing scope.
     * @param candidate - Selected candidate.
     * @throws An AiError when history cannot be saved.
     *
     * @public
     */
    public recordAttempt(route: IRoute, candidate: IRouteCandidate): void {
        this.update(route, candidate, (previous) => ({
            ...previous,
            attemptCount: previous.attemptCount + 1,
            lastAttemptAt: this._now(),
        }));
    }

    /**
     * Records success separately from executing the provider, preventing persistence-triggered replay.
     *
     * @param route - Host routing scope.
     * @param candidate - Candidate that completed.
     * @param latencyMilliseconds - Elapsed native turn duration.
     * @throws An AiError when success persistence fails; native execution must never be repeated.
     *
     * @public
     */
    public recordSuccess(
        route: IRoute,
        candidate: IRouteCandidate,
        latencyMilliseconds: number,
    ): void {
        this.update(route, candidate, (previous) => ({
            ...previous,
            successCount: previous.successCount + 1,
            consecutiveFailures: 0,
            averageLatencyMilliseconds: average(previous, latencyMilliseconds),
            lastSuccessAt: this._now(),
            circuitOpenUntil: undefined,
        }));
    }

    /**
     * Records actual provider failure without counting cancellation or host errors.
     *
     * @param route - Host routing scope.
     * @param candidate - Failed candidate.
     * @param latencyMilliseconds - Elapsed native turn duration.
     * @param sharedProviderFailure - Whether the failure is provider-wide; account/auth failures use false.
     * @throws An AiError when failure state cannot be persisted.
     *
     * @public
     */
    public recordFailure(
        route: IRoute,
        candidate: IRouteCandidate,
        latencyMilliseconds: number,
        sharedProviderFailure: boolean = true,
    ): void {
        this.update(
            route,
            candidate,
            (previous) => {
                const failures = previous.consecutiveFailures + 1;

                return {
                    ...previous,
                    failureCount: previous.failureCount + 1,
                    consecutiveFailures: failures,
                    averageLatencyMilliseconds: average(previous, latencyMilliseconds),
                    lastFailureAt: this._now(),
                    circuitOpenUntil:
                        failures >= this._threshold
                            ? this._now() + this._cooldown
                            : previous.circuitOpenUntil,
                };
            },
            sharedProviderFailure,
        );
    }

    /**
     * Removes only state belonging to a host scope being closed or explicitly reset.
     *
     * @param scopeId - Host namespace.
     * @throws An AiError if the host storage refuses removal.
     *
     * @public
     */
    public clearScope(scopeId: string): void {
        try {
            this._store.clearScope(scopeId);
        } catch (cause) {
            throw persistence(cause);
        }
    }

    private load(scopeId: string, kind: 'candidate' | 'provider', id: string): IRouteTelemetry {
        try {
            const value = this._store.loadTelemetry(scopeId, kind, id);

            if (value === undefined)
                return {
                    schemaVersion: 1,
                    scopeId,
                    kind,
                    id,
                    attemptCount: 0,
                    successCount: 0,
                    failureCount: 0,
                    consecutiveFailures: 0,
                };

            const result = RoutingStateCodec.telemetry(value);

            if (result.scopeId !== scopeId || result.kind !== kind || result.id !== id)
                throw new AiError(
                    'persistence',
                    'Routing state identity does not match its storage key.',
                );

            return result;
        } catch (cause) {
            throw persistence(cause);
        }
    }

    private update(
        route: IRoute,
        candidate: IRouteCandidate,
        transform: (previous: IRouteTelemetry) => IRouteTelemetry,
        shared: boolean = true,
    ): void {
        try {
            this._store.saveTelemetry(transform(this.history(route, candidate)));

            if (shared && candidate.providerId)
                this._store.saveTelemetry(
                    transform(this.load(route.scopeId, 'provider', candidate.providerId)),
                );
        } catch (cause) {
            throw persistence(cause);
        }
    }

    // #endregion
}

type Ranked = {
    readonly candidate: IRouteCandidate;
    readonly index: number;
    readonly history: IRouteTelemetry;
};

function compare(strategy: RouteStrategy, left: Ranked, right: Ranked): number {
    const priority = (left.candidate.priority ?? 0) - (right.candidate.priority ?? 0);

    switch (strategy) {
        case 'priority':
            return priority;
        case 'quality-first':
            return (
                (right.candidate.qualityScore ?? 50) - (left.candidate.qualityScore ?? 50) ||
                priority
            );
        case 'last-known-good':
            return (
                (right.history.lastSuccessAt ?? 0) - (left.history.lastSuccessAt ?? 0) || priority
            );
        case 'lowest-cost':
            return cost(left.candidate) - cost(right.candidate) || priority;
        case 'lowest-latency':
            return latency(left.history) - latency(right.history) || priority;
        case 'most-reliable':
            return (
                reliability(right.history) - reliability(left.history) ||
                left.history.consecutiveFailures - right.history.consecutiveFailures ||
                priority
            );
        case 'least-used':
            return left.history.attemptCount - right.history.attemptCount || priority;
        case 'reset-aware':
            return (
                left.history.consecutiveFailures - right.history.consecutiveFailures ||
                (left.history.lastAttemptAt ?? 0) - (right.history.lastAttemptAt ?? 0) ||
                priority
            );
        case 'balanced':
            return (
                left.history.consecutiveFailures - right.history.consecutiveFailures ||
                cost(left.candidate) - cost(right.candidate) ||
                latency(left.history) - latency(right.history) ||
                priority
            );
    }
}

function cost(candidate: IRouteCandidate): number {
    return ['local', 'free-tier', 'subscription-included', 'unknown', 'paid'].indexOf(
        candidate.costClass ?? 'unknown',
    );
}

function latency(record: IRouteTelemetry): number {
    return record.averageLatencyMilliseconds ?? Number.POSITIVE_INFINITY;
}

function reliability(record: IRouteTelemetry): number {
    const count = record.successCount + record.failureCount;

    return count ? Math.round((record.successCount / count) * 100) : 100;
}

function average(record: IRouteTelemetry, duration: number): number {
    const count = record.successCount + record.failureCount;
    const bounded = Number.isFinite(duration) ? Math.max(0, duration) : 0;

    return count && record.averageLatencyMilliseconds !== undefined
        ? (record.averageLatencyMilliseconds * count + bounded) / (count + 1)
        : bounded;
}

function persistence(cause: unknown): AiError {
    return cause instanceof AiError && cause.code === 'persistence'
        ? cause
        : new AiError('persistence', 'Routing history could not be persisted.', { cause });
}
