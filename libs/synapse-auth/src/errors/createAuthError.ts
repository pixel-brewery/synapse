// #region Imports

import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Creates a safe authentication failure without exposing raw CLI output.
 *
 * @param error - Native failure used to retain safe classification and cleanup consequences.
 * @param signal - Optional operation cancellation; unconfirmed cleanup takes precedence.
 * @returns Typed fixed-text failure suitable for the host authentication boundary.
 * @remarks Cleanup causes are sanitized so native output and submitted credentials remain private.
 *
 * @internal
 */
export function createAuthError(error: unknown, signal?: AbortSignal): AiError {
    if (isCleanupIncomplete(error) || isCleanupIncomplete(signal?.reason)) {
        return new AiError(
            'host',
            'Native authentication process cleanup could not be confirmed.',
            {
                cleanupIncomplete: true,
                cause: new AiError(
                    'host',
                    'Owned native process termination remained unconfirmed.',
                    {
                        cleanupIncomplete: true,
                    },
                ),
            },
        );
    }

    const reason: unknown = signal?.aborted ? signal.reason : error;
    const code =
        reason instanceof AiError ? reason.code : signal?.aborted ? 'cancelled' : 'provider';
    const message =
        code === 'timeout'
            ? 'The authentication operation expired.'
            : code === 'cancelled'
              ? 'The authentication operation was cancelled.'
              : code === 'auth-busy'
                ? 'The profile is changing its authentication state.'
                : code === 'auth-required'
                  ? 'Native authentication could not be verified.'
                  : code === 'disposed'
                    ? 'The authentication manager has been disposed.'
                    : code === 'protocol'
                      ? 'The native authentication protocol was invalid.'
                      : code === 'configuration'
                        ? 'The native authentication configuration was invalid.'
                        : code === 'unsupported'
                          ? 'The requested authentication procedure is unsupported.'
                          : 'The native authentication operation failed.';

    return new AiError(code, message, { retryable: false });
}
