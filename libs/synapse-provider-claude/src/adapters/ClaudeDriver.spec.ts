// #region Imports

import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
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
import { ClaudeDriver } from './ClaudeDriver.js';

// #endregion

const owned: string[] = [];
const completed: IProcessResult = { stdout: '', stderr: '', exitCode: 0, signal: null };

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function context(overrides: Partial<IAiRequest> = {}): Promise<IAiExecutionContext> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-claude-'));

    owned.push(root);

    const instance = {
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
            driverId: 'claude',
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

    for (let index = 0; index < transcript.length; index += 13)
        await request.onStdout?.(transcript.slice(index, index + 13));

    return completed;
}

function runner(
    run: (request: IProcessRequest) => Promise<IProcessResult> = replay,
): ProcessRunnerBase {
    return { run: vi.fn(run), dispose: vi.fn(async () => undefined) };
}

async function recordedProcess(): Promise<
    IProcessResult & { readonly exitCode: number; readonly signal: null }
> {
    const value: unknown = JSON.parse(
        await readFile(new URL('./fixtures/native-offline-error.json', import.meta.url), 'utf8'),
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

    return { stdout: value.stdout, stderr: value.stderr, exitCode: value.exitCode, signal: null };
}

describe('ClaudeDriver', () => {
    it.each([1, 0])(
        'rejects recorded offline API-error frames despite their success subtype with exit code %i',
        async (exitCode) => {
            // Arrange
            const capture = await recordedProcess();
            const execution = await context();
            const transport = runner(async (request) => {
                await replay(request, capture.stdout);

                // Exit 1 is recorded; exit 0 deliberately injects a contradictory transport status.
                return { ...capture, exitCode };
            });

            // Act
            const result = new ClaudeDriver(transport).execute(execution);

            // Assert
            await expect(result).rejects.toBeInstanceOf(AiError);
            await expect(result).rejects.toMatchObject({ code: 'provider' });
            expect(transport.run).toHaveBeenCalledTimes(1);
            expect(vi.mocked(execution.emit).mock.calls.map(([event]) => event)).toContainEqual(
                expect.objectContaining({
                    type: 'session',
                    session: expect.objectContaining({
                        driverId: 'claude',
                        instanceId: execution.instance.id,
                        profileId: execution.instance.profile.id,
                    }),
                }),
            );
        },
    );

    it('replays real-shaped fragmented stream-json through the actual adapter without an API key', async () => {
        // Arrange
        const execution = await context();
        const transport = runner();

        // Act
        const result = await new ClaudeDriver(transport).execute(execution);

        // Assert
        expect(result).toMatchObject({
            text: 'Meeting summary: publish the draft tomorrow.',
            sessionId: 'claude-session-fixture-1',
            usage: { input: 20, cachedInput: 6, output: 8, total: 28 },
        });

        const request = vi.mocked(transport.run).mock.calls[0]![0];

        expect(request.input).toBe(execution.request.prompt);
        expect(request.args).not.toContain(execution.request.prompt);
        expect(request.args).toContain('--safe-mode');
        expect(request.args).not.toContain('--bare');
        expect(request.args[request.args.indexOf('--permission-mode') + 1]).toBe('plan');
        expect(request.environment['CLAUDE_CONFIG_DIR']).toBe(
            execution.instance.profile.paths.configuration,
        );
        expect(request.environment['CLAUDE_SECURESTORAGE_CONFIG_DIR']).toBe(
            execution.instance.profile.paths.configuration,
        );
        expect(request.environment['ANTHROPIC_API_KEY']).toBeUndefined();

        const events = vi.mocked(execution.emit).mock.calls.map(([event]) => event);

        expect(events).toContainEqual({
            type: 'session',
            session: execution.session('claude-session-fixture-1'),
        });
        expect(JSON.stringify(events)).not.toContain('synthetic-private-value');
        expect(JSON.stringify(events)).not.toContain('synthetic-private-tool-output');
        expect(JSON.stringify(events)).not.toContain('private old content');
        expect(JSON.stringify(events)).not.toContain('private new content');
        expect(events).toContainEqual(
            expect.objectContaining({
                type: 'progress',
                category: 'file-change',
                message: 'Changing file: src/Notes.ts',
            }),
        );
    });

    it('uses native schema output and returns the same structured value for runtime validation', async () => {
        // Arrange
        const schema = {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
        };
        const execution = await context({ outputSchema: schema });
        const transport = runner((request) =>
            replay(
                request,
                '{"type":"result","is_error":false,"structured_output":{"summary":"ready"}}\n',
            ),
        );

        // Act
        const result = await new ClaudeDriver(transport).execute(execution);

        // Assert
        expect(result).toMatchObject({
            structured: { summary: 'ready' },
            text: '{"summary":"ready"}',
        });

        const args = vi.mocked(transport.run).mock.calls[0]![0].args;

        expect(JSON.parse(args[args.indexOf('--json-schema') + 1]!)).toEqual(schema);
    });

    it('restricts the actual tool surface and passes explicit deny rules for writing turns', async () => {
        // Arrange
        const execution = await context({
            policy: {
                mode: 'workspace-write',
                allowedTools: ['Read', 'Bash(git status:*)'],
                deniedTools: ['Bash(git push:*)'],
            },
        });
        const transport = runner();

        // Act
        await new ClaudeDriver(transport).execute(execution);

        // Assert
        const args = vi.mocked(transport.run).mock.calls[0]![0].args;

        expect(args[args.indexOf('--tools') + 1]).toBe('Read,Bash');
        expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,Bash(git status:*)');
        expect(args[args.indexOf('--disallowedTools') + 1]).toBe('Bash(git push:*)');
        expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits');
    });

    it('resumes only the supplied native continuation and chosen model', async () => {
        // Arrange
        const initial = await context();
        const execution = {
            ...initial,
            request: {
                ...initial.request,
                session: initial.session('saved-native-session'),
                model: 'native-claude-model',
                reasoningEffort: 'high',
            },
        };
        const transport = runner();

        // Act
        await new ClaudeDriver(transport).execute(execution);

        // Assert
        const args = vi.mocked(transport.run).mock.calls[0]![0].args;

        expect(args[args.indexOf('--resume') + 1]).toBe('saved-native-session');
        expect(args).toContain('native-claude-model');
        expect(args).toContain('high');
    });

    it('preserves critical host event failures and launches only once', async () => {
        // Arrange
        const execution = await context();
        const failure = new AiError('persistence', 'Synthetic host storage failed.');

        vi.mocked(execution.emit).mockRejectedValue(failure);

        const transport = runner();

        // Act
        const result = new ClaudeDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toBe(failure);
        expect(transport.run).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed known completion data', async () => {
        // Arrange
        const execution = await context();
        const transport = runner((request) => replay(request, '{"type":"result","result":42}\n'));

        // Act
        const result = new ClaudeDriver(transport).execute(execution);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol', retryable: false });
    });

    it('keeps subscription profile state separate between applications and accounts', async () => {
        // Arrange
        const first = await context();
        const second = await context();
        const transport = runner();
        const driver = new ClaudeDriver(transport);

        // Act
        await Promise.all([driver.execute(first), driver.execute(second)]);

        // Assert
        const environments = vi
            .mocked(transport.run)
            .mock.calls.map(([request]) => request.environment);

        expect(environments[0]!['HOME']).not.toBe(environments[1]!['HOME']);
        expect(environments[0]!['CLAUDE_CONFIG_DIR']).not.toBe(
            environments[1]!['CLAUDE_CONFIG_DIR'],
        );
        expect(environments[0]!['CLAUDE_SECURESTORAGE_CONFIG_DIR']).not.toBe(
            environments[1]!['CLAUDE_SECURESTORAGE_CONFIG_DIR'],
        );
    });
});
