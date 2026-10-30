// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { RoutingStoreBase } from '../abstracts/RoutingStoreBase.js';
import type { IAccountCooldown } from '../interfaces/IAccountCooldown.js';
import type { IAccountCooldownOptions } from '../interfaces/IAccountCooldownOptions.js';
import { RoutingStateCodec } from '../internal/RoutingStateCodec.js';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';

// #endregion

/**
 * Shares only explicit account-scoped capacity evidence across sibling routes.
 *
 * @public
 */
export class AccountCooldowns {
    // #region Fields

    private readonly _now: () => number;
    private readonly _rate: number;
    private readonly _quota: number;
    private readonly _maximum: number;

    // #endregion

    // #region Ctor

    /**
     * Creates an inert account-capacity owner.
     *
     * @param _store - Shared host persistence or bounded memory.
     * @param options - Clock, default pauses and maximum reset hint.
     * @throws An AiError for invalid pause durations.
     *
     * @public
     */
    public constructor(
        private readonly _store: RoutingStoreBase = new MemoryRoutingStore(),
        options: IAccountCooldownOptions = {},
    ) {
        this._now = options.now ?? Date.now;
        this._rate = options.rateLimitMilliseconds ?? 60000;
        this._quota = options.quotaMilliseconds ?? 900000;
        this._maximum = options.maximumMilliseconds ?? 2678400000;

        if (
            [this._rate, this._quota, this._maximum].some(
                (value) => !Number.isFinite(value) || value < 1,
            ) ||
            this._maximum < Math.max(this._rate, this._quota)
        )
            throw new AiError('configuration', 'Invalid account cooldown policy.');
    }

    // #endregion

    // #region Methods

    /**
     * Reads a current account pause and removes only its expired record.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account identity shared across sibling routes.
     * @returns Active pause, or undefined after expiry/no record.
     * @throws An AiError for invalid persisted state or storage failure.
     *
     * @public
     */
    public active(scopeId: string, accountId: string): IAccountCooldown | undefined {
        try {
            const value = this._store.loadCooldown(scopeId, accountId);

            if (value === undefined) return undefined;

            const result = RoutingStateCodec.cooldown(value);

            if (result.scopeId !== scopeId || result.accountId !== accountId)
                throw new AiError(
                    'persistence',
                    'Account cooldown identity does not match its storage key.',
                );

            if (result.retryAt > this._now()) return result;

            this._store.clearAccount(scopeId, accountId);

            return undefined;
        } catch (cause) {
            throw persistence(cause);
        }
    }

    /**
     * Records a bounded pause only when the provider explicitly identifies account-wide capacity.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Failed account identity.
     * @param failure - Typed provider evidence; unscoped/model-only failures are ignored.
     * @returns The saved pause, or undefined for non-account evidence.
     * @throws An AiError when the account pause cannot be persisted.
     *
     * @public
     */
    public recordFailure(
        scopeId: string,
        accountId: string,
        failure: AiError,
    ): IAccountCooldown | undefined {
        if (
            failure.capacityScope !== 'account' ||
            (failure.code !== 'quota' && failure.code !== 'rate-limit')
        )
            return undefined;

        const observedAt = this._now();
        const fallback = failure.code === 'quota' ? this._quota : this._rate;
        const retryAt =
            failure.retryAt !== undefined &&
            Number.isFinite(failure.retryAt) &&
            failure.retryAt > observedAt
                ? Math.min(failure.retryAt, observedAt + this._maximum)
                : observedAt + fallback;
        const result: IAccountCooldown = {
            schemaVersion: 1,
            scopeId,
            accountId,
            reason: failure.code,
            observedAt,
            retryAt,
        };

        try {
            this._store.saveCooldown(result);

            return result;
        } catch (cause) {
            throw persistence(cause);
        }
    }

    /**
     * Clears one account after explicit recovery or native credential switching.
     *
     * @param scopeId - Host namespace.
     * @param accountId - Account identity.
     * @throws An AiError when storage refuses removal.
     *
     * @public
     */
    public clearAccount(scopeId: string, accountId: string): void {
        try {
            this._store.clearAccount(scopeId, accountId);
        } catch (cause) {
            throw persistence(cause);
        }
    }

    // #endregion
}

function persistence(cause: unknown): AiError {
    return cause instanceof AiError && cause.code === 'persistence'
        ? cause
        : new AiError('persistence', 'Account cooldown state could not be persisted.', { cause });
}
