// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { RoutingStoreBase } from '../abstracts/RoutingStoreBase.js';
import type { IAccountCooldown } from '../interfaces/IAccountCooldown.js';
import type { IRouteTelemetry } from '../interfaces/IRouteTelemetry.js';
import { RoutingStateCodec } from '../internal/RoutingStateCodec.js';

// #endregion

/**
 * Bounded runtime-local state; capacity failure never silently discards an active pause or circuit.
 *
 * @public
 */
export class MemoryRoutingStore extends RoutingStoreBase {
    // #region Fields

    private readonly _telemetry = new Map<string, IRouteTelemetry>();
    private readonly _cooldowns = new Map<string, IAccountCooldown>();

    // #endregion

    // #region Ctor

    /**
     * Creates an inert bounded store.
     *
     * @param _maximumRecords - Combined record limit; default 10000.
     * @throws An AiError for an invalid limit.
     *
     * @public
     */
    public constructor(private readonly _maximumRecords: number = 10000) {
        super();

        if (!Number.isSafeInteger(_maximumRecords) || _maximumRecords < 1)
            throw new AiError(
                'configuration',
                'Routing store capacity must be a positive integer.',
            );
    }

    // #endregion

    // #region Methods

    /**
     * Reads one candidate or provider history.
     *
     * @param scopeId - Host namespace.
     * @param kind - Candidate/provider namespace.
     * @param id - Stable history identity.
     * @returns Previously validated immutable snapshot, if any.
     *
     * @public
     */
    public override loadTelemetry(
        scopeId: string,
        kind: 'candidate' | 'provider',
        id: string,
    ): IRouteTelemetry | undefined {
        return this._telemetry.get(JSON.stringify([scopeId, kind, id]));
    }

    /**
     * Persists history within the configured memory budget.
     *
     * @param telemetry - Versioned history snapshot.
     * @throws An AiError if state is invalid or the store is full.
     *
     * @public
     */
    public override saveTelemetry(telemetry: IRouteTelemetry): void {
        const record = Object.freeze(RoutingStateCodec.telemetry(telemetry));
        const key = JSON.stringify([record.scopeId, record.kind, record.id]);

        this.reserve(this._telemetry.has(key));
        this._telemetry.set(key, record);
    }

    /**
     * Reads one account pause.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account identity.
     * @returns The immutable pause, if any.
     *
     * @public
     */
    public override loadCooldown(scopeId: string, accountId: string): IAccountCooldown | undefined {
        return this._cooldowns.get(JSON.stringify([scopeId, accountId]));
    }

    /**
     * Saves explicit capacity evidence without evicting other active pauses.
     *
     * @param cooldown - Versioned account-capacity evidence.
     * @throws An AiError if state is invalid or the store is full.
     *
     * @public
     */
    public override saveCooldown(cooldown: IAccountCooldown): void {
        const record = Object.freeze(RoutingStateCodec.cooldown(cooldown));
        const key = JSON.stringify([record.scopeId, record.accountId]);

        this.reserve(this._cooldowns.has(key));
        this._cooldowns.set(key, record);
    }

    /**
     * Clears only one account pause.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account identity.
     *
     * @public
     */
    public override clearAccount(scopeId: string, accountId: string): void {
        this._cooldowns.delete(JSON.stringify([scopeId, accountId]));
    }

    /**
     * Releases all state owned by one host scope.
     *
     * @param scopeId - Host namespace to remove.
     *
     * @public
     */
    public override clearScope(scopeId: string): void {
        for (const [key, value] of this._telemetry)
            if (value.scopeId === scopeId) this._telemetry.delete(key);

        for (const [key, value] of this._cooldowns)
            if (value.scopeId === scopeId) this._cooldowns.delete(key);
    }

    private reserve(existing: boolean): void {
        if (!existing && this._telemetry.size + this._cooldowns.size >= this._maximumRecords)
            throw new AiError(
                'persistence',
                'Routing state capacity is exhausted; remove an inactive scope or configure durable storage.',
            );
    }

    // #endregion
}
