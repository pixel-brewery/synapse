// #region Imports

import { AiError, AiRouteExecutorBase } from '@pixel-brewery/synapse-core';
import type { AiEvent, IAiRequest, IAiResult } from '@pixel-brewery/synapse-core';
import type { IAiRouterOptions } from '../interfaces/IAiRouterOptions.js';
import type { IRoute } from '../interfaces/IRoute.js';
import type { IRouteCandidate } from '../interfaces/IRouteCandidate.js';
import { MemoryRoutingStore } from './MemoryRoutingStore.js';
import { RouteGovernor } from './RouteGovernor.js';
import { RouteAdmission } from './RouteAdmission.js';
import { AccountCooldowns } from './AccountCooldowns.js';
import { ModelAvailabilityCache } from './ModelAvailabilityCache.js';

// #endregion

/**
 * Runtime-local routing with host eligibility, bounded admission and explicit replay permission.
 *
 * @remarks Native execution and its process/profile safeguards remain in the injected runtime callback.
 *
 * @public
 */
export class AiRouter extends AiRouteExecutorBase {
    // #region Fields

    private readonly _routes = new Map<string, IRoute>();
    private readonly _governor: RouteGovernor;
    private readonly _admission: RouteAdmission;
    private readonly _cooldowns: AccountCooldowns;
    private readonly _models: ModelAvailabilityCache;
    private readonly _ownsModels: boolean;
    private readonly _now: () => number;
    private readonly _controllers = new Map<symbol, AbortController>();
    private readonly _pending = new Set<Promise<IAiResult>>();
    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Validates immutable route registrations without discovering accounts or starting work.
     *
     * @param options - Host route definitions and optional shared state owners.
     * @throws An AiError for invalid/duplicate routes, candidates or budgets.
     *
     * @public
     */
    public constructor(options: IAiRouterOptions) {
        super();

        if (typeof options !== 'object' || options === null)
            throw new AiError('configuration', 'Router options must be an object.');

        this._now = options.now ?? Date.now;

        const store = options.store ?? new MemoryRoutingStore();

        this._governor = options.governor ?? new RouteGovernor(store, { now: this._now });
        this._admission = options.admission ?? new RouteAdmission();
        this._cooldowns = options.cooldowns ?? new AccountCooldowns(store, { now: this._now });
        this._models = options.models ?? new ModelAvailabilityCache({ now: this._now });
        this._ownsModels = options.models === undefined;

        const definitions: unknown = options.routes;

        if (!Array.isArray(definitions) || definitions.length > 1000)
            throw new AiError('configuration', 'At most 1000 explicit routes may be registered.');

        const scopedCandidates = new Set<string>();

        for (const value of definitions) {
            const route: unknown = value;

            validateRoute(route);

            if (this._routes.has(route.id))
                throw new AiError('configuration', 'Duplicate route identifier.');

            for (const candidate of route.candidates) {
                const key = JSON.stringify([route.scopeId, candidate.id]);

                if (scopedCandidates.has(key))
                    throw new AiError(
                        'configuration',
                        'Candidate identifiers must be unique within a host scope.',
                    );

                scopedCandidates.add(key);
            }

            this._routes.set(
                route.id,
                Object.freeze({
                    ...route,
                    candidates: Object.freeze(
                        route.candidates.map((candidate) => Object.freeze({ ...candidate })),
                    ),
                }),
            );
        }
    }

    // #endregion

    // #region Methods

    /**
     * Executes a registered route with at most one attempt per configured candidate.
     *
     * @param request - Route request with explicit repeatability and optional bound session.
     * @param execute - One native attempt using the same runtime's isolation and cleanup.
     * @param emit - Critical progress sink; callback failure is a nonretryable host error.
     * @returns One actual result after admission release, or a typed terminal failure.
     * @throws An AiError on invalid selection, capacity, cancellation or terminal provider/host failure.
     *
     * @public
     */
    public override execute(
        request: IAiRequest,
        execute: (request: IAiRequest) => Promise<IAiResult>,
        emit: (event: AiEvent) => Promise<void>,
    ): Promise<IAiResult> {
        if (this._disposed)
            return Promise.reject(new AiError('disposed', 'The AI router has been disposed.'));

        if (!('routeId' in request.target))
            return Promise.reject(
                new AiError('configuration', 'The router requires an explicit route target.'),
            );

        const route = this._routes.get(request.target.routeId);

        if (!route)
            return Promise.reject(
                new AiError('configuration', 'The selected AI route is not registered.'),
            );

        if (
            request.deadline !== undefined &&
            (!Number.isFinite(request.deadline) || request.deadline < 0)
        )
            return Promise.reject(
                new AiError(
                    'configuration',
                    'The route deadline must be a finite UTC epoch timestamp.',
                ),
            );

        const controller = new AbortController();
        const key = Symbol();

        this._controllers.set(key, controller);

        const onAbort = (): void => controller.abort(request.signal?.reason);

        request.signal?.addEventListener('abort', onAbort, { once: true });

        if (request.signal?.aborted) onAbort();

        const stopDeadline = this.deadline(request.deadline, controller);
        const operation = this._admission.run(route, controller.signal, () =>
            this.attempts(
                route,
                { ...request, signal: controller.signal },
                controller.signal,
                execute,
                emit,
            ),
        );
        const result = operation.finally(() => {
            stopDeadline();
            request.signal?.removeEventListener('abort', onAbort);
            this._controllers.delete(key);
            this._pending.delete(result);
        });

        this._pending.add(result);

        return result;
    }

    /**
     * Aborts and awaits only this router's queued/active operations; durable host state is preserved.
     *
     * @returns Completion after every owned operation has released its admission slot.
     *
     * @public
     */
    public override async dispose(): Promise<void> {
        this._disposed = true;

        for (const controller of this._controllers.values())
            controller.abort(new AiError('cancelled', 'The AI router is shutting down.'));

        await Promise.allSettled([...this._pending]);

        if (this._ownsModels) this._models.clear();
    }

    private async attempts(
        route: IRoute,
        request: IAiRequest,
        signal: AbortSignal,
        execute: (request: IAiRequest) => Promise<IAiResult>,
        emit: (event: AiEvent) => Promise<void>,
    ): Promise<IAiResult> {
        this.check(signal);

        const candidates = this._governor.order(route, request.session?.candidateId);
        let lastFailure: AiError | undefined;

        for (const candidate of candidates) {
            this.check(signal);

            const cooldown = this._cooldowns.active(route.scopeId, candidate.accountId);

            if (cooldown) {
                lastFailure = new AiError(
                    cooldown.reason,
                    'The selected account is cooling down after an explicit capacity failure.',
                    { capacityScope: 'account', retryAt: cooldown.retryAt, retryable: true },
                );

                continue;
            }

            if (!this._governor.isAvailable(route, candidate)) continue;

            const availability = await this._models.inspect(
                route.scopeId,
                { ...candidate, model: candidate.model ?? request.model },
                signal,
            );

            this.check(signal);

            if (availability.state === 'unavailable') {
                lastFailure = new AiError(
                    'unsupported',
                    'The connected account does not currently support this configured model.',
                );

                continue;
            }

            await this.publish(emit, {
                type: 'attempt',
                instanceId: candidate.instanceId,
                candidateId: candidate.id,
            });
            this._governor.recordAttempt(route, candidate);

            const startedAt = this._now();
            let result: IAiResult;

            try {
                result = await execute(this.candidateRequest(request, candidate));
                this.check(signal);
            } catch (cause) {
                this.check(signal);

                if (!(cause instanceof AiError))
                    throw new AiError('host', 'The host execution boundary failed.', { cause });

                if (!providerFailure(cause)) throw cause;

                this._cooldowns.recordFailure(route.scopeId, candidate.accountId, cause);
                this._governor.recordFailure(
                    route,
                    candidate,
                    this._now() - startedAt,
                    !['quota', 'rate-limit', 'auth-required'].includes(cause.code),
                );
                lastFailure = cause;

                if (
                    !request.policy.repeatable ||
                    (request.policy.mode === 'workspace-write' &&
                        !request.policy.allowWriteRetry) ||
                    !cause.retryable
                )
                    throw cause;

                continue;
            }

            // A successful native turn is outside the provider-failure catch. Storage failure cannot replay it.
            if (result.instanceId !== candidate.instanceId || result.candidateId !== candidate.id)
                throw new AiError(
                    'host',
                    'The host execution result does not match the selected candidate.',
                );

            this._governor.recordSuccess(route, candidate, this._now() - startedAt);

            return result;
        }

        throw (
            lastFailure ??
            new AiError('provider', 'No eligible AI route candidate is currently available.')
        );
    }

    private candidateRequest(request: IAiRequest, candidate: IRouteCandidate): IAiRequest {
        const preserves = Boolean(
            candidate.sessionAffinity &&
            request.session?.candidateId === candidate.id &&
            request.session.instanceId === candidate.instanceId,
        );

        return {
            ...request,
            target: { instanceId: candidate.instanceId, candidateId: candidate.id },
            model: candidate.model ?? request.model,
            reasoningEffort: candidate.reasoningEffort ?? request.reasoningEffort,
            session: preserves ? request.session : undefined,
        };
    }

    private async publish(emit: (event: AiEvent) => Promise<void>, event: AiEvent): Promise<void> {
        try {
            await emit(event);
        } catch (cause) {
            throw cause instanceof AiError &&
                (cause.code === 'host' || cause.code === 'persistence')
                ? cause
                : new AiError('persistence', 'Host routing progress could not be stored.', {
                      cause,
                  });
        }
    }

    private check(signal: AbortSignal): void {
        if (signal.aborted)
            throw signal.reason instanceof AiError &&
                ['cancelled', 'timeout'].includes(signal.reason.code)
                ? signal.reason
                : new AiError('cancelled', 'AI routing was cancelled.', { cause: signal.reason });
    }

    private deadline(value: number | undefined, controller: AbortController): () => void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const arm = (): void => {
            if (value === undefined || controller.signal.aborted) return;

            const remaining = value - this._now();

            if (remaining <= 0) {
                controller.abort(new AiError('timeout', 'The AI route deadline expired.'));

                return;
            }

            timer = setTimeout(arm, Math.min(remaining, 2147483647));
        };

        arm();

        return () => {
            if (timer !== undefined) clearTimeout(timer);
        };
    }

    // #endregion
}

function providerFailure(error: AiError): boolean {
    return [
        'provider',
        'protocol',
        'quota',
        'rate-limit',
        'auth-required',
        'session-unavailable',
        'result-validation',
        'timeout',
    ].includes(error.code);
}

function validateRoute(value: unknown): asserts value is IRoute {
    const route = configurationRecord(value);
    const candidates = route['candidates'];

    if (
        !nonempty(route['id']) ||
        !nonempty(route['scopeId']) ||
        !Array.isArray(candidates) ||
        !candidates.length ||
        candidates.length > 128
    )
        throw new AiError(
            'configuration',
            'Routes require identities and one to 128 explicit candidates.',
        );

    const strategy = route['strategy'];

    if (
        strategy !== undefined &&
        (typeof strategy !== 'string' ||
            ![
                'priority',
                'quality-first',
                'last-known-good',
                'lowest-cost',
                'lowest-latency',
                'most-reliable',
                'least-used',
                'reset-aware',
                'balanced',
            ].includes(strategy))
    )
        throw new AiError('configuration', 'Unknown routing strategy.');

    const maximum = route['maxParallelExecutions'] ?? 1;
    const queued = route['maxQueuedExecutions'] ?? 256;

    if (
        typeof maximum !== 'number' ||
        !Number.isSafeInteger(maximum) ||
        maximum < 1 ||
        typeof queued !== 'number' ||
        !Number.isSafeInteger(queued) ||
        queued < 0
    )
        throw new AiError('configuration', 'Invalid route concurrency or queue budget.');

    for (const value of candidates) {
        const candidate = configurationRecord(value);

        if (![candidate['id'], candidate['instanceId'], candidate['accountId']].every(nonempty))
            throw new AiError(
                'configuration',
                'Candidates require stable candidate, instance and account identities.',
            );

        const priority = candidate['priority'];

        if (priority !== undefined && (typeof priority !== 'number' || !Number.isFinite(priority)))
            throw new AiError('configuration', 'Candidate priority must be finite.');

        const quality = candidate['qualityScore'];

        if (
            quality !== undefined &&
            (typeof quality !== 'number' ||
                !Number.isFinite(quality) ||
                quality < 0 ||
                quality > 100)
        )
            throw new AiError('configuration', 'Candidate quality must be between zero and 100.');

        const cost = candidate['costClass'];

        if (
            cost !== undefined &&
            (typeof cost !== 'string' ||
                !['local', 'free-tier', 'subscription-included', 'unknown', 'paid'].includes(cost))
        )
            throw new AiError('configuration', 'Unknown candidate cost class.');

        for (const key of ['providerId', 'model', 'reasoningEffort'])
            if (candidate[key] !== undefined && !nonempty(candidate[key]))
                throw new AiError(
                    'configuration',
                    'Optional candidate identifiers must be nonempty strings.',
                );

        if (
            candidate['sessionAffinity'] !== undefined &&
            typeof candidate['sessionAffinity'] !== 'boolean'
        )
            throw new AiError('configuration', 'Candidate session affinity must be boolean.');

        if (
            candidate['inspectModelAvailability'] !== undefined &&
            typeof candidate['inspectModelAvailability'] !== 'function'
        )
            throw new AiError(
                'configuration',
                'A model availability inspector must be a function.',
            );
    }
}

function configurationRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new AiError('configuration', 'Routing definitions must be objects.');

    return Object.fromEntries(Object.entries(value));
}

function nonempty(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
}
