// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IAccountCooldown } from '../interfaces/IAccountCooldown.js';
import type { IRouteTelemetry } from '../interfaces/IRouteTelemetry.js';

// #endregion

/**
 * Validates untrusted host-persisted routing snapshots without destructive fallback.
 *
 * @internal
 */
export class RoutingStateCodec {
    // #region Methods

    /**
     * Decodes one versioned history.
     *
     * @param value - Host-persisted value.
     * @returns Validated immutable data shape.
     * @throws An AiError when state is invalid or newer than this implementation.
     *
     * @internal
     */
    public static telemetry(value: unknown): IRouteTelemetry {
        const row = record(value);
        const kind = row['kind'];

        if (row['schemaVersion'] !== 1 || (kind !== 'candidate' && kind !== 'provider')) invalid();

        return {
            schemaVersion: 1,
            scopeId: text(row['scopeId']),
            kind,
            id: text(row['id']),
            attemptCount: count(row['attemptCount']),
            successCount: count(row['successCount']),
            failureCount: count(row['failureCount']),
            consecutiveFailures: count(row['consecutiveFailures']),
            averageLatencyMilliseconds: optionalNumber(row['averageLatencyMilliseconds']),
            lastAttemptAt: optionalNumber(row['lastAttemptAt']),
            lastSuccessAt: optionalNumber(row['lastSuccessAt']),
            lastFailureAt: optionalNumber(row['lastFailureAt']),
            circuitOpenUntil: optionalNumber(row['circuitOpenUntil']),
        };
    }

    /**
     * Decodes one explicit account pause.
     *
     * @param value - Host-persisted value.
     * @returns Validated account-capacity evidence.
     * @throws An AiError for invalid or unsupported state.
     *
     * @internal
     */
    public static cooldown(value: unknown): IAccountCooldown {
        const row = record(value);
        const reason = row['reason'];

        if (row['schemaVersion'] !== 1 || (reason !== 'quota' && reason !== 'rate-limit'))
            invalid();

        return {
            schemaVersion: 1,
            scopeId: text(row['scopeId']),
            accountId: text(row['accountId']),
            reason,
            observedAt: number(row['observedAt']),
            retryAt: number(row['retryAt']),
        };
    }

    // #endregion
}

function invalid(): never {
    throw new AiError(
        'persistence',
        'Stored routing state is invalid or has an unsupported version.',
    );
}

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid();

    return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
    if (typeof value !== 'string' || !value) return invalid();

    return value;
}

function number(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return invalid();

    return value;
}

function count(value: unknown): number {
    const result = number(value);

    if (!Number.isSafeInteger(result)) return invalid();

    return result;
}

function optionalNumber(value: unknown): number | undefined {
    return value === undefined ? undefined : number(value);
}
