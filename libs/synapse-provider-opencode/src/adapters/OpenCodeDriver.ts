// #region Imports

import {
    AiDriverBase,
    AiError,
    type IAiCapabilities,
    type IAiDriverResult,
    type IAiExecutionContext,
    type IAiInspection,
    type IAiInstance,
    type IAiUsage,
} from '@pixel-brewery/synapse-core';
import {
    boundedText,
    JsonLineDecoder,
    type ProcessRunnerBase,
} from '@pixel-brewery/synapse-runtime';
import { stripVTControlCharacters } from 'node:util';
import { OpenCodeAuthDriver } from './OpenCodeAuthDriver.js';
import { openCodeConfiguration } from '../openCodeConfiguration.js';
import { openCodeEnvironment } from '../openCodeEnvironment.js';

// #endregion

/**
 * Executes installed OpenCode CLIs through their native noninteractive JSON protocol.
 *
 * @remarks Imports and construction perform no discovery, login, installation or inference.
 *
 * @public
 */
export class OpenCodeDriver extends AiDriverBase {
    // #region Fields

    /**
     * Stable open driver identifier.
     *
     * @public
     */
    public override readonly id: string = 'opencode';

    /**
     * Native policy modes and locally validated structured output support.
     *
     * @public
     */
    public override readonly capabilities: IAiCapabilities = {
        modes: ['read-only', 'workspace-write'],
        resume: true,
        structuredOutput: 'validated',
        tools: true,
    };

    /**
     * Explicit provider-specific native account lifecycle.
     *
     * @public
     */
    public override readonly auth: OpenCodeAuthDriver;

    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Creates an inert adapter with the shared owned-process boundary.
     *
     * @param _runner - Injected operating-system runner or protocol replay transport.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {
        super();
        this.auth = new OpenCodeAuthDriver(_runner);
    }

    // #endregion

    // #region Methods

    /**
     * Executes one selected native turn and normalizes only safe public events.
     *
     * @param context - Isolated instance, host policy, prompt and critical event sink.
     * @returns Final native text plus the latest session and token snapshot.
     * @throws An AiError for native launch, protocol, authentication, capacity or session failures.
     *
     * @public
     */
    public override async execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
        if (this._disposed) throw new AiError('disposed', 'OpenCodeDriver has been disposed.');

        if (context.signal.aborted)
            throw context.signal.reason instanceof AiError
                ? context.signal.reason
                : new AiError('cancelled', 'OpenCode execution was cancelled before launch.');

        if (context.request.deadline !== undefined && context.request.deadline <= Date.now())
            throw new AiError('timeout', 'OpenCode execution deadline expired before launch.');

        const config = openCodeConfiguration(context.instance);
        const model = context.request.model ?? config.model;
        const variant = context.request.reasoningEffort ?? config.variant;
        const environment = await openCodeEnvironment(
            context.instance,
            context.request.policy,
            model,
        );
        const args = [
            '--pure',
            'run',
            '--format',
            'json',
            '--auto',
            '--thinking',
            '--agent',
            context.request.policy.mode === 'read-only' ? 'plan' : 'build',
            '--dir',
            context.workingDirectory,
            ...(context.request.session ? ['--session', context.request.session.nativeId] : []),
            ...(model ? ['--model', model] : []),
            ...(variant ? ['--variant', variant] : []),
        ];
        let text = '';
        let sessionId: string | undefined;
        let usage: IAiUsage | undefined;
        const finishedParts = new Set<string>();
        const decoder = new JsonLineDecoder(async (value: unknown) => {
            if (!record(value) || typeof value['type'] !== 'string')
                throw new AiError('protocol', 'OpenCode emitted an invalid JSON event.');

            if (
                typeof value['sessionID'] === 'string' &&
                value['sessionID'].trim() &&
                value['sessionID'] !== sessionId
            ) {
                sessionId = value['sessionID'];
                await context.emit({ type: 'session', session: context.session(sessionId) });
            }

            if (value['type'] === 'error')
                throw nativeFailure(
                    JSON.stringify(value['error'] ?? value['part'] ?? {}),
                    !!context.request.session,
                );

            const part = value['part'];

            if (!record(part)) return;

            if (value['type'] === 'text' && typeof part['text'] === 'string') {
                text += `${text ? '\n\n' : ''}${part['text']}`;
                await context.emit({
                    type: 'progress',
                    category: 'message',
                    message: boundedText(part['text']),
                });
            } else if (value['type'] === 'reasoning' && typeof part['text'] === 'string')
                await context.emit({
                    type: 'progress',
                    category: 'reasoning',
                    message: boundedText(part['text']),
                });
            else if (value['type'] === 'tool_use' && typeof part['tool'] === 'string')
                await context.emit({
                    type: 'progress',
                    category: 'tool',
                    message: boundedText(`OpenCode tool: ${part['tool']}`),
                });
            else if (value['type'] === 'step_finish' && record(part['tokens'])) {
                const partId = typeof part['id'] === 'string' ? part['id'] : undefined;

                if (partId && finishedParts.has(partId)) return;

                if (partId) finishedParts.add(partId);

                const tokens = part['tokens'];
                const input = count(tokens['input']);
                const output = count(tokens['output']);
                const cache = tokens['cache'];

                usage = {
                    input: (usage?.input ?? 0) + input,
                    output: (usage?.output ?? 0) + output,
                    cachedInput:
                        (usage?.cachedInput ?? 0) + (record(cache) ? count(cache['read']) : 0),
                    total: (usage?.total ?? 0) + input + output,
                };
                await context.emit({ type: 'usage', usage });
            }
        });
        const result = await this._runner.run({
            executable: context.instance.executable ?? 'opencode',
            args,
            workingDirectory: context.workingDirectory,
            environment,
            input: context.request.prompt,
            signal: context.signal,
            timeoutMs: Math.min(
                2_147_483_647,
                Math.max(1, (context.request.deadline ?? Date.now() + 300_000) - Date.now()),
            ),
            onStdout: (chunk) => decoder.push(chunk),
        });

        await decoder.finish();

        if (result.exitCode !== 0) throw nativeFailure(result.stderr, !!context.request.session);

        if (!text.trim())
            throw new AiError('provider', 'OpenCode completed without a final result.', {
                retryable: true,
            });

        return {
            text: text.trim(),
            ...(sessionId ? { sessionId } : {}),
            ...(usage ? { usage } : {}),
        };
    }

    /**
     * Inspects this isolated CLI's credentials and advertised model identifiers without inference.
     *
     * @param instance - Selected profile and explicit native settings.
     * @param signal - Bounded inspection cancellation.
     * @returns Safe native account state and model metadata; host catalog policy remains separate.
     * @throws An AiError when bounded native model discovery fails.
     *
     * @public
     */
    public override async inspect(
        instance: IAiInstance,
        signal: AbortSignal,
    ): Promise<IAiInspection> {
        const auth = await this.auth.status(instance, signal);
        const result = await this._runner.run({
            executable: instance.executable ?? 'opencode',
            args: ['--pure', 'models'],
            workingDirectory: instance.profile.paths.home,
            environment: await openCodeEnvironment(instance),
            signal,
            timeoutMs: 10_000,
        });

        if (result.exitCode !== 0)
            throw new AiError('provider', 'OpenCode model inspection failed.');

        const ids = [
            ...new Set(
                result.stdout
                    .split(/\r?\n/u)
                    .map((line) => stripVTControlCharacters(line).trim())
                    .filter((line) => /^[^\s/]+\/[^\s]+$/u.test(line)),
            ),
        ];

        return { auth, models: ids.map((id) => ({ id })) };
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

    // #endregion
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nativeFailure(message: string, session: boolean): AiError {
    message = message.replace(/\s+/gu, ' ');

    if (session && /session.*(?:not.?found|unavailable|does not exist)/iu.test(message))
        return new AiError(
            'session-unavailable',
            'The OpenCode continuation is no longer available.',
            {
                sessionUsable: false,
            },
        );

    if (
        /authentication|required.*(?:login|sign.?in)|unauthorized|invalid api key|no credentials|(?:ProviderAuth|AuthRequired|OAuth).*Error/iu.test(
            message,
        )
    )
        return new AiError(
            'auth-required',
            'OpenCode requires authentication for the selected account.',
        );

    if (
        /(?:account|subscription|billing|credit).*(?:quota|limit|exhaust|insufficient)|(?:quota|rate limit).*(?:account|subscription)/iu.test(
            message,
        )
    )
        return new AiError(
            /rate/iu.test(message) ? 'rate-limit' : 'quota',
            'The OpenCode account has reached its reported capacity.',
            { retryable: true },
        );

    if (/invalid configuration|unknown (?:argument|option)|permission denied/iu.test(message))
        return new AiError(
            'configuration',
            'OpenCode rejected its configuration or execution policy.',
        );

    return new AiError('provider', 'OpenCode could not complete the selected turn.', {
        retryable: true,
    });
}
