// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Classifies native Claude failures without exposing private output or reusable credentials.
 *
 * @param message - Untrusted private native diagnostic used only for classification.
 * @param continued - Whether the failed turn resumed a native session.
 * @returns A safe error with explicit retry and session recovery information.
 *
 * @public
 */
export function claudeFailure(message: string, continued = false): AiError {
    if (
        continued &&
        /(?:session|conversation).*(?:not found|unavailable|does not exist|missing)/iu.test(message)
    )
        return new AiError('session-unavailable', 'The Claude session is unavailable.', {
            sessionUsable: false,
        });

    if (
        /(?:not logged in|authentication (?:failed|required)|unauthorized|invalid api key|login required|expired.*token)/iu.test(
            message,
        )
    )
        return new AiError('auth-required', 'Claude requires authentication.', {
            sessionUsable: false,
        });

    if (/(?:quota|usage limit|credit balance|insufficient credits|billing.*limit)/iu.test(message))
        return new AiError('quota', 'Claude account capacity is temporarily unavailable.', {
            retryable: true,
            capacityScope: 'account',
            retryAt: retryAt(message),
        });

    if (/(?:429|rate.?limit|too many requests)/iu.test(message))
        return new AiError('rate-limit', 'Claude is temporarily rate limited.', {
            retryable: true,
            ...(/account|organization/iu.test(message)
                ? { capacityScope: 'account' as const }
                : {}),
            retryAt: retryAt(message),
        });

    if (
        /(?:invalid configuration|unknown (?:argument|option)|permission denied|unrecognized (?:argument|option))/iu.test(
            message,
        )
    )
        return new AiError('configuration', 'Claude rejected its execution configuration.');

    return new AiError('provider', 'Claude could not complete the turn.', { retryable: true });
}

function retryAt(message: string): number | undefined {
    const seconds = /retry[ -]?after\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:s|seconds?)?/iu.exec(
        message,
    )?.[1];

    if (seconds) return Date.now() + Math.min(31 * 86_400_000, Number(seconds) * 1_000);

    const instant =
        /(?:reset|retry|try again)[^\n]*?(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/iu.exec(
            message,
        )?.[1];

    if (!instant) return undefined;

    const parsed = Date.parse(instant);

    return Number.isFinite(parsed) ? parsed : undefined;
}
