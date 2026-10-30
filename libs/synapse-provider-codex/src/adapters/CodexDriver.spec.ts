// #region Imports

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AiError,
    type AiEvent,
    type IAiExecutionContext,
    type IAiRequest,
} from '@pixel-brewery/synapse-core';
import type {
    IProcessRequest,
    IProcessResult,
    ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { CodexDriver } from './CodexDriver.js';

// #endregion

const owned: string[] = [];
const completed: IProcessResult = { stdout: '', stderr: '', exitCode: 0, signal: null };

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function context(overrides: Partial<IAiRequest> = {}): Promise<IAiExecutionContext> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-codex-'));

    owned.push(root);

    const instance = {
        id: root,
        driverId: 'codex',
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
                sqlite: join(root, 'sqlite'),
            },
        },
    };
    const workingDirectory = join(root, 'workspace');

    await mkdir(workingDirectory);

    return {
        instance,
        workingDirectory,
        signal: new AbortController().signal,
        request: {
            target: { instanceId: instance.id },
            prompt: 'Summarize the supplied transcript.',
            policy: { mode: 'read-only' },
            ...overrides,
        },
        emit: vi.fn<(event: AiEvent) => Promise<void>>(async () => undefined),
        session: (nativeId) => ({
            driverId: 'codex',
            instanceId: instance.id,
            profileId: instance.profile.id,
            candidateId: instance.id,
            nativeId,
        }),
    };
}

async function replay(request: IProcessRequest, frames?: string): Promise<IProcessResult> {
    const transcript =
        frames ??
        (await readFile(new URL('./fixtures/native-turn.jsonl', import.meta.url), 'utf8'));

    for (let index = 0; index < transcript.length; index += 11)
        await request.onStdout?.(transcript.slice(index, index + 11));

    return completed;
}

function runner(
    run: (request: IProcessRequest) => Promise<IProcessResult> = replay,
): ProcessRunnerBase {
    return { run: vi.fn(run), dispose: vi.fn(async () => undefined) };
}

describe('CodexDriver', () => {
    it('replays fragmented native frames with one invocation, stdin prompt, session and usage', async () => {
        // Arrange
        const execution = await context();
        const transport = runner();
        const driver = new CodexDriver(transport);

        // Act
        const result = await driver.execute(execution);

        // Assert
        expect(result).toMatchObject({
            text: 'Meeting summary: publish the draft tomorrow.',
            sessionId: 'thread-codex-fixture-1',
            usage: { input: 20, cachedInput: 4, output: 8, total: 28 },
        });
        expect(transport.run).toHaveBeenCalledTimes(1);

        const request = vi.mocked(transport.run).mock.calls[0]![0];

        expect(request.input).toBe(execution.request.prompt);
        expect(request.args).not.toContain(execution.request.prompt);
        expect(request.args).toContain('--skip-git-repo-check');
        expect(request.args).toContain('--ignore-user-config');
        expect(request.args).toContain('sandbox_mode="read-only"');
        expect(request.environment['HOME']).toBe(execution.instance.profile.paths.home);

        const events = vi.mocked(execution.emit).mock.calls.map(([event]) => event);

        expect(events).toContainEqual({
            type: 'session',
            session: execution.session('thread-codex-fixture-1'),
        });
        expect(events).toContainEqual(
            expect.objectContaining({
                type: 'progress',
                category: 'file-change',
                message: 'Files changed: src/Notes.ts',
            }),
        );
        expect(JSON.stringify(events)).not.toContain('synthetic-private-value');
        expect(JSON.stringify(events)).not.toContain('synthetic-private-tool-output');
    });

    it('keeps a completed native result after a recoverable stream diagnostic', async () => {
        // Arrange
        const execution = await context();
        const transport = runner((request) =>
            replay(
                request,
                [
                    '{"type":"error","message":"Reconnecting after a temporary transport interruption."}',
                    '{"type":"item.completed","item":{"type":"agent_message","text":"Completed after native recovery."}}',
                    '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
                    '',
                ].join('\n'),
            ),
        );

        // Act
        const result = await new CodexDriver(transport).execute(execution);

        // Assert
        expect(result.text).toBe('Completed after native recovery.');
        expect(transport.run).toHaveBeenCalledTimes(1);
    });

    it('rejects an unenforceable tool allowlist before native launch', async () => {
        // Arrange
        const execution = await context({ policy: { mode: 'read-only', allowedTools: [] } });
        const transport = runner();

        // Act
        const result = new CodexDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'unsupported' });
        expect(transport.run).not.toHaveBeenCalled();
    });

    it('preserves a critical host progress error rather than classifying it as provider failure', async () => {
        // Arrange
        const execution = await context();
        const failure = new AiError('persistence', 'Synthetic host persistence failed.');

        vi.mocked(execution.emit).mockRejectedValue(failure);

        const transport = runner();

        // Act
        const result = new CodexDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toBe(failure);
        expect(transport.run).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed known protocol fields instead of accepting an invented session', async () => {
        // Arrange
        const execution = await context();
        const transport = runner((request) =>
            replay(request, '{"type":"thread.started","thread_id":42}\n'),
        );

        // Act
        const result = new CodexDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol', retryable: false });
    });

    it('resumes the exact native session and supplies a private schema file only during execution', async () => {
        // Arrange
        const execution = await context({
            outputSchema: {
                type: 'object',
                properties: { summary: { type: 'string' } },
                required: ['summary'],
            },
        });
        const resumed = {
            ...execution,
            request: {
                ...execution.request,
                session: execution.session('saved-native-session'),
                model: 'native-model',
                reasoningEffort: 'high',
            },
        };
        let schemaFile: string | undefined;
        const transport = runner(async (request) => {
            const index = request.args.indexOf('--output-schema');

            schemaFile = request.args[index + 1];
            expect(JSON.parse(await readFile(schemaFile!, 'utf8'))).toEqual(
                execution.request.outputSchema,
            );

            return replay(
                request,
                '{"type":"item.completed","item":{"type":"agent_message","text":"{\\"summary\\":\\"ready\\"}"}}\n',
            );
        });

        // Act
        await new CodexDriver(transport).execute(resumed);

        // Assert
        const request = vi.mocked(transport.run).mock.calls[0]![0];

        expect(request.args.slice(0, 2)).toEqual(['exec', 'resume']);
        expect(request.args.slice(-2)).toEqual(['saved-native-session', '-']);
        expect(request.args).not.toContain('--sandbox');
        expect(request.args).toContain('model_reasoning_effort="high"');
        await expect(readFile(schemaFile!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('disables target-project MCP servers without exposing commands or loading their hooks', async () => {
        // Arrange
        const execution = await context();

        await mkdir(join(execution.workingDirectory, '.codex'));
        await writeFile(
            join(execution.workingDirectory, '.codex/config.toml'),
            '[mcp_servers.nx]\ncommand="synthetic-never-start"\n[mcp_servers."quoted-tool"]\ncommand="synthetic-never-start"\n',
        );

        const transport = runner();

        // Act
        await new CodexDriver(transport).execute(execution);

        // Assert
        const args = vi.mocked(transport.run).mock.calls[0]![0].args;

        expect(args).toContain('mcp_servers.nx={enabled=false,command="synapse-disabled-mcp"}');
        expect(args).toContain(
            'mcp_servers.quoted-tool={enabled=false,command="synapse-disabled-mcp"}',
        );
    });

    it('persists native credential refreshes to the same profile instead of restoring stale tokens', async () => {
        // Arrange
        const execution = await context();
        const source = join(execution.instance.profile.paths.credentials, 'auth.json');

        await mkdir(execution.instance.profile.paths.credentials);
        await writeFile(source, '{"refresh_token":"synthetic-initial"}');

        const transport = runner(async (request) => {
            await writeFile(
                join(request.environment['CODEX_HOME']!, 'auth.json'),
                '{"refresh_token":"synthetic-refreshed"}',
            );

            return replay(request);
        });

        // Act
        await new CodexDriver(transport).execute(execution);

        // Assert
        expect(JSON.parse(await readFile(source, 'utf8'))).toEqual({
            refresh_token: 'synthetic-refreshed',
        });
    });

    it('does not overwrite credentials changed outside the snapshot baseline', async () => {
        // Arrange
        const execution = await context();
        const source = join(execution.instance.profile.paths.credentials, 'auth.json');

        await mkdir(execution.instance.profile.paths.credentials);
        await writeFile(source, '{"refresh_token":"synthetic-initial"}');

        const transport = runner(async (request) => {
            await writeFile(source, '{"refresh_token":"synthetic-external-change"}');
            await writeFile(
                join(request.environment['CODEX_HOME']!, 'auth.json'),
                '{"refresh_token":"synthetic-refreshed"}',
            );

            return replay(request);
        });

        // Act
        await new CodexDriver(transport).execute(execution);

        // Assert
        expect(JSON.parse(await readFile(source, 'utf8'))).toEqual({
            refresh_token: 'synthetic-external-change',
        });
    });

    it.each(['execution', 'inspection'] as const)(
        'blocks credential refresh after unconfirmed %s cleanup and preserves the primary failure',
        async (operation) => {
            // Arrange
            const execution = await context({ outputSchema: { type: 'object' } });
            const source = join(execution.instance.profile.paths.credentials, 'auth.json');

            await mkdir(execution.instance.profile.paths.credentials);
            await writeFile(source, '{"refresh_token":"synthetic-initial"}');

            const failure = new AiError('host', 'Native process cleanup could not be confirmed.', {
                cleanupIncomplete: true,
            });
            let snapshot: string | undefined;
            let schema: string | undefined;
            const transport = runner(async (request) => {
                if (request.args[0] === 'login') return completed;

                snapshot = join(request.environment['CODEX_HOME']!, 'auth.json');

                const schemaIndex = request.args.indexOf('--output-schema');

                if (schemaIndex >= 0) schema = request.args[schemaIndex + 1];

                await writeFile(snapshot, '{"refresh_token":"synthetic-refreshed"}');

                throw failure;
            });
            const driver = new CodexDriver(transport);

            // Act
            const result =
                operation === 'execution'
                    ? driver.execute(execution)
                    : driver.inspect(execution.instance, execution.signal);

            // Assert
            await expect(result).rejects.toBe(failure);
            await expect(result).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
                retryable: false,
            });
            expect(await readFile(source, 'utf8')).toBe('{"refresh_token":"synthetic-initial"}');
            expect(await readFile(snapshot!, 'utf8')).toBe(
                '{"refresh_token":"synthetic-refreshed"}',
            );

            if (operation === 'execution')
                await expect(readFile(schema!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        },
    );

    it('still reports credential finalization failure after an ordinary native error', async () => {
        // Arrange
        const execution = await context();

        await mkdir(execution.instance.profile.paths.credentials);
        await writeFile(
            join(execution.instance.profile.paths.credentials, 'auth.json'),
            '{"refresh_token":"synthetic-initial"}',
        );

        const transport = runner(async (request) => {
            await writeFile(
                join(request.environment['CODEX_HOME']!, 'auth.json'),
                'invalid native credential refresh',
            );

            throw new AiError('provider', 'Synthetic ordinary native failure.', {
                retryable: true,
            });
        });

        // Act
        const result = new CodexDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'persistence', retryable: false });
    });

    it('rejects oversized native credentials before starting the CLI', async () => {
        // Arrange
        const execution = await context();

        await mkdir(execution.instance.profile.paths.credentials);
        await writeFile(
            join(execution.instance.profile.paths.credentials, 'auth.json'),
            'x'.repeat(1_048_577),
        );

        const transport = runner();

        // Act
        const result = new CodexDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'output-limit' });
        expect(transport.run).not.toHaveBeenCalled();
    });

    it('never replaces an unmanaged runtime authentication file', async () => {
        // Arrange
        const execution = await context();

        await mkdir(join(execution.instance.profile.paths.execution, 'codex'), { recursive: true });

        const unmanaged = join(execution.instance.profile.paths.execution, 'codex/auth.json');

        await writeFile(unmanaged, '{"synthetic":"unmanaged"}');

        const transport = runner();

        // Act
        const result = new CodexDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
        expect(await readFile(unmanaged, 'utf8')).toBe('{"synthetic":"unmanaged"}');
        expect(transport.run).not.toHaveBeenCalled();
    });

    it('cancels a queued same-profile turn before native launch', async () => {
        // Arrange
        const execution = await context();
        let release: () => void = () => undefined;
        let started: () => void = () => undefined;
        const waiting = new Promise<void>((resolve) => {
            release = resolve;
        });
        const launched = new Promise<void>((resolve) => {
            started = resolve;
        });
        const transport = runner(async (request) => {
            started();
            await waiting;

            return replay(request);
        });
        const driver = new CodexDriver(transport);
        const first = driver.execute(execution);

        await launched;

        const cancellation = new AbortController();
        const queued = driver.execute({ ...execution, signal: cancellation.signal });

        // Act
        cancellation.abort();

        // Assert
        await expect(queued).rejects.toMatchObject({ code: 'cancelled' });
        expect(transport.run).toHaveBeenCalledTimes(1);
        release();
        await first;
    });

    it('does not launch another process after disposal', async () => {
        // Arrange
        const execution = await context();
        const transport = runner();
        const driver = new CodexDriver(transport);

        await driver.dispose();

        // Act
        const result = driver.execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'disposed' });
        expect(transport.run).not.toHaveBeenCalled();
    });
});
