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
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenCodeDriver } from './OpenCodeDriver.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function instance(): Promise<IAiInstance> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-opencode-'));

    owned.push(root);

    return {
        id: 'instance-a',
        driverId: 'opencode',
        profile: {
            id: 'profile-a',
            applicationId: 'test',
            accountId: 'account-a',
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

class ReplayRunner extends ProcessRunnerBase {
    // #region Fields

    public readonly requests: IProcessRequest[] = [];

    // #endregion

    // #region Ctor

    public constructor(
        private readonly _stdout: string,
        private readonly _stderr = '',
        private readonly _exitCode = 0,
    ) {
        super();
    }

    // #endregion

    // #region Methods

    public override async run(request: IProcessRequest): Promise<IProcessResult> {
        this.requests.push(request);

        for (let offset = 0; offset < this._stdout.length; offset += 7)
            await request.onStdout?.(this._stdout.slice(offset, offset + 7));

        return {
            stdout: this._stdout,
            stderr: this._stderr,
            exitCode: this._exitCode,
            signal: null,
        };
    }

    public override async dispose(): Promise<void> {}

    // #endregion
}

function context(
    selected: IAiInstance,
    events: AiEvent[],
    override: Partial<IAiExecutionContext> = {},
): IAiExecutionContext {
    return {
        instance: selected,
        workingDirectory: selected.profile.paths.home,
        request: {
            target: { instanceId: selected.id },
            prompt: 'Summarize this text.',
            policy: { mode: 'read-only' },
        },
        signal: new AbortController().signal,
        emit: async (event) => {
            events.push(event);
        },
        session: (nativeId) => ({
            driverId: 'opencode',
            instanceId: selected.id,
            profileId: selected.profile.id,
            candidateId: selected.id,
            nativeId,
        }),
        ...override,
    };
}

describe('OpenCodeDriver', () => {
    it('replays the recorded native offline failure without accepting a successful turn', async () => {
        // Arrange
        const value: unknown = JSON.parse(
            await readFile(
                new URL('../fixtures/native-offline-error.json', import.meta.url),
                'utf8',
            ),
        );

        if (
            !value ||
            typeof value !== 'object' ||
            !('stdout' in value) ||
            typeof value.stdout !== 'string' ||
            !('stderr' in value) ||
            typeof value.stderr !== 'string' ||
            !('exitCode' in value) ||
            typeof value.exitCode !== 'number' ||
            !Number.isInteger(value.exitCode) ||
            !('signal' in value) ||
            value.signal !== null
        )
            throw new Error('The recorded native execution transport is invalid.');

        const selected = await instance();
        const events: AiEvent[] = [];
        const runner = new ReplayRunner(value.stdout, value.stderr, value.exitCode);

        // Act
        const result = new OpenCodeDriver(runner).execute(context(selected, events));

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'provider' });
        expect(runner.requests).toHaveLength(1);
        expect(events).toContainEqual({
            type: 'session',
            session: {
                driverId: 'opencode',
                instanceId: selected.id,
                profileId: selected.profile.id,
                candidateId: selected.id,
                nativeId: 'ses_recorded_offline_1',
            },
        });
        expect(JSON.stringify(events)).not.toContain('err_recorded_offline_1');
    });

    it('keeps native permission and state overrides inside the selected profile', async () => {
        // Arrange
        const base = await instance();
        const selected = {
            ...base,
            environment: {
                OPENCODE_PERMISSION: '{"*":"allow"}',
                OPENCODE_CONFIG: '/foreign/config.json',
                XDG_STATE_HOME: '/foreign/state',
            },
        };
        const runner = new ReplayRunner('{"type":"text","part":{"text":"Complete."}}\n');

        // Act
        await new OpenCodeDriver(runner).execute(context(selected, []));

        // Assert
        const environment = runner.requests[0]?.environment;

        expect(JSON.parse(environment?.['OPENCODE_PERMISSION'] ?? '{}')).toMatchObject({
            bash: 'deny',
            edit: 'deny',
        });
        expect(environment?.['OPENCODE_CONFIG']).toBe('');
        expect(environment?.['XDG_STATE_HOME']).toBe(
            join(selected.profile.paths.home, '.local', 'state'),
        );
    });

    it('rejects a native error frame even when OpenCode exits with status zero', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ReplayRunner(
            '{"type":"error","error":{"message":"authentication required"}}\n',
        );

        // Act
        const result = new OpenCodeDriver(runner).execute(context(selected, []));

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'auth-required' });
    });
    it('publishes cumulative usage across steps and ignores a repeated completed part', async () => {
        // Arrange
        const selected = await instance();
        const first = {
            type: 'step_finish',
            part: { id: 'step-1', tokens: { input: 10, output: 4, cache: { read: 2 } } },
        };
        const second = {
            type: 'step_finish',
            part: { id: 'step-2', tokens: { input: 5, output: 1 } },
        };
        const runner = new ReplayRunner(
            [first, first, second, { type: 'text', part: { text: 'Complete.' } }]
                .map((frame) => JSON.stringify(frame))
                .join('\n') + '\n',
        );

        // Act
        const result = await new OpenCodeDriver(runner).execute(context(selected, []));

        // Assert
        expect(result.usage).toEqual({ input: 15, output: 5, cachedInput: 2, total: 20 });
    });

    it('replays fragmented native frames through the actual decoder and preserves session and usage', async () => {
        // Arrange
        const selected = await instance();
        const events: AiEvent[] = [];
        const frames = await readFile(
            new URL('../fixtures/opencode-stream.ndjson', import.meta.url),
            'utf8',
        );
        const runner = new ReplayRunner(frames);

        // Act
        const result = await new OpenCodeDriver(runner).execute(context(selected, events));

        // Assert
        expect(result).toEqual({
            text: 'Summary from the native turn.',
            sessionId: 'ses_fixture',
            usage: { input: 20, cachedInput: 4, output: 8, total: 28 },
        });
        expect(JSON.stringify(events)).not.toContain('must-not-appear');
        expect(events.filter((event) => event.type === 'session')).toHaveLength(1);
        expect(runner.requests[0]?.input).toBe('Summarize this text.');
        expect(runner.requests[0]?.args).not.toContain('Summarize this text.');

        const config: unknown = JSON.parse(
            runner.requests[0]?.environment['OPENCODE_CONFIG_CONTENT'] ?? '{}',
        );

        expect(config).toMatchObject({
            permission: { edit: 'deny', bash: 'deny', external_directory: 'deny', task: 'deny' },
        });
    });
    it('rejects unsupported tool policies before starting the CLI', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ReplayRunner('');
        const value = context(selected, []);

        // Act
        const result = new OpenCodeDriver(runner).execute({
            ...value,
            request: { ...value.request, policy: { mode: 'read-only', allowedTools: ['Bash(*)'] } },
        });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'unsupported' });
        expect(runner.requests).toHaveLength(0);
    });
    it('propagates host progress failures without reclassifying them as provider errors', async () => {
        // Arrange
        const selected = await instance();
        const failure = new AiError('persistence', 'host write failed');
        const runner = new ReplayRunner('{"type":"text","part":{"text":"result"}}\n');

        // Act
        const result = new OpenCodeDriver(runner).execute(
            context(selected, [], {
                emit: async () => {
                    throw failure;
                },
            }),
        );

        // Assert
        await expect(result).rejects.toBe(failure);
        expect(runner.requests).toHaveLength(1);
    });
    it('does not turn a model-only 429 into an account-wide cooldown', async () => {
        // Arrange
        const selected = await instance();
        const runner = new ReplayRunner('', '429 model rate limit', 1);

        // Act
        const result = new OpenCodeDriver(runner).execute(context(selected, []));

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'provider', retryable: true });
    });
});
