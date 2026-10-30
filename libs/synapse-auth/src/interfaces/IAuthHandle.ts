// #region Imports

import type { IAiAuthResponse, IAiAuthStatus } from '@pixel-brewery/synapse-core';
import type { AuthState } from '../models/AuthState.js';

// #endregion

/**
 * One login's current state, bounded history and awaited native completion.
 *
 * @public
 */
export interface IAuthHandle {
    /**
     * Authoritative latest snapshot even when older events were dropped.
     */
    readonly state: AuthState;

    /**
     * Bounded snapshots; result completion never depends on consuming this iterable.
     */
    readonly events: AsyncIterable<AuthState>;

    /**
     * Resolves only after native login and status verification; rejects after cleanup on failure.
     */
    readonly result: Promise<IAiAuthStatus>;

    /**
     * Provides in-memory input to the current owner-scoped interaction.
     *
     * @param response - Current owner, operation, interaction and submitted input values.
     * @throws An AiError for stale, expired, invalid or unauthorized responses.
     */
    respond(response: IAiAuthResponse): void;

    /**
     * Cancels this flow and waits for native teardown, including queued starts.
     *
     * @returns Completion after all owned login work has settled.
     * @throws An AiError with cleanupIncomplete when native process termination remains unconfirmed.
     */
    cancel(): Promise<void>;
}
