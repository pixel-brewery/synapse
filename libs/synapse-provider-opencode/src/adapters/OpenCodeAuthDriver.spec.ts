// #region Imports

import {
    AiError,
    type IAiAuthContext,
    type IAiAuthInteraction,
    type IAiInstance,
} from '@pixel-brewery/synapse-core';
import {
    ProcessRunnerBase,
    type IInteractiveProcess,
    type IProcessRequest,
    type IProcessResult,
} from '@pixel-brewery/synapse-runtime';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeAuthDriver } from './OpenCodeAuthDriver.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function instance(): Promise<IAiInstance> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-opencode-auth-'));

    owned.push(root);

    return {
        id: 'i',
        driverId: 'opencode',
        configuration: { providerId: 'openai', authMethod: 'ChatGPT' },
        profile: {
            id: 'p',
            applicationId: 'a',
            accountId: 'b',
            paths: {
                root,
                home: join(root, 'home'),
                configuration: join(root, 'configuration'),
                credentials: join(root, 'credentials'),
                execution: join(root, 'execution'),
                temporary: join(root, 'temporary'),
            },
        },
    };
}

class NativeRunner extends ProcessRunnerBase {
    // #region Fields

    public readonly requests: IProcessRequest[] = [];
    public readonly writes: string[] = [];

    // #endregion

    // #region Methods

    public override async run(request: IProcessRequest): Promise<IProcessResult> {
        this.requests.push(request);
        request.onStart?.({
            write: (value) => {
                this.writes.push(value);
            },
            end: () => undefined,
            stop: async () => undefined,
        });

        const stdout = request.args.includes('login')
            ? 'Open https://login.example.test/authorize and paste code'
            : 'OpenAI oauth\n1 credentials';

        for (let offset = 0; offset < stdout.length; offset += 7)
            await request.onStdout?.(stdout.slice(offset, offset + 7));

        await Promise.resolve();

        return { stdout, stderr: '', exitCode: 0, signal: null };
    }

    public override async dispose(): Promise<void> {}

    // #endregion
}

describe('OpenCodeAuthDriver', () => {
    it('does not verify an incomplete credential merely because it has an OAuth type label', async () => {
        // Arrange
        const selected = await instance();
        const runner = new NativeRunner();

        // Act
        const status = await new OpenCodeAuthDriver(runner).status(
            { ...selected, environment: { OPENCODE_AUTH_CONTENT: '{"openai":{"type":"oauth"}}' } },
            new AbortController().signal,
        );

        // Assert
        expect(status.authenticated).toBe(false);
    });

    it('verifies stable provider keys instead of depending on native display-name aliases', async () => {
        // Arrange
        const selected = await instance();
        const directory = join(selected.profile.paths.home, '.local/share/opencode');

        await mkdir(directory, { recursive: true });
        await writeFile(
            join(directory, 'auth.json'),
            '{"custom-id":{"type":"oauth","access":"synthetic-secret","refresh":"synthetic-refresh","expires":9999999999999,"accountId":"native-account"}}',
        );

        const runner = new NativeRunner();

        // Act
        const status = await new OpenCodeAuthDriver(runner).status(
            { ...selected, configuration: { providerId: 'custom-id' } },
            new AbortController().signal,
        );

        // Assert
        expect(status.authenticated).toBe(true);
        expect(status.accountId).toBe('native-account');
        expect(JSON.stringify(status)).not.toContain('synthetic-secret');
    });

    it('selects the actual configured method and routes native input through the correlated flow', async () => {
        // Arrange
        const selected = await instance();
        const runner = new NativeRunner();
        const interactions: IAiAuthInteraction[] = [];
        const context: IAiAuthContext = {
            instance: selected,
            methodId: 'native',
            signal: new AbortController().signal,
            interaction: (value) => {
                interactions.push(value);
            },
            response: async (id) => {
                expect(id).toBe(interactions[0]?.id);

                return { input: 'synthetic-code' };
            },
        };

        // Act
        await new OpenCodeAuthDriver(runner).login(context);

        // Assert
        expect(runner.requests[0]?.args).toEqual([
            '--pure',
            'auth',
            'login',
            '--provider',
            'openai',
            '--method',
            'ChatGPT',
        ]);
        expect(runner.writes).toEqual(['synthetic-code\n']);
        expect(interactions[0]?.url).toBe('https://login.example.test/authorize');
    });
    it.each(['native-exit', 'runner-cleanup-failure'])(
        'awaits a rejected login stop and preserves cleanup failure after %s',
        async (outcome) => {
            // Arrange
            const selected = await instance();
            const cleanup = new AiError('host', 'Native login cleanup could not be confirmed.', {
                cleanupIncomplete: true,
                sessionUsable: false,
            });
            const runnerFailure = new AiError('host', 'Native runner cleanup failed.', {
                cause: cleanup,
                cleanupIncomplete: true,
                sessionUsable: false,
            });
            let stopped: () => void = () => undefined;
            const stopping = new Promise<void>((resolve) => {
                stopped = resolve;
            });
            const control: IInteractiveProcess = {
                write: vi.fn(),
                end: vi.fn(),
                stop: vi.fn(async () => {
                    stopped();

                    throw cleanup;
                }),
            };
            const transport: ProcessRunnerBase = {
                run: async (request) => {
                    request.onStart?.(control);
                    await request.onStdout?.(
                        'Open https://login.example.test/authorize and paste code\n',
                    );
                    await stopping;

                    if (outcome === 'runner-cleanup-failure') throw runnerFailure;

                    return { stdout: '', stderr: '', exitCode: 1, signal: null };
                },
                dispose: async () => undefined,
            };
            const context: IAiAuthContext = {
                instance: selected,
                methodId: 'native',
                signal: new AbortController().signal,
                interaction: () => undefined,
                response: async () => {
                    throw new Error('Synthetic manual response was rejected.');
                },
            };

            // Act
            const result = new OpenCodeAuthDriver(transport).login(context);

            // Assert
            await expect(result).rejects.toBe(
                outcome === 'runner-cleanup-failure' ? runnerFailure : cleanup,
            );
            await expect(result).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
                retryable: false,
            });
            expect(control.stop).toHaveBeenCalledTimes(1);
            expect(control.write).not.toHaveBeenCalled();
        },
    );

    it('reports no selectable procedure without explicit native method selection', async () => {
        // Arrange
        const selected = await instance();
        const runner = new NativeRunner();

        // Act
        const methods = new OpenCodeAuthDriver(runner).methods({ ...selected, configuration: {} });

        // Assert
        expect(methods).toEqual([]);
        expect(runner.requests).toHaveLength(0);
    });
});
