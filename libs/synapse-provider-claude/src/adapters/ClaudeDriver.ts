// #region Imports

import {
    AiDriverBase,
    AiError,
    type IAiCapabilities,
    type IAiDriverResult,
    type IAiExecutionContext,
} from '@pixel-brewery/synapse-core';
import { JsonLineDecoder, type ProcessRunnerBase } from '@pixel-brewery/synapse-runtime';
import { ClaudeAuthDriver } from '../auth/ClaudeAuthDriver.js';
import { ClaudeEventDecoder } from '../protocol/ClaudeEventDecoder.js';
import { claudeExecutionArguments } from '../protocol/claudeExecutionArguments.js';
import { createClaudeEnvironment } from '../profile/createClaudeEnvironment.js';

// #endregion

/**
 * Native Claude print/stream-json adapter with explicit account and permission isolation.
 *
 * @remarks Safe mode preserves native subscription authentication; no API key is required.
 *
 * @public
 */
export class ClaudeDriver extends AiDriverBase {
    // #region Fields

    /**
     * Open identity used for explicit consumer registration.
     *
     * @public
     */
    public override readonly id: string = 'claude';

    /**
     * Native plan/acceptEdits permissions, continuation and schema output support.
     *
     * @public
     */
    public override readonly capabilities: IAiCapabilities = {
        modes: ['read-only', 'workspace-write'],
        resume: true,
        structuredOutput: 'native',
        tools: true,
    };

    /**
     * Native procedures sharing this driver's owned subprocess boundary.
     *
     * @public
     */
    public override readonly auth: ClaudeAuthDriver;

    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Creates an explicitly composed inert driver.
     *
     * @param _runner - Dedicated owned subprocess boundary; dispose drains its processes.
     *
     * @public
     */
    public constructor(private readonly _runner: ProcessRunnerBase) {
        super();
        this.auth = new ClaudeAuthDriver(_runner);
    }

    // #endregion

    // #region Methods

    /**
     * Executes one native print turn without putting the prompt in process arguments.
     *
     * @param context - Isolated authorized execution and critical event callback.
     * @returns The same invocation's final text, native structured output and usage.
     * @throws An AiError for configuration, native/protocol or cancellation failure.
     *
     * @public
     */
    public override async execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
        if (this._disposed) throw new AiError('disposed', 'Claude driver is disposed.');

        if (!this.capabilities.modes.includes(context.request.policy.mode))
            throw new AiError('unsupported', 'Claude cannot enforce the requested execution mode.');

        if (context.signal.aborted)
            throw context.signal.reason instanceof AiError
                ? context.signal.reason
                : new AiError('cancelled', 'Claude execution was cancelled.');

        if (context.request.deadline !== undefined && context.request.deadline <= Date.now())
            throw new AiError('timeout', 'The Claude deadline expired before launch.');

        const args = claudeExecutionArguments(context);
        const decoder = new ClaudeEventDecoder(context);
        const lines = new JsonLineDecoder((frame: unknown) => decoder.accept(frame));
        const result = await this._runner.run({
            executable: context.instance.executable ?? 'claude',
            args,
            workingDirectory: context.workingDirectory,
            environment: await createClaudeEnvironment(context.instance),
            input: context.request.prompt,
            signal: context.signal,
            timeoutMs: Math.min(
                2_147_483_647,
                Math.max(1, (context.request.deadline ?? Date.now() + 300_000) - Date.now()),
            ),
            maxOutputBytes: 4_194_304,
            onStdout: (chunk) => lines.push(chunk),
        });

        await lines.finish();

        return decoder.complete(result.exitCode, result.stderr);
    }

    /**
     * Stops and awaits every native execution/login owned by this driver.
     *
     * @returns Completion after the injected owned runner drains.
     *
     * @public
     */
    public override async dispose(): Promise<void> {
        this._disposed = true;
        await this._runner.dispose();
    }

    // #endregion
}
