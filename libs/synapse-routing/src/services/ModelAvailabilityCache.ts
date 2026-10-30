// #region Imports

import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';
import type { IRouteCandidate } from '../interfaces/IRouteCandidate.js';
import type { IModelAvailabilityOptions } from '../interfaces/IModelAvailabilityOptions.js';
import type { ModelAvailability } from '../models/ModelAvailability.js';

// #endregion

/**
 * Bounded account/model evidence cache; failed or unavailable inspection remains unknown.
 *
 * @public
 */
export class ModelAvailabilityCache {
    // #region Fields

    private readonly _now: () => number;
    private readonly _available: number;
    private readonly _unavailable: number;
    private readonly _unknown: number;
    private readonly _maximum: number;
    private readonly _onInspectionError: ((cause: unknown) => void) | undefined;
    private readonly _cache = new Map<string, CachedAvailability>();
    private readonly _inflight = new Set<InspectionStamp>();

    // #endregion

    // #region Ctor

    /**
     * Creates an inert bounded cache with independent positive, negative and unknown lifetimes.
     *
     * @param options - Clock and cache budgets.
     * @throws An AiError for invalid durations or capacity.
     *
     * @public
     */
    public constructor(options: IModelAvailabilityOptions = {}) {
        this._now = options.now ?? Date.now;
        this._available = options.availableMilliseconds ?? 300000;
        this._unavailable = options.unavailableMilliseconds ?? 60000;
        this._unknown = options.unknownMilliseconds ?? 15000;
        this._maximum = options.maximumEntries ?? 1000;
        this._onInspectionError = options.onInspectionError;

        if (
            [this._available, this._unavailable, this._unknown].some(
                (value) => !Number.isFinite(value) || value < 0,
            ) ||
            !Number.isSafeInteger(this._maximum) ||
            this._maximum < 1
        )
            throw new AiError('configuration', 'Invalid model availability cache budgets.');
    }

    // #endregion

    // #region Methods

    /**
     * Inspects only an explicitly supplied account-scoped metadata source; model catalogs alone are not entitlement evidence.
     *
     * @param scopeId - Host namespace.
     * @param candidate - Account/model and optional authoritative inspector.
     * @param signal - Inspection cancellation, propagated without caching a negative result.
     * @returns Positive, negative or unknown evidence; unknown permits ordinary execution.
     * @throws An AiError when inspection is cancelled or its owned resource cleanup remains unconfirmed; cleanup uncertainty takes precedence over cancellation.
     * @remarks Supplied inspectors must honor the signal and settle after their bounded cleanup. The host owns their lifecycle; a noncooperating arbitrary callback cannot be forcibly stopped by the cache.
     *
     * @public
     */
    public async inspect(
        scopeId: string,
        candidate: IRouteCandidate,
        signal: AbortSignal,
    ): Promise<ModelAvailability> {
        if (signal.aborted) throw cancelled(signal);

        if (!candidate.model) return { state: 'available' };

        const key = JSON.stringify([scopeId, candidate.accountId, candidate.model]);
        const cached = this._cache.get(key);

        if (cached && cached.expiresAt > this._now()) return cached.result;

        if (!candidate.inspectModelAvailability) return { state: 'unknown' };

        if (this._inflight.size >= this._maximum)
            return {
                state: 'unknown',
                reason: 'The bounded metadata inspection capacity is busy.',
            };

        const stamp: InspectionStamp = { scopeId, accountId: candidate.accountId, valid: true };

        this._inflight.add(stamp);

        let result: ModelAvailability;

        try {
            const value = await candidate.inspectModelAvailability(candidate.model, signal);

            if (signal.aborted) throw cancelled(signal);

            result = validated(value);
        } catch (cause) {
            if (isCleanupIncomplete(cause))
                throw new AiError(
                    'host',
                    'Model metadata inspection could not confirm resource cleanup.',
                    {
                        cause,
                        cleanupIncomplete: true,
                        sessionUsable: false,
                    },
                );

            if (signal.aborted) throw cancelled(signal);

            result = {
                state: 'unknown',
                reason: 'Account-scoped model availability could not be inspected.',
            };
            this.reportInspectionError(cause);
        } finally {
            this._inflight.delete(stamp);
        }

        if (stamp.valid) {
            this._cache.delete(key);
            this.evict();
            this._cache.set(key, {
                scopeId,
                accountId: candidate.accountId,
                result,
                expiresAt: this._now() + this.duration(result.state),
            });
        }

        return result;
    }

    /**
     * Invalidates only one account's evidence and rejects late cache writes from older inspections.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account whose credentials or model state changed.
     *
     * @public
     */
    public clearAccount(scopeId: string, accountId: string): void {
        for (const stamp of this._inflight)
            if (stamp.scopeId === scopeId && stamp.accountId === accountId) stamp.valid = false;

        for (const [key, value] of this._cache)
            if (value.scopeId === scopeId && value.accountId === accountId) this._cache.delete(key);
    }

    /**
     * Invalidates one host scope without touching durable state or native credentials.
     *
     * @param scopeId - Host namespace.
     *
     * @public
     */
    public clearScope(scopeId: string): void {
        for (const stamp of this._inflight) if (stamp.scopeId === scopeId) stamp.valid = false;

        for (const [key, value] of this._cache)
            if (value.scopeId === scopeId) this._cache.delete(key);
    }

    /**
     * Clears only local metadata evidence.
     *
     * @public
     */
    public clear(): void {
        for (const stamp of this._inflight) stamp.valid = false;

        this._cache.clear();
    }

    private reportInspectionError(cause: unknown): void {
        try {
            this._onInspectionError?.(cause);
        } catch {
            // Optional diagnostics cannot turn unknown metadata into denied access or provider replay.
        }
    }

    private duration(state: ModelAvailability['state']): number {
        switch (state) {
            case 'available':
                return this._available;
            case 'unavailable':
                return this._unavailable;
            case 'unknown':
                return this._unknown;
        }
    }

    private evict(): void {
        for (const [key, value] of this._cache)
            if (value.expiresAt <= this._now()) this._cache.delete(key);

        if (this._cache.size >= this._maximum) {
            const oldest = this._cache.keys().next().value;

            if (oldest !== undefined) this._cache.delete(oldest);
        }
    }

    // #endregion
}

type InspectionStamp = { readonly scopeId: string; readonly accountId: string; valid: boolean };

type CachedAvailability = {
    readonly scopeId: string;
    readonly accountId: string;
    readonly result: ModelAvailability;
    readonly expiresAt: number;
};

function validated(value: unknown): ModelAvailability {
    if (typeof value !== 'object' || value === null)
        return { state: 'unknown', reason: 'The model inspector returned invalid evidence.' };

    const row = Object.fromEntries(Object.entries(value));
    const state = row['state'];

    if (state === 'available') return { state };

    if (state === 'unavailable' || state === 'unknown')
        return {
            state,
            ...(typeof row['reason'] === 'string' ? { reason: row['reason'].slice(0, 1000) } : {}),
        };

    return { state: 'unknown', reason: 'The model inspector returned invalid evidence.' };
}

function cancelled(signal: AbortSignal): AiError {
    return signal.reason instanceof AiError && ['cancelled', 'timeout'].includes(signal.reason.code)
        ? signal.reason
        : new AiError('cancelled', 'Model availability inspection was cancelled.', {
              cause: signal.reason,
          });
}
