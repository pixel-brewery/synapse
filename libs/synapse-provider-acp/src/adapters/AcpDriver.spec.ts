// #region Imports

import {
    AiError,
    type AiEvent,
    type IAiExecutionContext,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import {
    ProcessRunnerBase,
    type IProcessRequest,
    type IProcessResult,
} from '@pixel-brewery/synapse-runtime';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AcpDriver } from './AcpDriver.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function instance(): Promise<IAiInstance> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-acp-'));

    owned.push(root);

    return {
        id: 'i',
        driverId: 'acp',
        executable: 'synthetic-acp-agent',
        profile: {
            id: 'p',
            applicationId: 'a',
            accountId: 'b',
            paths: {
                root,
                home: join(root, 'home'),
                configuration: join(root, 'config'),
                credentials: join(root, 'credentials'),
                execution: join(root, 'execution'),
                temporary: join(root, 'tmp'),
            },
        },
    };
}

function context(selected: IAiInstance, events: AiEvent[]): IAiExecutionContext {
    return {
        instance: selected,
        workingDirectory: selected.profile.paths.home,
        request: {
            target: { instanceId: selected.id },
            prompt: 'Summarize this transcript.',
            policy: { mode: 'read-only' },
        },
        signal: new AbortController().signal,
        emit: async (event) => {
            events.push(event);
        },
        session: (nativeId) => ({
            nativeId,
            driverId: 'acp',
            instanceId: selected.id,
            profileId: selected.profile.id,
            candidateId: selected.id,
        }),
    };
}

class ProtocolRunner extends ProcessRunnerBase {
    // #region Fields

    public readonly requests: IProcessRequest[] = [];
    public readonly calls: string[] = [];
    public stopped = 0;
    public permissionOutcome: unknown;
    public initializeParams: unknown;
    private _pending: Promise<void> = Promise.resolve();
    private _promptId: unknown;
    private _complete: ((result: IProcessResult) => void) | undefined;

    // #endregion

    // #region Ctor

    public constructor(
        private readonly _options: {
            modes?: boolean;
            loadSession?: boolean;
            permission?: boolean;
            exitAfterPrompt?: number;
            cleanupFailure?: AiError;
            configurationUpdate?: { category: 'mode' | 'model'; currentValue: string };
        } = {},
    ) {
        super();
    }

    // #endregion

    // #region Methods

    public override async run(request: IProcessRequest): Promise<IProcessResult> {
        this.requests.push(request);

        return new Promise<IProcessResult>((resolve, reject) => {
            this._complete = resolve;
            request.signal?.addEventListener(
                'abort',
                () => {
                    reject(new AiError('cancelled', 'Synthetic process cancelled.'));
                },
                { once: true },
            );
            request.onStart?.({
                write: (value) => {
                    this._pending = this._pending.then(async () => {
                        for (const line of value.split('\n').filter(Boolean))
                            await this.receive(request, JSON.parse(line));
                    });
                    void this._pending.catch(reject);
                },
                end: () => undefined,
                stop: async () => {
                    this.stopped++;

                    if (this._options.cleanupFailure) {
                        reject(this._options.cleanupFailure);

                        throw this._options.cleanupFailure;
                    }

                    resolve({ stdout: '', stderr: '', exitCode: 0, signal: null });
                },
            });
        });
    }

    public override async dispose(): Promise<void> {}

    private async receive(request: IProcessRequest, value: unknown): Promise<void> {
        if (!record(value)) throw new Error('Invalid synthetic wire request.');

        const method = value['method'];

        if (typeof method !== 'string') {
            if (value['id'] === 'permission') {
                this.permissionOutcome = value['result'];
                await this.finish(request, this._promptId);
            }

            return;
        }

        this.calls.push(method);

        let result: unknown = {};

        if (method === 'initialize') {
            this.initializeParams = value['params'];
            result = {
                protocolVersion: 1,
                agentCapabilities: { loadSession: this._options.loadSession ?? true },
            };
        } else if (method === 'session/new')
            result = {
                sessionId: 'native-fixture',
                ...(this._options.modes === false
                    ? {}
                    : {
                          modes: {
                              currentModeId: 'plan',
                              availableModes: [
                                  { id: 'plan', name: 'Read only' },
                                  { id: 'code', name: 'Write' },
                              ],
                          },
                      }),
            };
        else if (method === 'session/load')
            result = {
                modes: {
                    currentModeId: 'plan',
                    availableModes: [{ id: 'plan', name: 'Read only' }],
                },
            };
        else if (method === 'session/prompt') {
            if (this._options.configurationUpdate)
                await this.send(request, {
                    jsonrpc: '2.0',
                    method: 'session/update',
                    params: {
                        sessionId: 'native-fixture',
                        update: {
                            sessionUpdate: 'config_option_update',
                            configOptions: [
                                {
                                    id: this._options.configurationUpdate.category,
                                    name: 'Native configuration',
                                    category: this._options.configurationUpdate.category,
                                    type: 'select',
                                    currentValue: this._options.configurationUpdate.currentValue,
                                    options: [
                                        { value: 'plan', name: 'Plan' },
                                        { value: 'code', name: 'Code' },
                                    ],
                                },
                            ],
                        },
                    },
                });

            if (this._options.permission) {
                this._promptId = value['id'];
                await this.send(request, {
                    jsonrpc: '2.0',
                    id: 'permission',
                    method: 'session/request_permission',
                    params: {
                        sessionId: 'native-fixture',
                        toolCall: { toolCallId: 'edit-1', kind: 'edit', title: 'Edit file' },
                        options: [
                            { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
                            { optionId: 'no', name: 'Reject', kind: 'reject_once' },
                        ],
                    },
                });

                return;
            }

            await this.finish(request, value['id']);

            return;
        }

        await this.send(request, { jsonrpc: '2.0', id: value['id'], result });
    }

    private async finish(request: IProcessRequest, id: unknown): Promise<void> {
        await this.send(request, {
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
                sessionId: 'native-fixture',
                update: {
                    sessionUpdate: 'agent_message_chunk',
                    content: { type: 'text', text: 'Decisions and next steps.' },
                },
            },
        });
        await this.send(request, { jsonrpc: '2.0', id, result: { stopReason: 'end_turn' } });

        if (this._options.exitAfterPrompt !== undefined)
            this._complete?.({
                stdout: '',
                stderr: '',
                exitCode: this._options.exitAfterPrompt,
                signal: null,
            });
    }

    private async send(request: IProcessRequest, frame: unknown): Promise<void> {
        const text = JSON.stringify(frame) + '\n';

        for (let i = 0; i < text.length; i += 5) await request.onStdout?.(text.slice(i, i + 5));
    }

    // #endregion
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('AcpDriver', () => {
    it.each(['protocol', 'host-progress'] as const)(
        'preserves unconfirmed native cleanup together with an earlier %s failure',
        async (source) => {
            // Arrange
            const selected = await instance();
            const cleanup = new AiError('host', 'Synthetic native termination was not confirmed.', {
                cleanupIncomplete: true,
            });
            const runner = new ProtocolRunner({
                cleanupFailure: cleanup,
                modes: source === 'host-progress',
            });
            const primary = new AiError('persistence', 'Host storage failed.');
            const value = context(selected, []);
            const events = vi.fn(async (event: AiEvent) => {
                if (source === 'host-progress' && event.type === 'text') throw primary;
            });

            // Act
            const result = new AcpDriver(runner, {
                modeIds: { 'read-only': 'plan' },
            }).execute({ ...value, emit: events });

            // Assert
            await expect(result).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
                retryable: false,
                sessionUsable: false,
                cause: expect.any(AggregateError),
            });

            const error: unknown = await result.catch((cause: unknown) => cause);

            expect(error).toBeInstanceOf(AiError);

            if (!(error instanceof AiError) || !(error.cause instanceof AggregateError))
                throw new Error('The ACP failure must preserve both operation and cleanup causes.');

            expect(error.cause.errors).toContain(cleanup);

            if (source === 'host-progress') expect(error.cause.errors).toContain(primary);
            else
                expect(error.cause.errors).toContainEqual(
                    expect.objectContaining({ code: 'unsupported' }),
                );

            expect(runner.requests).toHaveLength(1);
            expect(runner.stopped).toBe(1);
        },
    );

    it.each([
        { category: 'mode' as const, currentValue: 'code', accepted: false },
        { category: 'mode' as const, currentValue: 'plan', accepted: true },
        { category: 'model' as const, currentValue: 'code', accepted: true },
    ])(
        'checks native configuration updates for $category=$currentValue',
        async ({ category, currentValue, accepted }) => {
            // Arrange
            const selected = await instance();
            const runner = new ProtocolRunner({
                configurationUpdate: { category, currentValue },
            });

            // Act
            const result = new AcpDriver(runner, {
                modeIds: { 'read-only': 'plan' },
            }).execute(context(selected, []));

            // Assert
            if (accepted)
                await expect(result).resolves.toMatchObject({ text: 'Decisions and next steps.' });
            else await expect(result).rejects.toMatchObject({ code: 'unsupported' });

            expect(runner.calls).toContain('session/prompt');
            expect(runner.stopped).toBe(1);
        },
    );

    it('accepts an agent that exits cleanly after its complete prompt response', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner({ exitAfterPrompt: 0 });

        // Act
        const result = await new AcpDriver(runner, { modeIds: { 'read-only': 'plan' } }).execute(
            context(selected, []),
        );

        // Assert
        expect(result.text).toBe('Decisions and next steps.');
        expect(runner.stopped).toBe(1);
    });
    it('does not accept a failed native exit even after receiving a prompt response', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner({ exitAfterPrompt: 1 });

        // Act
        const result = new AcpDriver(runner, { modeIds: { 'read-only': 'plan' } }).execute(
            context(selected, []),
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'provider' });
    });

    it('uses the official SDK over fragmented stdio and drains the owned process after one turn', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner();
        const events: AiEvent[] = [];

        // Act
        const result = await new AcpDriver(runner, { modeIds: { 'read-only': 'plan' } }).execute(
            context(selected, events),
        );

        // Assert
        expect(result).toEqual({ text: 'Decisions and next steps.', sessionId: 'native-fixture' });
        expect(runner.stopped).toBe(1);
        expect(runner.calls).toEqual(['initialize', 'session/new', 'session/prompt']);
        expect(runner.initializeParams).toMatchObject({ clientCapabilities: {} });
        expect(events).toContainEqual(
            expect.objectContaining({
                type: 'session',
                session: expect.objectContaining({ profileId: 'p', nativeId: 'native-fixture' }),
            }),
        );
    });
    it('rejects a missing trusted policy mapping before starting an agent', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner();

        // Act
        const result = new AcpDriver(runner, { modeIds: {} }).execute(context(selected, []));

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'unsupported' });
        expect(runner.requests).toHaveLength(0);
    });
    it('does not prompt when the agent fails to advertise the configured policy mode', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner({ modes: false });

        // Act
        const result = new AcpDriver(runner, { modeIds: { 'read-only': 'plan' } }).execute(
            context(selected, []),
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'unsupported' });
        expect(runner.calls).not.toContain('session/prompt');
        expect(runner.stopped).toBe(1);
    });
    it('checks negotiated session loading before forwarding a native continuation', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner({ loadSession: false });
        const value = context(selected, []);

        // Act
        const result = new AcpDriver(runner, { modeIds: { 'read-only': 'plan' } }).execute({
            ...value,
            request: { ...value.request, session: value.session('old-native') },
        });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'unsupported' });
        expect(runner.calls).toEqual(['initialize']);
    });
    it('denies writing permission in a read-only mode even if the host callback would allow it', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner({ permission: true });
        const permission = vi.fn(async () => 'yes');

        // Act
        await new AcpDriver(runner, { modeIds: { 'read-only': 'plan' }, permission }).execute(
            context(selected, []),
        );

        // Assert
        expect(permission).not.toHaveBeenCalled();
        expect(runner.permissionOutcome).toEqual({
            outcome: { outcome: 'selected', optionId: 'no' },
        });
    });
    it('stops the native process and preserves a host event failure instead of retrying', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ProtocolRunner();
        const failure = new AiError('persistence', 'Host storage failed.');
        const value = context(selected, []);

        // Act
        const result = new AcpDriver(runner, { modeIds: { 'read-only': 'plan' } }).execute({
            ...value,
            emit: async (event) => {
                if (event.type === 'text') throw failure;
            },
        });

        // Assert
        await expect(result).rejects.toBe(failure);
        expect(runner.requests).toHaveLength(1);
        expect(runner.stopped).toBe(1);
    });
});
