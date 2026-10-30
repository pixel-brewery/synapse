// #region Imports

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AiError,
    type IAiAuthContext,
    type IAiAuthInteraction,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import type {
    IInteractiveProcess,
    IProcessRequest,
    IProcessResult,
    ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { ClaudeAuthDriver } from './ClaudeAuthDriver.js';

// #endregion

const owned: string[] = [];
const completed: IProcessResult = { stdout: '', stderr: '', exitCode: 0, signal: null };

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function instance(): Promise<IAiInstance> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-claude-auth-'));

    owned.push(root);

    return {
        id: root,
        driverId: 'claude',
        profile: {
            id: root,
            applicationId: 'fixture-app',
            accountId: 'fixture-account',
            paths: {
                root,
                home: join(root, 'home'),
                credentials: join(root, 'credentials'),
                configuration: join(root, 'configuration'),
                execution: join(root, 'execution'),
                temporary: join(root, 'tmp'),
            },
        },
    };
}

function runner(run: (request: IProcessRequest) => Promise<IProcessResult>): ProcessRunnerBase {
    return { run: vi.fn(run), dispose: vi.fn(async () => undefined) };
}

function context(
    account: IAiInstance,
    methodId: string,
    interactions: IAiAuthInteraction[] = [],
    response: IAiAuthContext['response'] = () => new Promise(() => undefined),
): IAiAuthContext {
    return {
        instance: account,
        methodId,
        signal: new AbortController().signal,
        interaction: (value) => {
            interactions.push(value);
        },
        response,
    };
}

describe('ClaudeAuthDriver', () => {
    it.each([
        ['subscription', '--claudeai'],
        ['console', '--console'],
        ['sso', '--sso'],
    ])('runs the supported native %s procedure without an API key', async (method, flag) => {
        // Arrange
        const account = await instance();
        const interactions: IAiAuthInteraction[] = [];
        const url =
            'https://claude.com/cai/oauth/authorize?state=synthetic-state&client_id=synthetic-client';
        const transport = runner(async (request) => {
            request.onStart?.({
                write: () => undefined,
                end: () => undefined,
                stop: async () => undefined,
            });
            await request.onStderr?.(url.slice(0, 54));
            await request.onStderr?.(url.slice(54) + '\n');

            return completed;
        });

        // Act
        await new ClaudeAuthDriver(transport).login(context(account, method, interactions));

        // Assert
        const request = vi.mocked(transport.run).mock.calls[0]![0];

        expect(request.args).toContain(flag);
        expect(request.environment['ANTHROPIC_API_KEY']).toBeUndefined();
        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toMatchObject({ type: 'browser', url });
    });

    it('writes an optional validated manual authorization code through stdin', async () => {
        // Arrange
        const account = await instance();
        const write = vi.fn();
        const end = vi.fn();
        const process: IInteractiveProcess = { write, end, stop: vi.fn(async () => undefined) };
        const transport = runner(async (request) => {
            request.onStart?.(process);
            await request.onStderr?.('https://claude.com/cai/oauth/authorize?state=synthetic\n');
            await Promise.resolve();

            return completed;
        });

        // Act
        await new ClaudeAuthDriver(transport).login(
            context(account, 'subscription', [], async () => ({
                authorizationCode: 'synthetic-authorization-code',
            })),
        );

        // Assert
        expect(write).toHaveBeenCalledWith('synthetic-authorization-code\n');
        expect(end).toHaveBeenCalledTimes(1);
        expect(vi.mocked(transport.run).mock.calls[0]![0].args).not.toContain(
            'synthetic-authorization-code',
        );
    });

    it('rejects an invalid manual code and stops its owned native login', async () => {
        // Arrange
        const account = await instance();
        let stop: () => void = () => undefined;
        const stopped = new Promise<void>((resolve) => {
            stop = resolve;
        });
        const process: IInteractiveProcess = {
            write: vi.fn(),
            end: vi.fn(),
            stop: vi.fn(async () => {
                stop();
            }),
        };
        const transport = runner(async (request) => {
            request.onStart?.(process);
            await request.onStderr?.('https://claude.com/cai/oauth/authorize?state=synthetic\n');
            await stopped;

            return { ...completed, exitCode: 1 };
        });

        // Act
        const result = new ClaudeAuthDriver(transport).login(
            context(account, 'subscription', [], async () => ({
                authorizationCode: 'synthetic\ninvalid',
            })),
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
        expect(process.stop).toHaveBeenCalledTimes(1);
        expect(process.write).not.toHaveBeenCalled();
    });

    it.each(['invalid-code', 'rejected-response'])(
        'preserves unconfirmed process cleanup after a %s manual interaction failure',
        async (scenario) => {
            // Arrange
            const account = await instance();
            const cleanupFailure = new AiError(
                'host',
                'Native login process cleanup could not be confirmed.',
                { cleanupIncomplete: true, sessionUsable: false },
            );
            let stopped: () => void = () => undefined;
            const stopping = new Promise<void>((resolve) => {
                stopped = resolve;
            });
            const process: IInteractiveProcess = {
                write: vi.fn(),
                end: vi.fn(),
                stop: vi.fn(async () => {
                    stopped();

                    throw cleanupFailure;
                }),
            };
            const transport = runner(async (request) => {
                request.onStart?.(process);
                await request.onStderr?.(
                    'https://claude.com/cai/oauth/authorize?state=synthetic\n',
                );
                await stopping;

                throw cleanupFailure;
            });
            const response: IAiAuthContext['response'] = async () => {
                if (scenario === 'rejected-response')
                    throw new Error('Synthetic manual interaction was rejected.');

                return { authorizationCode: 'synthetic\ninvalid' };
            };

            // Act
            const result = new ClaudeAuthDriver(transport).login(
                context(account, 'subscription', [], response),
            );

            // Assert
            await expect(result).rejects.toBe(cleanupFailure);
            await expect(result).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
                retryable: false,
                sessionUsable: false,
            });
            expect(process.stop).toHaveBeenCalledTimes(1);
            expect(process.write).not.toHaveBeenCalled();
        },
    );

    it('returns verified safe account metadata without inference or login', async () => {
        // Arrange
        const account = await instance();
        const transport = runner(async () => ({
            ...completed,
            stdout: '{"loggedIn":true,"email":"synthetic@example.invalid","orgId":"synthetic-org","subscriptionType":"synthetic-plan","authMethod":"claude.ai"}',
        }));

        // Act
        const status = await new ClaudeAuthDriver(transport).status(
            account,
            new AbortController().signal,
        );

        // Assert
        expect(status).toMatchObject({
            authenticated: true,
            method: 'subscription',
            accountId: 'synthetic@example.invalid',
            displayName: 'synthetic@example.invalid',
            plan: 'synthetic-plan',
        });
        expect(vi.mocked(transport.run).mock.calls[0]![0].args).toEqual([
            'auth',
            'status',
            '--json',
        ]);
    });

    it('rejects malformed account metadata rather than claiming authentication', async () => {
        // Arrange
        const account = await instance();
        const transport = runner(async () => ({ ...completed, stdout: '{"loggedIn":"yes"}' }));

        // Act
        const result = new ClaudeAuthDriver(transport).status(
            account,
            new AbortController().signal,
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol' });
    });
});
