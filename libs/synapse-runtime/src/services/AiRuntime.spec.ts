// #region Imports

import { AiDriverBase, AiError } from '@pixel-brewery/synapse-core';
import type {
    IAiCapabilities,
    IAiDriverResult,
    IAiExecutionContext,
    IAiInstance,
    IAiRequest,
    IAiResult,
    AiRouteExecutorBase,
} from '@pixel-brewery/synapse-core';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IAiRuntimeOptions } from '../interfaces/IAiRuntimeOptions.js';
import { AiRuntime } from './AiRuntime.js';

// #endregion

class TestDriver extends AiDriverBase {
    // #region Fields

    public override readonly id = 'test';
    public override readonly capabilities: IAiCapabilities = {
        modes: ['read-only', 'workspace-write'],
        resume: true,
        structuredOutput: 'validated',
        tools: false,
    };

    // #endregion

    // #region Ctor

    public constructor(
        private readonly _execute: (context: IAiExecutionContext) => Promise<IAiDriverResult>,
    ) {
        super();
    }

    // #endregion

    // #region Methods

    public override execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
        return this._execute(context);
    }

    // #endregion
}

const runtimes: AiRuntime[] = [];
const roots: string[] = [];

async function fixture(
    execute: (context: IAiExecutionContext) => Promise<IAiDriverResult>,
    options: Omit<Partial<IAiRuntimeOptions>, 'drivers' | 'instances'> = {},
) {
    const root = await mkdtemp(join(tmpdir(), 'synapse-runtime-test-'));

    roots.push(root);

    const instance: IAiInstance = {
        id: 'one',
        driverId: 'test',
        profile: {
            id: 'profile-one',
            applicationId: 'tests',
            accountId: 'account-one',
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
    const driver = new TestDriver(execute);
    const runtime = new AiRuntime({ drivers: [driver], instances: [instance], ...options });

    runtimes.push(runtime);

    const request: IAiRequest = {
        target: { instanceId: instance.id },
        prompt: 'Synthetic input.',
        policy: { mode: 'read-only' },
        workingDirectory: root,
    };

    return { runtime, driver, instance, request, root };
}

afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('AiRuntime', () => {
    it('does not change credentials when cancellation leaves native process cleanup unconfirmed', async () => {
        // Arrange
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const execute = vi.fn(async (context: IAiExecutionContext) => {
            entered();
            await new Promise<void>((resolve) =>
                context.signal.addEventListener('abort', () => resolve(), { once: true }),
            );

            throw new AiError('host', 'Synthetic native cleanup failure.', {
                cleanupIncomplete: true,
            });
        });
        const { runtime, instance, request } = await fixture(execute);
        const handle = runtime.run(request);

        await started;

        const mutate = vi.fn(async () => undefined);

        // Act
        const change = runtime.access.credentialChange(instance.profile, mutate);

        // Assert
        await expect(change).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });
        await expect(handle.result).rejects.toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
        });
        await expect(runtime.run(request).result).rejects.toMatchObject({
            cleanupIncomplete: true,
        });
        await expect(handle.cancel()).rejects.toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
        });
        expect(mutate).not.toHaveBeenCalled();
        expect(execute).toHaveBeenCalledOnce();
        runtimes.splice(runtimes.indexOf(runtime), 1);
        await expect(runtime.dispose()).rejects.toMatchObject({
            code: 'host',
            cleanupIncomplete: true,
        });
    });

    it('does not run a queued request with a replacement account configuration', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'must not run' }));
        const { runtime, instance, request } = await fixture(execute);

        await runtime.configureInstance(instance);

        // Act
        const handle = runtime.run(request);

        await runtime.configureInstance({
            ...instance,
            environment: { SYNTHETIC_ACCOUNT: 'replacement' },
        });

        // Assert
        await expect(handle.result).rejects.toMatchObject({ code: 'auth-busy' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('preserves legacy sessions initially and rejects them after a persisted account transition even after restart', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'continued', sessionId: 'native' }));
        const { runtime, instance, request, driver } = await fixture(execute);
        const legacy = {
            driverId: 'test',
            instanceId: 'one',
            profileId: 'profile-one',
            candidateId: 'one',
            nativeId: 'native',
        };
        const initial = await runtime.run({ ...request, session: legacy }).result;

        expect(initial.session).toMatchObject(legacy);
        expect(initial.session?.authenticationGeneration).toMatch(/^initial-/u);

        // Act
        await runtime.access.credentialChange(instance.profile, async () => undefined);

        const restarted = new AiRuntime({ drivers: [driver], instances: [instance] });

        runtimes.push(restarted);

        // Assert
        await expect(restarted.run({ ...request, session: legacy }).result).rejects.toMatchObject({
            code: 'session-unavailable',
            sessionUsable: false,
        });

        const fresh = await restarted.run(request).result;

        expect(fresh.session?.authenticationGeneration).toBeTypeOf('string');
        await expect(
            restarted.run({ ...request, session: fresh.session }).result,
        ).resolves.toMatchObject({ text: 'continued' });
        expect(execute).toHaveBeenCalledTimes(3);
    });

    it('invalidates old sessions after explicit credential configuration changes across restarts', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'done', sessionId: 'native' }));
        const { runtime, instance, request, driver } = await fixture(execute);
        const previous = await runtime.run(request).result;

        // Act
        const restarted = new AiRuntime({
            drivers: [driver],
            instances: [{ ...instance, environment: { SYNTHETIC_ACCOUNT: 'second' } }],
        });

        runtimes.push(restarted);

        // Assert
        await expect(
            restarted.run({ ...request, session: previous.session }).result,
        ).rejects.toMatchObject({ code: 'session-unavailable' });
        expect(execute).toHaveBeenCalledOnce();
    });

    it('snapshots mutable caller configuration so a later explicit account change cannot retain old sessions', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'done', sessionId: 'native' }));
        const { runtime, instance, request } = await fixture(execute);
        const environment = { SYNTHETIC_ACCOUNT: 'first' };
        const configured = { ...instance, environment };

        await runtime.configureInstance(configured);

        const first = await runtime.run(request).result;

        // Act
        environment.SYNTHETIC_ACCOUNT = 'second';
        await runtime.configureInstance(configured);

        // Assert
        await expect(
            runtime.run({ ...request, session: first.session }).result,
        ).rejects.toMatchObject({
            code: 'session-unavailable',
        });
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects an emitted session after rebinding the same identifiers to a fresh native home on restart', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'done', sessionId: 'native' }));
        const { runtime, instance, request, driver } = await fixture(execute);
        const first = await runtime.run(request).result;
        const root = await mkdtemp(join(tmpdir(), 'synapse-rebound-test-'));

        roots.push(root);

        const replacement: IAiInstance = {
            ...instance,
            profile: {
                ...instance.profile,
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

        // Act
        const restarted = new AiRuntime({ drivers: [driver], instances: [replacement] });

        runtimes.push(restarted);

        // Assert
        await expect(
            restarted.run({ ...request, session: first.session }).result,
        ).rejects.toMatchObject({ code: 'session-unavailable' });
        expect(execute).toHaveBeenCalledOnce();
    });

    it('drains current execution before replacing account configuration', async () => {
        // Arrange
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        let cleaned = false;
        const { runtime, instance, request } = await fixture(async (context) => {
            entered();
            await new Promise<void>((resolve) =>
                context.signal.addEventListener('abort', () => resolve(), { once: true }),
            );
            cleaned = true;

            throw new AiError('cancelled', 'Configuration changed.');
        });
        const handle = runtime.run(request);

        await started;

        // Act
        await runtime.configureInstance({
            ...instance,
            environment: { SYNTHETIC_ACCOUNT: 'changed' },
        });

        // Assert
        expect(cleaned).toBe(true);
        await expect(handle.result).rejects.toMatchObject({ code: 'cancelled' });
    });

    it('does not accept an empty ordinary-text result solely because unvalidated structured data exists', async () => {
        // Arrange
        const { runtime, request } = await fixture(async () => ({
            text: '',
            structured: { unvalidated: true },
        }));

        // Act / Assert
        await expect(runtime.run(request).result).rejects.toMatchObject({ code: 'protocol' });
    });

    it('retains an accepted resume reference and latest usage when a driver does not repeat them in its result', async () => {
        // Arrange
        const usage = { input: 10, cachedInput: 2, output: 4, total: 14 };
        const { runtime, request } = await fixture(async (context) => {
            await context.emit({ type: 'usage', usage });

            return { text: 'continued' };
        });
        const session = {
            driverId: 'test',
            instanceId: 'one',
            profileId: 'profile-one',
            candidateId: 'one',
            nativeId: 'existing',
        };

        // Act
        const result = await runtime.run({ ...request, session }).result;

        // Assert
        expect(result.session).toMatchObject(session);
        expect(result.session?.authenticationGeneration).toMatch(/^initial-/u);
        expect(result.usage).toEqual(usage);
    });

    it('rejects deadlines exceeding native timer bounds before starting an execution', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'unused' }));
        const { runtime, request } = await fixture(execute);

        // Act / Assert
        await expect(
            runtime.run({ ...request, deadline: Date.now() + 3_000_000_000 }).result,
        ).rejects.toMatchObject({ code: 'configuration' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('propagates router disposal through native execution and pending critical progress', async () => {
        // Arrange
        const routeController = new AbortController();
        let pending: Promise<IAiResult> | undefined;
        const router: AiRouteExecutorBase = {
            execute: (request, execute) => {
                pending = execute({
                    ...request,
                    target: { instanceId: 'one' },
                    signal: routeController.signal,
                });

                return pending;
            },
            dispose: async () => {
                routeController.abort(new AiError('cancelled', 'Route disposed.'));
                await pending?.catch(() => undefined);
            },
        };
        let started!: () => void;
        const progressStarted = new Promise<void>((resolve) => {
            started = resolve;
        });
        const { runtime, request } = await fixture(
            async (context) => {
                await context.emit({ type: 'progress', message: 'ready' });

                return { text: 'unreachable' };
            },
            { router },
        );
        const handle = runtime.run({
            ...request,
            target: { routeId: 'route' },
            onEvent: async () => {
                started();
                await new Promise<void>(() => undefined);
            },
        });

        await progressStarted;

        // Act
        await router.dispose();

        // Assert
        await expect(handle.result).rejects.toMatchObject({ code: 'cancelled' });
    });

    it('keeps original job authorization and prompt when a router selects a candidate', async () => {
        // Arrange
        const router: AiRouteExecutorBase = {
            execute: (request, execute) =>
                execute({
                    ...request,
                    target: { instanceId: 'one' },
                    prompt: 'different job',
                    policy: { mode: 'workspace-write' },
                    workingDirectory: '/',
                }),
            dispose: async () => undefined,
        };
        const execute = vi.fn(async (context: IAiExecutionContext) => ({
            text: context.request.prompt,
        }));
        const { runtime, request } = await fixture(execute, { router });

        // Act
        await runtime.run({ ...request, target: { routeId: 'route' } }).result;

        // Assert
        const context = execute.mock.calls[0]?.[0];

        expect(context?.request.policy.mode).toBe('read-only');
        expect(context?.request.prompt).toBe(request.prompt);
        expect(context?.workingDirectory).toBe(request.workingDirectory);
    });

    it('completes once without an event consumer while retaining a bounded progress tail', async () => {
        // Arrange
        const execute = vi.fn(async (context: IAiExecutionContext) => {
            for (let index = 0; index < 100; index++)
                await context.emit({ type: 'progress', message: String(index) });

            return { text: 'final' };
        });
        const { runtime, request } = await fixture(execute, { eventCapacity: 2 });

        // Act
        const handle = runtime.run(request);
        const result = await handle.result;

        // Assert
        expect(result.text).toBe('final');
        expect(execute).toHaveBeenCalledOnce();

        const events = [];

        for await (const event of handle.events) events.push(event);

        expect(events).toEqual([
            { type: 'overflow', dropped: 98 },
            { type: 'progress', message: '98' },
            { type: 'progress', message: '99' },
        ]);
    });

    it('creates and removes a private text workspace without requiring Git', async () => {
        // Arrange
        let directory = '';
        const { runtime, request } = await fixture(async (context) => {
            directory = context.workingDirectory;
            expect((await stat(directory)).isDirectory()).toBe(true);
            await expect(stat(join(directory, '.git'))).rejects.toMatchObject({ code: 'ENOENT' });

            return { text: 'summary' };
        });

        // Act
        const result = await runtime.run({ ...request, workingDirectory: undefined }).result;

        // Assert
        expect(result.text).toBe('summary');
        await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('validates actual structured output and rejects invalid JSON/schema results', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: '{"summary":"done"}' }));
        const { runtime, request } = await fixture(execute);
        const outputSchema = {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
            additionalProperties: false,
        };

        // Act
        const result = await runtime.run({ ...request, outputSchema }).result;

        // Assert
        expect(result.structured).toEqual({ summary: 'done' });
        execute.mockResolvedValueOnce({ text: '{"wrong":1}' });
        await expect(runtime.run({ ...request, outputSchema }).result).rejects.toMatchObject({
            code: 'result-validation',
            retryable: false,
        });
        execute.mockResolvedValueOnce({ text: 'not JSON' });
        await expect(runtime.run({ ...request, outputSchema }).result).rejects.toMatchObject({
            code: 'result-validation',
        });
    });

    it('rejects invalid schema and foreign native sessions before executing a provider', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'unused' }));
        const { runtime, request } = await fixture(execute);

        // Act / Assert
        await expect(
            runtime.run({ ...request, outputSchema: { type: 'nonexistent' } }).result,
        ).rejects.toMatchObject({ code: 'configuration' });
        await expect(
            runtime.run({
                ...request,
                session: {
                    driverId: 'test',
                    instanceId: 'one',
                    profileId: 'someone-else',
                    candidateId: 'one',
                    nativeId: 'session',
                },
            }).result,
        ).rejects.toMatchObject({ code: 'session-unavailable', sessionUsable: false });
        expect(execute).not.toHaveBeenCalled();
    });

    it('stops on critical persistence failure and preserves its nonretryable classification', async () => {
        // Arrange
        let continued = false;
        const execute = vi.fn(async (context: IAiExecutionContext) => {
            await context.emit({ type: 'progress', message: 'ready' });
            continued = true;

            return { text: 'unreachable' };
        });
        const { runtime, request } = await fixture(execute);
        const onEvent = vi.fn(async () => {
            throw new Error('private database detail');
        });

        // Act
        const handle = runtime.run({ ...request, onEvent });

        // Assert
        await expect(handle.result).rejects.toMatchObject({
            code: 'persistence',
            retryable: false,
            message: 'The host could not persist execution progress.',
        });
        expect(execute).toHaveBeenCalledOnce();
        expect(continued).toBe(false);
    });

    it('serializes concurrent critical event publication before completing the result', async () => {
        // Arrange
        const order: string[] = [];
        const { runtime, request } = await fixture(async (context) => {
            await Promise.all([
                context.emit({ type: 'progress', message: 'one' }),
                context.emit({ type: 'progress', message: 'two' }),
            ]);

            return { text: 'done' };
        });

        // Act
        await runtime.run({
            ...request,
            onEvent: async (event) => {
                if (event.type !== 'progress') return;

                order.push('start:' + event.message);
                await Promise.resolve();
                order.push('done:' + event.message);
            },
        }).result;

        // Assert
        expect(order).toEqual(['start:one', 'done:one', 'start:two', 'done:two']);
    });

    it('waits for driver cancellation cleanup during cancel and dispose', async () => {
        // Arrange
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        let cleaned = false;
        const { runtime, request } = await fixture(async (context) => {
            entered();
            await new Promise<void>((resolve) =>
                context.signal.addEventListener('abort', () => resolve(), { once: true }),
            );
            await Promise.resolve();
            cleaned = true;

            throw new AiError('cancelled', 'Synthetic operation cancelled.');
        });
        const handle = runtime.run(request);

        await started;

        // Act
        await handle.cancel();

        // Assert
        expect(cleaned).toBe(true);
        await expect(handle.result).rejects.toMatchObject({ code: 'cancelled' });
        await runtime.dispose();
    });

    it('does not leak admission capacity after an invalid or already-expired request', async () => {
        // Arrange
        const execute = vi.fn(async () => ({ text: 'valid' }));
        const { runtime, request } = await fixture(execute, { maximumRuns: 1 });

        await expect(runtime.run({ ...request, prompt: '' }).result).rejects.toMatchObject({
            code: 'configuration',
        });
        await expect(
            runtime.run({ ...request, deadline: Date.now() - 1 }).result,
        ).rejects.toMatchObject({ code: 'timeout' });

        // Act
        const result = await runtime.run(request).result;

        // Assert
        expect(result.text).toBe('valid');
        expect(execute).toHaveBeenCalledOnce();
    });

    it('rejects execution while credentials change and permits another profile independently', async () => {
        // Arrange
        const { runtime, request } = await fixture(async () => ({ text: 'done' }));
        let release!: () => void;
        const exclusive = runtime.access.exclusive(
            'profile-one',
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        );

        await vi.waitFor(() => expect(release).toBeTypeOf('function'));

        // Act / Assert
        await expect(runtime.run(request).result).rejects.toMatchObject({ code: 'auth-busy' });
        release();
        await exclusive;
        await expect(runtime.run(request).result).resolves.toMatchObject({ text: 'done' });
    });
});
