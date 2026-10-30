// #region Imports

import type { AiErrorCode } from '../models/AiErrorCode.js';
import type { IAiErrorOptions } from '../interfaces/IAiErrorOptions.js';
import { isCleanupIncomplete } from '../isCleanupIncomplete.js';

// #endregion

/**
 * Stable failure with explicit retry and session recovery semantics.
 *
 * @public
 */
export class AiError extends Error {
    // #region Fields

    /**
     * Whether native process termination remains unconfirmed; affected profile execution and credential changes must remain blocked.
     *
     * @public
     */
    public readonly cleanupIncomplete: boolean;

    /**
     * Explicit provider-reported capacity scope, if known.
     *
     * @public
     */
    public readonly capacityScope?: 'account' | 'model';

    /**
     * Stable provider-neutral failure classification.
     *
     * @public
     */
    public readonly code: AiErrorCode;

    /**
     * Whether an explicitly repeatable operation may retry this failure.
     *
     * @public
     */
    public readonly retryable: boolean;

    /**
     * Optional UTC epoch-millisecond recovery instant.
     *
     * @public
     */
    public readonly retryAt?: number;

    /**
     * Whether the originating native session remains usable.
     *
     * @public
     */
    public readonly sessionUsable: boolean;

    // #endregion

    // #region Ctor

    /**
     * Creates a safe failure; raw causes remain internal diagnostic material.
     *
     * @param code - Stable failure classification.
     * @param message - Safe host-facing explanation.
     * @param options - Recovery metadata and optional internal cause.
     * @remarks Unconfirmed process cleanup, including a flagged nested cause, always forces host classification, disables retries and marks the session unusable.
     *
     * @public
     */
    public constructor(code: AiErrorCode, message: string, options: IAiErrorOptions = {}) {
        super(message, { cause: options.cause });
        this.name = 'AiError';
        this.cleanupIncomplete =
            options.cleanupIncomplete === true || isCleanupIncomplete(options.cause);
        this.code = this.cleanupIncomplete ? 'host' : code;
        this.retryable = !this.cleanupIncomplete && (options.retryable ?? false);
        this.capacityScope = this.cleanupIncomplete ? undefined : options.capacityScope;
        this.retryAt = this.cleanupIncomplete ? undefined : options.retryAt;
        this.sessionUsable = !this.cleanupIncomplete && (options.sessionUsable ?? true);
    }

    // #endregion
}
