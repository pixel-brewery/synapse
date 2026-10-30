// #region Imports

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IAiInstance } from '@pixel-brewery/synapse-core';
import type {
    IProcessRequest,
    IProcessResult,
    ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { CodexMetadataInspector } from './CodexMetadataInspector.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function recordedProcess(): Promise<
    IProcessResult & { readonly exitCode: number; readonly signal: null }
> {
    const value: unknown = JSON.parse(
        await readFile(new URL('./fixtures/native-account-free.json', import.meta.url), 'utf8'),
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
        throw new Error('The recorded native metadata transport is invalid.');

    return { stdout: value.stdout, stderr: value.stderr, exitCode: value.exitCode, signal: null };
}

async function fixture(frames: unknown[], recording?: IProcessResult) {
    const root = await mkdtemp(join(tmpdir(), 'synapse-codex-metadata-'));

    owned.push(root);

    const instance: IAiInstance = {
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
            },
        },
    };
    const sent: unknown[] = [];
    const stop = vi.fn(async () => undefined);
    const runner: ProcessRunnerBase = {
        dispose: vi.fn(async () => undefined),
        run: vi.fn(async (request: IProcessRequest) => {
            request.onStart?.({
                write: (line) => {
                    sent.push(JSON.parse(line));
                },
                end: () => undefined,
                stop,
            });

            const transcript =
                recording?.stdout ?? frames.map((frame) => JSON.stringify(frame) + '\n').join('');

            for (let index = 0; index < transcript.length; index += 17)
                await request.onStdout?.(transcript.slice(index, index + 17));

            return recording ?? { stdout: '', stderr: '', exitCode: null, signal: 'SIGTERM' };
        }),
    };

    return {
        instance,
        runner,
        sent,
        stop,
        snapshot: {
            home: join(root, 'inspection'),
            source: join(root, 'credentials/auth.json'),
            target: join(root, 'inspection/auth.json'),
        },
    };
}

const model = {
    model: 'native-model',
    displayName: 'Native model',
    description: 'Synthetic advertised model.',
    hidden: false,
    isDefault: true,
    defaultReasoningEffort: 'high',
    supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'More reasoning.' }],
};

describe('CodexMetadataInspector', () => {
    it('replays recorded account-free metadata while retaining models and degrading unavailable account usage', async () => {
        // Arrange
        const capture = await recordedProcess();
        const state = await fixture([], capture);

        // Act
        const result = await new CodexMetadataInspector(state.runner).inspect(
            state.instance,
            state.snapshot,
            new AbortController().signal,
        );

        // Assert
        expect(result.models).toHaveLength(8);
        expect(result.models?.[0]).toMatchObject({
            id: 'gpt-6.1-sol',
            isDefault: true,
            defaultReasoningEffort: 'low',
        });
        expect(result.metadataWarnings).toEqual(
            expect.arrayContaining(['rate-limits-unavailable', 'usage-unavailable']),
        );
        expect(result.limits).toEqual([]);
        expect(result.usage?.windows).toEqual([]);
        expect(state.stop).toHaveBeenCalledTimes(1);
        expect(state.runner.run).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain('recording-host.invalid');
        expect(JSON.stringify(state.sent)).not.toMatch(/thread\/|session\/|prompt/u);
    });

    it('reads native metadata without starting agent threads and waits for owned shutdown', async () => {
        // Arrange
        const state = await fixture([
            { id: 1, result: {} },
            { id: 2, result: { data: [model], nextCursor: null } },
            {
                id: 3,
                result: {
                    rateLimits: {
                        planType: 'synthetic-plan',
                        primary: {
                            usedPercent: 25,
                            windowDurationMins: 300,
                            resetsAt: 2_000_000_000,
                        },
                        credits: { hasCredits: true, unlimited: false, balance: '4.2' },
                    },
                },
            },
            {
                id: 4,
                result: {
                    summary: { lifetimeTokens: 120, peakDailyTokens: 50, currentStreakDays: 3 },
                },
            },
        ]);

        // Act
        const result = await new CodexMetadataInspector(state.runner).inspect(
            state.instance,
            state.snapshot,
            new AbortController().signal,
        );

        // Assert
        expect(result.models).toEqual([
            expect.objectContaining({
                id: 'native-model',
                name: 'Native model',
                description: 'Synthetic advertised model.',
                isDefault: true,
                defaultReasoningEffort: 'high',
                reasoningEfforts: ['high'],
                reasoningDescriptions: { high: 'More reasoning.' },
            }),
        ]);
        expect(result.usage).toMatchObject({
            planType: 'synthetic-plan',
            windows: [
                {
                    usedPercent: 25,
                    remainingPercent: 75,
                    windowDurationMinutes: 300,
                    resetsAt: 2_000_000_000_000,
                },
            ],
            credits: { hasCredits: true, unlimited: false, balance: '4.2' },
            tokenUsage: { lifetimeTokens: 120, peakDailyTokens: 50, currentStreakDays: 3 },
        });
        expect(
            state.sent.map((value) =>
                value && typeof value === 'object' && 'method' in value ? value.method : undefined,
            ),
        ).toEqual([
            'initialize',
            'initialized',
            'model/list',
            'account/rateLimits/read',
            'account/usage/read',
        ]);
        expect(state.stop).toHaveBeenCalledTimes(1);
    });

    it('retains models when an optional usage endpoint is unsupported', async () => {
        // Arrange
        const state = await fixture([
            { id: 1, result: {} },
            { id: 2, result: { data: [model] } },
            { id: 3, result: { rateLimits: {} } },
            { id: 4, error: { message: 'Synthetic method unavailable' } },
        ]);

        // Act
        const result = await new CodexMetadataInspector(state.runner).inspect(
            state.instance,
            state.snapshot,
            new AbortController().signal,
        );

        // Assert
        expect(result.models).toHaveLength(1);
        expect(result.metadataWarnings).toEqual(['usage-unavailable']);
        expect(JSON.stringify(result)).not.toContain('Synthetic method unavailable');
    });

    it('rejects an invalid required model response instead of returning an empty catalog', async () => {
        // Arrange
        const state = await fixture([
            { id: 1, result: {} },
            { id: 2, result: { data: [{ model: 42 }] } },
        ]);

        // Act
        const result = new CodexMetadataInspector(state.runner).inspect(
            state.instance,
            state.snapshot,
            new AbortController().signal,
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol' });
    });
});
