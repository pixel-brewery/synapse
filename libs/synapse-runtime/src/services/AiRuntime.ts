// #region Imports

import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';
import type {
    AiDriverBase,
    AiEvent,
    IAiInstance,
    IAiRequest,
    IAiResult,
    IAiRunHandle,
    IAiSessionReference,
    IAiUsage,
} from '@pixel-brewery/synapse-core';
import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { IAiRuntimeOptions } from '../interfaces/IAiRuntimeOptions.js';
import { boundedText } from '../boundedText.js';
import { BoundedAsyncQueue } from './BoundedAsyncQueue.js';
import { ProfileAccessCoordinator } from './ProfileAccessCoordinator.js';
import { snapshotAiInstance } from '../snapshotAiInstance.js';

// #endregion

/**
 * Explicit provider-neutral execution owner for CLI text jobs and resumable agent turns.
 *
 * @example
 * ```ts
 * const handle = runtime.run({ target: { instanceId: 'personal' }, prompt: 'Summarize this text.', policy: { mode: 'read-only' } });
 * const result = await handle.result;
 * await runtime.dispose();
 * ```
 *
 * @public
 */
export class AiRuntime {
    // #region Fields

    private readonly _drivers = new Map<string, AiDriverBase>();
    private readonly _instances = new Map<string, IAiInstance>();
    private readonly _preparedInstances = new Set<string>();
    private readonly _active = new Map<AbortController, Promise<IAiResult>>();
    private readonly _access: ProfileAccessCoordinator;
    private readonly _events: number;
    private readonly _maximum: number;
    private readonly _timeout: number;
    private readonly _promptBytes: number;
    private _disposed = false;
    private _cleanupFailure: unknown;
    private _configurationTail: Promise<void> = Promise.resolve();

    // #endregion

    // #region Ctor

    /**
     * Composes drivers and instances without filesystem, login, process or network effects.
     *
     * @param _options - Explicit drivers, account profiles, shared gate and budgets.
     * @throws An AiError for duplicate IDs, missing drivers or invalid deterministic configuration.
     *
     * @public
     */
    public constructor(private readonly _options: IAiRuntimeOptions) {
        this._access = _options.access ?? new ProfileAccessCoordinator();
        this._events = _options.eventCapacity ?? 256;
        this._maximum = _options.maximumRuns ?? 128;
        this._timeout = _options.defaultTimeoutMs ?? 30 * 60_000;
        this._promptBytes = _options.maximumPromptBytes ?? 4 * 1024 * 1024;

        if (
            [this._events, this._maximum, this._timeout, this._promptBytes].some(
                (value) => !Number.isSafeInteger(value) || value < 1,
            ) ||
            this._timeout > 2_147_483_647
        )
            throw new AiError('configuration', 'Invalid runtime resource budgets.');

        if (_options.temporaryDirectory && !isAbsolute(_options.temporaryDirectory))
            throw new AiError('configuration', 'The temporary workspace parent must be absolute.');

        for (const driver of _options.drivers) {
            if (!driver.id.trim() || this._drivers.has(driver.id))
                throw new AiError(
                    'configuration',
                    'Driver identifiers must be nonempty and unique.',
                );

            this._drivers.set(driver.id, driver);
        }

        for (const configuration of _options.instances) {
            const instance = snapshotAiInstance(configuration);

            if (
                !instance.id.trim() ||
                this._instances.has(instance.id) ||
                !this._drivers.has(instance.driverId) ||
                !instance.profile.id.trim() ||
                !instance.profile.applicationId.trim() ||
                !instance.profile.accountId.trim()
            )
                throw new AiError(
                    'configuration',
                    'Instances require unique identities, a registered driver and an explicit profile.',
                );

            this._instances.set(instance.id, instance);
        }
    }

    // #endregion

    // #region Properties

    /**
     * Returns the gate that must also coordinate this runtime's native authentication.
     *
     * @returns Shared execution/credential transition owner.
     *
     * @public
     */
    public get access(): ProfileAccessCoordinator {
        return this._access;
    }

    // #endregion

    // #region Methods

    /**
     * Starts one operation with optional observation and exactly one final result.
     *
     * @param request - Host prompt, target, authorization, schema and cancellation.
     * @returns Handle whose result completes independently of event consumption.
     * @remarks Failures reject result after cleanup. A critical host callback failure cancels the live attempt and never triggers provider failover.
     * Future deadlines must fit a positive 2147483647-millisecond native timer window; larger values reject before launch.
     *
     * @public
     */
    public run(request: IAiRequest): IAiRunHandle {
        const selectedInstance =
            'instanceId' in request.target
                ? this._instances.get(request.target.instanceId)
                : undefined;
        const queue = new BoundedAsyncQueue<AiEvent>(this._events, (dropped) => ({
            type: 'overflow',
            dropped,
        }));
        const controller = new AbortController();
        let hostFailure: AiError | undefined;
        let eventTail: Promise<void> = Promise.resolve();
        let pendingEvents = 0;
        const abort = (): void => {
            controller.abort(new AiError('cancelled', 'The AI operation was cancelled.'));
        };

        if (request.signal?.aborted) abort();

        request.signal?.addEventListener('abort', abort, { once: true });

        const deadline = request.deadline ?? Date.now() + this._timeout;
        const timeout = setTimeout(
            () => controller.abort(new AiError('timeout', 'The AI operation deadline expired.')),
            Math.min(2_147_483_647, Math.max(0, deadline - Date.now())),
        );
        const publishEvent = async (input: AiEvent): Promise<void> => {
            this.checkAbort(controller.signal);

            const event =
                input.type === 'progress'
                    ? { ...input, message: boundedText(input.message) }
                    : input;

            try {
                if (request.onEvent)
                    await this.interruptible(request.onEvent(event), controller.signal);
            } catch (cause) {
                if (controller.signal.aborted && cause === controller.signal.reason) throw cause;

                hostFailure ??= new AiError(
                    'persistence',
                    'The host could not persist execution progress.',
                    { cause },
                );
                controller.abort(hostFailure);

                throw hostFailure;
            }

            this.checkAbort(controller.signal);
            queue.push(event);
        };
        const emit = (input: AiEvent): Promise<void> => {
            if (pendingEvents >= this._events) {
                hostFailure ??= new AiError(
                    'host',
                    'The critical event publisher exceeded its pending-work budget.',
                );
                controller.abort(hostFailure);

                return Promise.reject(hostFailure);
            }

            pendingEvents++;

            const publication = eventTail.then(() => publishEvent(input));

            eventTail = publication;

            return publication.finally(() => {
                pendingEvents--;
            });
        };
        const normalized: IAiRequest = { ...request, signal: controller.signal, deadline };
        const admissionFailure = this._disposed
            ? new AiError('disposed', 'This AI runtime has been disposed.')
            : this._active.size >= this._maximum
              ? new AiError('host', 'The runtime run budget is exhausted.')
              : undefined;
        const result = (async (): Promise<IAiResult> => {
            await Promise.resolve();

            try {
                if (this._disposed)
                    throw new AiError('disposed', 'This AI runtime has been disposed.');

                if (admissionFailure) throw admissionFailure;

                if (
                    !request.prompt.trim() ||
                    Buffer.byteLength(request.prompt) > this._promptBytes ||
                    !Number.isSafeInteger(deadline) ||
                    deadline - Date.now() > 2_147_483_647
                )
                    throw new AiError(
                        'configuration',
                        'The prompt or execution deadline is invalid.',
                    );

                this.checkAbort(controller.signal);

                if (deadline <= Date.now())
                    throw new AiError(
                        'timeout',
                        'The AI operation deadline expired before admission.',
                    );

                if ('routeId' in request.target) {
                    if (!this._options.router)
                        throw new AiError('configuration', 'No route executor was configured.');

                    const outcome = await this._options.router.execute(
                        normalized,
                        (selected) =>
                            this.executeRoutedAttempt(
                                {
                                    ...selected,
                                    prompt: normalized.prompt,
                                    policy: normalized.policy,
                                    outputSchema: normalized.outputSchema,
                                    workingDirectory: normalized.workingDirectory,
                                    deadline,
                                },
                                controller,
                                emit,
                            ),
                        emit,
                    );

                    await eventTail;

                    return outcome;
                }

                if (!selectedInstance)
                    throw new AiError('configuration', 'The selected AI instance does not exist.');

                const outcome = await this.executeInstance(
                    normalized,
                    controller,
                    emit,
                    selectedInstance,
                );

                await eventTail;

                return outcome;
            } catch (cause) {
                if (isCleanupIncomplete(cause)) {
                    this._cleanupFailure ??= cause;

                    throw cause;
                }

                if (hostFailure) throw hostFailure;

                if (controller.signal.aborted) throw controller.signal.reason;

                throw cause instanceof AiError
                    ? cause
                    : new AiError('host', 'The AI operation failed at the host boundary.', {
                          cause,
                      });
            } finally {
                clearTimeout(timeout);
                request.signal?.removeEventListener('abort', abort);
                queue.close();
                this._active.delete(controller);
            }
        })();

        if (!admissionFailure) this._active.set(controller, result);

        void result.catch(() => undefined);

        return {
            events: queue,
            result,
            cancel: async (): Promise<void> => {
                abort();
                await result.catch((cause: unknown) => {
                    if (isCleanupIncomplete(cause)) throw cause;
                });
            },
        };
    }

    /**
     * Stops owned operations, waits for cleanup and disposes explicitly registered drivers.
     *
     * @returns Completion after run workspaces and process resources have been released.
     * @throws An AiError if driver teardown fails.
     *
     * @public
     */
    public async dispose(): Promise<void> {
        this._disposed = true;

        const active = [...this._active];

        for (const [controller] of active)
            controller.abort(new AiError('cancelled', 'The AI runtime is shutting down.'));

        await Promise.allSettled(active.map(([, result]) => result));

        const results = await Promise.allSettled(
            [...this._drivers.values()]
                .map((driver) => driver.dispose())
                .concat(this._options.router ? [this._options.router.dispose()] : []),
        );

        await this._configurationTail;

        const failures = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason);

        if (failures.length || this._cleanupFailure) {
            throw new AiError('host', 'A provider could not complete teardown.', {
                cause: new AggregateError([
                    ...(this._cleanupFailure ? [this._cleanupFailure] : []),
                    ...failures,
                ]),
                cleanupIncomplete:
                    isCleanupIncomplete(this._cleanupFailure) || failures.some(isCleanupIncomplete),
            });
        }
    }

    /**
     * Adds or updates a host-configured instance while preserving shared runtime state.
     *
     * @param configuration - Explicit driver/profile configuration; identical snapshots do not interrupt work.
     * @returns Completion after changed profiles drain and the new configuration becomes visible.
     * @throws An AiError for invalid configuration, disposal or failed profile drain.
     * @remarks Updates are serialized and acquire profile gates in stable order; no implicit discovery or login occurs.
     *
     * @public
     */
    public async configureInstance(configuration: IAiInstance): Promise<void> {
        const instance = snapshotAiInstance(configuration);
        const previousTransition = this._configurationTail;
        let release!: () => void;

        this._configurationTail = new Promise<void>((resolve) => {
            release = resolve;
        });

        try {
            await previousTransition;

            if (this._disposed) throw new AiError('disposed', 'This AI runtime has been disposed.');

            if (
                !instance.id.trim() ||
                !this._drivers.has(instance.driverId) ||
                !instance.profile.id.trim()
            )
                throw new AiError('configuration', 'The instance configuration is invalid.');

            const current = this._instances.get(instance.id);
            const identical = current && JSON.stringify(current) === JSON.stringify(instance);

            if (identical && this._preparedInstances.has(instance.id)) return;

            const replacement = identical ? current : instance;
            const profiles = [
                ...new Set([...(current ? [current.profile.id] : []), instance.profile.id]),
            ].sort();
            let update = async (): Promise<void> => {
                if (this._disposed)
                    throw new AiError('disposed', 'This AI runtime has been disposed.');

                await this._access.bindSession(replacement);

                if (current && current.profile.paths.root !== replacement.profile.paths.root) {
                    await this._access.invalidateSessions(replacement.profile);
                }

                if (this._disposed)
                    throw new AiError('disposed', 'This AI runtime has been disposed.');

                this._instances.set(instance.id, replacement);
                this._preparedInstances.add(instance.id);
            };

            for (const profile of profiles.toReversed()) {
                const nested = update;

                update = (): Promise<void> => this._access.exclusive(profile, nested);
            }

            await update();
        } finally {
            release();
        }
    }

    private initialSessionGeneration(instance: IAiInstance): string {
        const { profile } = instance;
        const paths = profile.paths;

        return (
            'initial-' +
            createHash('sha256')
                .update(
                    JSON.stringify([
                        instance.driverId,
                        profile.id,
                        profile.applicationId,
                        profile.accountId,
                        paths.root,
                        paths.home,
                        paths.configuration,
                        paths.credentials,
                        paths.execution,
                        paths.sqlite ?? null,
                    ]),
                )
                .digest('hex')
        );
    }

    private async preparedInstance(id: string): Promise<IAiInstance> {
        await this._configurationTail;

        const current = this._instances.get(id);

        if (!current)
            throw new AiError('configuration', 'The selected AI instance does not exist.');

        if (!this._preparedInstances.has(id)) {
            // Reject new jobs during authentication instead of queueing them behind a login.
            this._access.enter(current.profile.id, () => undefined)();
            await this.configureInstance(current);
        }

        const prepared = this._instances.get(id);

        if (!prepared)
            throw new AiError('configuration', 'The selected AI instance does not exist.');

        return prepared;
    }

    private async executeRoutedAttempt(
        request: IAiRequest,
        controller: AbortController,
        emit: (event: AiEvent) => Promise<void>,
    ): Promise<IAiResult> {
        const selectedSignal = request.signal;
        const cancel = (): void => {
            controller.abort(
                selectedSignal?.reason instanceof AiError
                    ? selectedSignal.reason
                    : new AiError('cancelled', 'The AI route was cancelled.'),
            );
        };

        if (selectedSignal && selectedSignal !== controller.signal) {
            selectedSignal.addEventListener('abort', cancel, { once: true });

            if (selectedSignal.aborted) cancel();
        }

        try {
            return await this.executeInstance(
                { ...request, signal: controller.signal },
                controller,
                emit,
                'instanceId' in request.target
                    ? this._instances.get(request.target.instanceId)
                    : undefined,
            );
        } finally {
            selectedSignal?.removeEventListener('abort', cancel);
        }
    }

    private async executeInstance(
        request: IAiRequest,
        controller: AbortController,
        emit: (event: AiEvent) => Promise<void>,
        expectedInstance?: IAiInstance,
    ): Promise<IAiResult> {
        if (!('instanceId' in request.target))
            throw new AiError('configuration', 'A route attempt must select an instance.');

        const instance = await this.interruptible(
            this.preparedInstance(request.target.instanceId),
            controller.signal,
        );

        if (expectedInstance && instance !== expectedInstance) {
            throw new AiError(
                'auth-busy',
                'The instance configuration changed after this request was submitted.',
            );
        }

        const driver = this._drivers.get(instance.driverId)!;
        const candidateId = request.target.candidateId ?? instance.id;

        if (!driver.capabilities.modes.includes(request.policy.mode))
            throw new AiError(
                'unsupported',
                'This driver cannot enforce the requested execution policy.',
            );

        if (request.outputSchema && driver.capabilities.structuredOutput === 'none')
            throw new AiError('unsupported', 'This driver cannot return schema-validated output.');

        if (
            request.session &&
            (!driver.capabilities.resume ||
                request.session.driverId !== driver.id ||
                request.session.instanceId !== instance.id ||
                request.session.profileId !== instance.profile.id ||
                request.session.candidateId !== candidateId)
        )
            throw new AiError(
                'session-unavailable',
                'The native session belongs to another execution owner.',
                { sessionUsable: false },
            );

        const validate = request.outputSchema ? this.validator(request.outputSchema) : undefined;

        this.checkAbort(controller.signal);

        if (this._instances.get(instance.id) !== instance) {
            throw new AiError(
                'auth-busy',
                'The instance configuration changed while execution was preparing.',
            );
        }

        const release = this._access.enter(instance.profile.id, () =>
            controller.abort(
                new AiError('cancelled', 'Authentication is changing for this profile.'),
            ),
        );
        let ownedWorkspace: string | undefined;
        let session: IAiSessionReference | undefined = request.session;
        let usage: IAiUsage | undefined;
        let executionFailure: unknown;
        let authenticationGeneration: string | undefined;
        const bind = (nativeId: string): IAiSessionReference => {
            if (!nativeId.trim() || nativeId.length > 4096)
                throw new AiError(
                    'protocol',
                    'The provider returned an invalid native session identifier.',
                );

            return {
                driverId: driver.id,
                instanceId: instance.id,
                profileId: instance.profile.id,
                candidateId,
                nativeId,
                ...(authenticationGeneration ? { authenticationGeneration } : {}),
            };
        };
        const publish = async (event: AiEvent): Promise<void> => {
            if (event.type === 'session') {
                session = bind(event.session.nativeId);
                await emit({ type: 'session', session });

                return;
            }

            if (event.type === 'usage') usage = event.usage;

            await emit(event);
        };

        try {
            const persistedGeneration = await this._access.sessionGeneration(instance.profile);

            authenticationGeneration =
                persistedGeneration ?? this.initialSessionGeneration(instance);
            this.checkAbort(controller.signal);

            const preservedLegacy =
                request.session?.authenticationGeneration === undefined &&
                persistedGeneration === undefined;

            if (
                request.session &&
                !preservedLegacy &&
                request.session.authenticationGeneration !== authenticationGeneration
            ) {
                throw new AiError(
                    'session-unavailable',
                    'The native session belongs to an earlier account or credential configuration.',
                    { sessionUsable: false },
                );
            }

            if (request.session) session = bind(request.session.nativeId);

            let workingDirectory = request.workingDirectory;

            if (workingDirectory) {
                if (!isAbsolute(workingDirectory) || !(await stat(workingDirectory)).isDirectory())
                    throw new AiError(
                        'configuration',
                        'The requested workspace must be an existing absolute directory.',
                    );
            } else {
                const parent = this._options.temporaryDirectory ?? tmpdir();

                await mkdir(parent, { recursive: true, mode: 0o700 });
                ownedWorkspace = await mkdtemp(join(parent, 'synapse-job-'));
                workingDirectory = ownedWorkspace;
            }

            this.checkAbort(controller.signal);

            const nativeRequest =
                request.outputSchema && driver.capabilities.structuredOutput === 'validated'
                    ? {
                          ...request,
                          prompt: `${request.prompt}\n\nReturn only JSON matching this JSON Schema:\n${JSON.stringify(request.outputSchema)}`,
                      }
                    : request;
            const native = await driver.execute({
                instance,
                request: nativeRequest,
                workingDirectory,
                signal: controller.signal,
                emit: publish,
                session: bind,
            });

            this.checkAbort(controller.signal);

            if (native.sessionId && session?.nativeId !== native.sessionId)
                await publish({ type: 'session', session: bind(native.sessionId) });

            if (native.usage && JSON.stringify(usage) !== JSON.stringify(native.usage))
                await publish({ type: 'usage', usage: native.usage });

            if (!native.text.trim() && (!validate || native.structured === undefined))
                throw new AiError('protocol', 'The provider completed without a final result.');

            let structured: unknown;

            if (validate) {
                try {
                    structured =
                        native.structured !== undefined
                            ? native.structured
                            : JSON.parse(native.text);
                } catch (cause) {
                    throw new AiError(
                        'result-validation',
                        'The provider result is not valid JSON.',
                        {
                            cause,
                        },
                    );
                }

                if (!validate(structured))
                    throw new AiError(
                        'result-validation',
                        'The provider result does not match the requested JSON Schema.',
                    );
            }

            return {
                text: native.text,
                ...(validate ? { structured } : {}),
                ...(session ? { session } : {}),
                ...(usage ? { usage } : {}),
                instanceId: instance.id,
                driverId: driver.id,
                profileId: instance.profile.id,
                candidateId,
            };
        } catch (cause) {
            executionFailure = cause;

            throw cause;
        } finally {
            try {
                await this.cleanupWorkspace(ownedWorkspace, executionFailure);
            } finally {
                release(executionFailure);
            }
        }
    }

    private async cleanupWorkspace(workspace?: string, primaryFailure?: unknown): Promise<void> {
        try {
            if (workspace) await rm(workspace, { recursive: true, force: true });
        } catch (cause) {
            throw isCleanupIncomplete(primaryFailure)
                ? primaryFailure
                : new AiError('host', 'The text workspace could not be cleaned up.', { cause });
        }
    }

    private validator(schema: Readonly<Record<string, unknown>>): (value: unknown) => boolean {
        try {
            if (Buffer.byteLength(JSON.stringify(schema)) > 1024 * 1024)
                throw new AiError('configuration', 'The JSON Schema exceeded its byte budget.');

            const dialect = schema['$schema'];
            const ajv =
                typeof dialect === 'string' && dialect.includes('draft-07')
                    ? new Ajv({ strict: true, allErrors: true })
                    : new Ajv2020({ strict: true, allErrors: true });
            const validate = ajv.compile(schema);

            if (schema['$async'])
                throw new AiError('configuration', 'Asynchronous result schemas are unsupported.');

            return (value: unknown): boolean => validate(value) === true;
        } catch (cause) {
            throw cause instanceof AiError
                ? cause
                : new AiError(
                      'configuration',
                      'The requested JSON Schema is invalid or unsupported.',
                      {
                          cause,
                      },
                  );
        }
    }

    private checkAbort(signal: AbortSignal): void {
        if (signal.aborted)
            throw signal.reason instanceof AiError
                ? signal.reason
                : new AiError('cancelled', 'The AI operation was cancelled.');
    }

    private async interruptible<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
        this.checkAbort(signal);

        let abort!: () => void;
        const interrupted = new Promise<never>((_, reject) => {
            abort = (): void => reject(signal.reason);
        });

        signal.addEventListener('abort', abort, { once: true });

        try {
            return await Promise.race([promise, interrupted]);
        } finally {
            signal.removeEventListener('abort', abort);
        }
    }

    // #endregion
}
