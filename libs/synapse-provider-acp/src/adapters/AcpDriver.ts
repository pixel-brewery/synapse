// #region Imports

import {
    client,
    methods,
    ndJsonStream,
    PROTOCOL_VERSION,
    type ClientApp,
    type ClientConnection,
    type InitializeResponse,
    type SessionConfigOption,
    type SessionModeState,
    type RequestPermissionRequest,
    type RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import {
    AiDriverBase,
    AiError,
    isCleanupIncomplete,
    type AiAuthDriverBase,
    type IAiCapabilities,
    type IAiDriverResult,
    type IAiExecutionContext,
    type IAiInspection,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import {
    boundedText,
    createProfileEnvironment,
    type IInteractiveProcess,
    type ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import type { IAcpDriverOptions } from '../interfaces/IAcpDriverOptions.js';

// #endregion

/**
 * Generic installed-agent ACP stdio adapter using the official TypeScript SDK.
 *
 * @remarks ACP does not define a universal filesystem sandbox. The host must supply trusted native policy-mode mappings; unsupported guarantees fail before prompting. Client filesystem and terminal capabilities are never advertised.
 *
 * @public
 */
export class AcpDriver extends AiDriverBase {
    // #region Fields

    /**
     * Open implementation ID, defaulting to acp.
     *
     * @public
     */
    public override readonly id: string;

    /**
     * Host-declared native policy modes, with resume verified again through negotiation.
     *
     * @public
     */
    public override readonly capabilities: IAiCapabilities;

    /**
     * Optional separately verified native authentication implementation.
     *
     * @public
     */
    public override readonly auth: AiAuthDriverBase | undefined;

    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Creates an inert protocol adapter with explicit native policy semantics.
     *
     * @param _runner - Owned process boundary, shared with the runtime.
     * @param _options - Native arguments, trusted mode mappings and optional host permissions.
     * @throws An AiError when deterministic native mode or resource settings are invalid.
     *
     * @public
     */
    public constructor(
        private readonly _runner: ProcessRunnerBase,
        private readonly _options: IAcpDriverOptions,
    ) {
        super();

        if (
            !_options.modeIds ||
            typeof _options.modeIds !== 'object' ||
            Array.isArray(_options.modeIds)
        )
            throw new AiError('configuration', 'ACP requires explicit native policy mappings.');

        if (_options.args && !_options.args.every((argument) => typeof argument === 'string'))
            throw new AiError('configuration', 'ACP native arguments must be strings.');

        if (
            !['read-only', 'workspace-write'].every((mode) => {
                const value =
                    mode === 'read-only'
                        ? _options.modeIds['read-only']
                        : _options.modeIds['workspace-write'];

                return value === undefined || (typeof value === 'string' && !!value.trim());
            })
        )
            throw new AiError(
                'configuration',
                'ACP policy mappings must contain nonempty native mode identifiers.',
            );

        for (const limit of [_options.maxMessageBytes, _options.maxOutputBytes])
            if (limit !== undefined && (!Number.isSafeInteger(limit) || limit <= 0))
                throw new AiError(
                    'configuration',
                    'ACP resource limits must be positive safe integers.',
                );

        this.id = _options.id ?? 'acp';
        this.auth = _options.auth;
        this.capabilities = {
            modes: [
                ...(_options.modeIds['read-only'] ? ['read-only' as const] : []),
                ...(_options.modeIds['workspace-write'] ? ['workspace-write' as const] : []),
            ],
            resume: _options.resume ?? true,
            structuredOutput: 'validated',
            tools: true,
        };
    }

    // #endregion

    // #region Methods

    /**
     * Negotiates the agent, binds a session, enforces configured native policy and executes one turn.
     *
     * @param context - Isolated profile, explicit request, cancellation and critical event callback.
     * @returns The same turn's final text and bound native continuation ID.
     * @throws An AiError for unsupported security/model capabilities, protocol failure, cancellation or unconfirmed native process cleanup. Cleanup uncertainty takes precedence over another failure and disables retries.
     *
     * @public
     */
    public override async execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
        if (this._disposed) throw new AiError('disposed', 'AcpDriver has been disposed.');

        if (context.signal.aborted)
            throw context.signal.reason instanceof AiError
                ? context.signal.reason
                : new AiError('cancelled', 'ACP execution was cancelled before launch.');

        if (context.request.deadline !== undefined && context.request.deadline <= Date.now())
            throw new AiError('timeout', 'ACP execution deadline expired before launch.');

        const modeId = this._options.modeIds[context.request.policy.mode];

        if (!modeId)
            throw new AiError(
                'unsupported',
                'This ACP driver has no trusted native mapping for the requested execution policy.',
            );

        if (
            context.request.policy.allowedTools?.length ||
            context.request.policy.deniedTools?.length
        )
            throw new AiError(
                'unsupported',
                'ACP does not define a portable tool-name allowlist or denylist.',
            );

        if (context.request.model && !this._options.modelConfigId)
            throw new AiError(
                'unsupported',
                'This ACP driver has no advertised model-selection mapping.',
            );

        if (context.request.reasoningEffort && !this._options.reasoningConfigId)
            throw new AiError(
                'unsupported',
                'This ACP driver has no advertised reasoning-selection mapping.',
            );

        let connection: ClientConnection | undefined;
        let activeSession: string | undefined;
        let acceptingUpdates = false;
        let text = '';
        let failure: unknown;
        let updates: Promise<void> = Promise.resolve();
        const app = client({ name: 'synapse' })
            .onNotification(methods.client.session.update, ({ params }) => {
                if (!acceptingUpdates || params.sessionId !== activeSession) return;

                updates = updates
                    .then(async () => {
                        if (failure) return;

                        const update = params.update;

                        if (
                            update.sessionUpdate === 'agent_message_chunk' &&
                            update.content.type === 'text'
                        ) {
                            text += update.content.text;
                            await context.emit({ type: 'text', text: update.content.text });
                        } else if (
                            update.sessionUpdate === 'agent_thought_chunk' &&
                            update.content.type === 'text'
                        )
                            await context.emit({
                                type: 'progress',
                                category: 'reasoning',
                                message: boundedText(update.content.text),
                            });
                        else if (update.sessionUpdate === 'tool_call')
                            await context.emit({
                                type: 'progress',
                                category: 'tool',
                                message: boundedText(update.title),
                            });
                        else if (
                            (update.sessionUpdate === 'current_mode_update' &&
                                update.currentModeId !== modeId) ||
                            (update.sessionUpdate === 'config_option_update' &&
                                update.configOptions.some(
                                    (option) =>
                                        option.category === 'mode' &&
                                        option.currentValue !== modeId,
                                ))
                        )
                            throw new AiError(
                                'unsupported',
                                'The ACP agent changed away from the authorized native policy mode.',
                            );
                    })
                    .catch((cause: unknown) => {
                        failure = cause;
                        connection?.close(cause);
                    });
            })
            .onRequest(methods.client.session.requestPermission, async ({ params }) => {
                if (
                    !acceptingUpdates ||
                    params.sessionId !== activeSession ||
                    context.signal.aborted
                )
                    return { outcome: { outcome: 'cancelled' } };

                try {
                    return await this.permission(params, context);
                } catch (cause) {
                    failure =
                        cause instanceof AiError
                            ? cause
                            : new AiError('host', 'The host ACP permission callback failed.', {
                                  cause,
                              });
                    connection?.close(failure);

                    throw failure;
                }
            });

        try {
            return await this.withConnection(
                context.instance,
                context.workingDirectory,
                context.signal,
                app,
                async (opened) => {
                    connection = opened;

                    const initialized = await this.initialize(opened, context.signal);
                    const nativeSession = context.request.session?.nativeId;
                    let modes: SessionModeState | null | undefined;
                    let options: SessionConfigOption[] | null | undefined;

                    if (nativeSession) {
                        if (
                            !this.capabilities.resume ||
                            !initialized.agentCapabilities?.loadSession
                        )
                            throw new AiError(
                                'unsupported',
                                'The ACP agent did not negotiate native session loading.',
                            );

                        const loaded = await opened.agent.request(
                            methods.agent.session.load,
                            {
                                sessionId: nativeSession,
                                cwd: context.workingDirectory,
                                mcpServers: [],
                            },
                            { cancellationSignal: context.signal },
                        );

                        activeSession = nativeSession;
                        modes = loaded.modes;
                        options = loaded.configOptions;
                    } else {
                        const created = await opened.agent.request(
                            methods.agent.session.new,
                            { cwd: context.workingDirectory, mcpServers: [] },
                            { cancellationSignal: context.signal },
                        );

                        activeSession = created.sessionId;
                        modes = created.modes;
                        options = created.configOptions;
                    }

                    if (!activeSession?.trim())
                        throw new AiError(
                            'protocol',
                            'The ACP agent returned an invalid native session identity.',
                        );

                    await this.applyMode(
                        opened,
                        activeSession,
                        modes,
                        options,
                        modeId,
                        context.signal,
                    );
                    await this.applySelection(
                        opened,
                        activeSession,
                        options,
                        this._options.modelConfigId,
                        context.request.model,
                        context.signal,
                    );
                    await this.applySelection(
                        opened,
                        activeSession,
                        options,
                        this._options.reasoningConfigId,
                        context.request.reasoningEffort,
                        context.signal,
                    );
                    await context.emit({
                        type: 'session',
                        session: context.session(activeSession),
                    });
                    acceptingUpdates = true;

                    const sessionId = activeSession;
                    const cancel = (): void => {
                        void opened.agent
                            .notify(methods.agent.session.cancel, { sessionId })
                            .catch(() => undefined);
                    };

                    context.signal.addEventListener('abort', cancel, { once: true });

                    try {
                        const result = await opened.agent.request(
                            methods.agent.session.prompt,
                            { sessionId, prompt: [{ type: 'text', text: context.request.prompt }] },
                            { cancellationSignal: context.signal },
                        );

                        await updates;

                        if (failure) throw failure;

                        if (result.stopReason === 'cancelled' || context.signal.aborted)
                            throw new AiError('cancelled', 'The ACP turn was cancelled.');

                        if (result.stopReason !== 'end_turn')
                            throw new AiError(
                                'provider',
                                `The ACP turn stopped with ${result.stopReason}.`,
                                {
                                    retryable: result.stopReason !== 'refusal',
                                },
                            );

                        if (!text.trim())
                            throw new AiError('provider', 'The ACP turn completed without text.', {
                                retryable: true,
                            });

                        return { text: text.trim(), sessionId };
                    } finally {
                        context.signal.removeEventListener('abort', cancel);
                    }
                },
                Math.min(
                    2_147_483_647,
                    Math.max(1, (context.request.deadline ?? Date.now() + 300_000) - Date.now()),
                ),
            );
        } catch (cause) {
            if (isCleanupIncomplete(cause)) throw cause;

            if (failure) throw failure;

            if (cause instanceof AiError) throw cause;

            if (context.signal.aborted)
                throw context.signal.reason instanceof AiError
                    ? context.signal.reason
                    : new AiError('cancelled', 'The ACP operation was cancelled.');

            throw new AiError(
                'protocol',
                'The ACP agent could not complete the protocol operation.',
                {
                    cause,
                },
            );
        }
    }

    /**
     * Performs only bounded initialization and optional independent native account verification.
     *
     * @param instance - Isolated native agent instance.
     * @param signal - Inspection cancellation.
     * @returns Safe account metadata, without sending session, filesystem, terminal or MCP setup requests.
     * @throws An AiError if the native handshake fails or negotiates an incompatible protocol.
     *
     * @public
     */
    public override async inspect(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<IAiInspection> {
        await this.withConnection(
            instance,
            instance.profile.paths.home,
            signal,
            client({ name: 'synapse' }),
            async (connection) => {
                await this.initialize(connection, signal);
            },
            10_000,
        );

        return {
            auth: this.auth
                ? await this.auth.status(instance, signal)
                : {
                      authenticated: false,
                      message:
                          'ACP exposes no non-mutating account verification; supply a native auth adapter when needed.',
                  },
        };
    }

    /**
     * Stops and awaits processes owned by this explicitly injected runner.
     *
     * @returns Completion after native execution, protocol and login processes have drained.
     *
     * @public
     */
    public override async dispose(): Promise<void> {
        this._disposed = true;
        await this._runner.dispose();
    }

    private async initialize(
        connection: ClientConnection,
        signal: AbortSignal,
    ): Promise<InitializeResponse> {
        const initialized = await connection.agent.request(
            methods.agent.initialize,
            { protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} },
            { cancellationSignal: signal },
        );

        if (initialized.protocolVersion !== PROTOCOL_VERSION)
            throw new AiError(
                'unsupported',
                'The ACP agent negotiated an incompatible protocol version.',
            );

        return initialized;
    }

    private async applyMode(
        connection: ClientConnection,
        sessionId: string,
        modes: SessionModeState | null | undefined,
        options: SessionConfigOption[] | null | undefined,
        modeId: string,
        signal: AbortSignal,
    ): Promise<void> {
        const modeOption = options?.find((option) => option.category === 'mode');

        if (modeOption) {
            await this.applySelection(
                connection,
                sessionId,
                options,
                modeOption.id,
                modeId,
                signal,
            );

            return;
        }

        if (!modes?.availableModes.some((mode) => mode.id === modeId))
            throw new AiError(
                'unsupported',
                'The ACP agent did not advertise the configured native policy mode.',
            );

        if (modes.currentModeId !== modeId)
            await connection.agent.request(
                methods.agent.session.setMode,
                { sessionId, modeId },
                { cancellationSignal: signal },
            );
    }

    private async applySelection(
        connection: ClientConnection,
        sessionId: string,
        options: SessionConfigOption[] | null | undefined,
        configId: string | undefined,
        value: string | undefined,
        signal: AbortSignal,
    ): Promise<void> {
        if (!value) return;

        const option = options?.find((entry) => entry.id === configId);

        if (!option || !selectValues(option).includes(value))
            throw new AiError(
                'unsupported',
                'The ACP agent did not advertise the requested native configuration value.',
            );

        const updated = await connection.agent.request(
            methods.agent.session.setConfigOption,
            { sessionId, configId: option.id, value },
            { cancellationSignal: signal },
        );

        if (updated.configOptions.find((entry) => entry.id === option.id)?.currentValue !== value)
            throw new AiError(
                'unsupported',
                'The ACP agent did not confirm the requested configuration value.',
            );
    }

    private async permission(
        params: RequestPermissionRequest,
        context: IAiExecutionContext,
    ): Promise<RequestPermissionResponse> {
        const denied = (): RequestPermissionResponse => {
            const reject =
                params.options.find((option) => option.kind === 'reject_once') ??
                params.options.find((option) => option.kind === 'reject_always');

            return reject
                ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
                : { outcome: { outcome: 'cancelled' } };
        };

        if (
            !this._options.permission ||
            (context.request.policy.mode === 'read-only' &&
                (!params.toolCall.kind ||
                    ['edit', 'delete', 'execute', 'switch_mode', 'other'].includes(
                        params.toolCall.kind,
                    )))
        )
            return denied();

        const selected = await this._options.permission({
            sessionId: params.sessionId,
            toolCallId: params.toolCall.toolCallId,
            title: boundedText(params.toolCall.title ?? 'ACP tool permission'),
            ...(params.toolCall.kind ? { kind: params.toolCall.kind } : {}),
            options: params.options.map((option) => ({
                id: option.optionId,
                label: boundedText(option.name),
                kind: option.kind,
            })),
        });

        if (!selected) return denied();

        if (!params.options.some((option) => option.optionId === selected))
            throw new AiError('host', 'The host selected an unknown ACP permission option.');

        return { outcome: { outcome: 'selected', optionId: selected } };
    }

    private async withConnection<T>(
        instance: IAiInstance,
        workingDirectory: string,
        signal: AbortSignal,
        app: ClientApp,
        operation: (connection: ClientConnection) => Promise<T>,
        timeoutMs = 300_000,
    ): Promise<T> {
        if (!instance.executable)
            throw new AiError(
                'configuration',
                'ACP requires an explicitly selected installed executable.',
            );

        let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
        let inputClosed = false;
        let control: IInteractiveProcess | undefined;
        let connection: ClientConnection | undefined;
        let stopped = false;
        let processFailure: unknown;
        let cleanExit = false;
        let readyResolve: (() => void) | undefined;
        let readyReject: ((cause: unknown) => void) | undefined;
        const ready = new Promise<void>((resolve, reject) => {
            readyResolve = resolve;
            readyReject = reject;
        });
        const closeInput = (cause?: unknown): void => {
            if (inputClosed) return;

            inputClosed = true;

            if (cause) controller?.error(cause);
            else controller?.close();
        };
        const incoming = new ReadableStream<Uint8Array>({
            start: (value) => {
                controller = value;
            },
            cancel: () => {
                inputClosed = true;
            },
        });
        const decoder = new TextDecoder();
        const outgoing = new WritableStream<Uint8Array>({
            write: (chunk) => {
                if (!control) throw new AiError('host', 'ACP process stdin is unavailable.');

                control.write(decoder.decode(chunk, { stream: true }));
            },
        });
        const completed = this._runner
            .run({
                executable: instance.executable,
                args: this._options.args ?? [],
                workingDirectory,
                environment: await createProfileEnvironment(instance),
                signal,
                keepInputOpen: true,
                timeoutMs,
                maxOutputBytes: this._options.maxOutputBytes ?? 4 * 1024 * 1024,
                onStart: (value) => {
                    control = value;
                    readyResolve?.();
                },
                onStdout: (chunk) => {
                    if (!inputClosed) controller?.enqueue(new TextEncoder().encode(chunk));
                },
            })
            .then(
                (result) => {
                    if (!stopped && result.exitCode === 0 && control) {
                        cleanExit = true;
                        closeInput();

                        return result;
                    }

                    if (!stopped) {
                        const cause = new AiError(
                            'provider',
                            'The ACP process exited before the protocol operation finished.',
                            { retryable: true },
                        );

                        processFailure = cause;
                        readyReject?.(cause);
                        closeInput(cause);
                        connection?.close(cause);
                    }

                    return result;
                },
                (cause: unknown) => {
                    processFailure = cause;
                    readyReject?.(cause);
                    closeInput(cause);
                    connection?.close(cause);
                },
            );
        let outcome:
            | { readonly success: true; readonly value: T }
            | { readonly success: false; readonly cause: unknown };
        let cleanupFailure: unknown;

        try {
            await ready;

            if (processFailure) throw processFailure;

            connection = app.connect(
                ndJsonStream(outgoing, incoming, {
                    maxMessageBytes: this._options.maxMessageBytes ?? 1024 * 1024,
                }),
            );
            outcome = { success: true, value: await operation(connection) };
        } catch (cause) {
            outcome = { success: false, cause };
        } finally {
            stopped = true;
            connection?.close();

            try {
                await control?.stop();
                await completed;
            } catch (cause) {
                cleanupFailure = cause;
            }

            closeInput();
        }

        const unconfirmedCleanup = [cleanupFailure, processFailure].find(isCleanupIncomplete);

        if (unconfirmedCleanup !== undefined)
            throw new AiError('host', 'The ACP process termination could not be confirmed.', {
                cause: outcome.success
                    ? unconfirmedCleanup
                    : new AggregateError(
                          [outcome.cause, unconfirmedCleanup],
                          'The ACP operation failed with unconfirmed process cleanup.',
                      ),
                cleanupIncomplete: true,
            });

        if (!outcome.success) {
            if (outcome.cause instanceof AiError) throw outcome.cause;

            if (processFailure) throw processFailure;

            if (cleanExit)
                throw new AiError(
                    'provider',
                    'The ACP agent closed before the requested protocol operation completed.',
                    { retryable: true },
                );

            throw outcome.cause;
        }

        if (processFailure) throw processFailure;

        if (cleanupFailure) throw cleanupFailure;

        return outcome.value;
    }

    // #endregion
}

function selectValues(option: SessionConfigOption): readonly string[] {
    if (option.type !== 'select') return [];

    return option.options.flatMap((value) =>
        'options' in value ? value.options.map((entry) => entry.value) : [value.value],
    );
}
