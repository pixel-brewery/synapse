// #region Imports

import {
    AiDriverBase,
    AiError,
    type IAiCapabilities,
    type IAiDriverResult,
    type IAiExecutionContext,
} from '@pixel-brewery/synapse-core';
import type { ISimulatedDriverOptions } from '../interfaces/ISimulatedDriverOptions.js';

// #endregion

/**
 * Explicit synthetic execution through the same runtime contracts as real providers.
 *
 * @remarks This adapter performs no inference. A consumer must label simulation explicitly.
 *
 * @public
 */
export class SimulatedDriver extends AiDriverBase {
    // #region Fields

    /**
     * Open synthetic implementation identifier.
     *
     * @public
     */
    public override readonly id: string;

    /**
     * Synthetic guarantees supplied to runtime capability validation.
     *
     * @public
     */
    public override readonly capabilities: IAiCapabilities;

    private _executionCount = 0;

    // #endregion

    // #region Ctor

    /**
     * Captures fixture behavior without performing work or retaining prompts.
     *
     * @param _options - Explicit synthetic events, capabilities and result.
     *
     * @public
     */
    public constructor(private readonly _options: ISimulatedDriverOptions) {
        super();
        this.id = _options.id ?? 'simulated';
        this.capabilities = _options.capabilities ?? {
            modes: ['read-only', 'workspace-write'],
            resume: true,
            structuredOutput: 'validated',
            tools: false,
        };
    }

    // #endregion

    // #region Properties

    /**
     * Returns the number of actual execute calls, without storing their private inputs.
     *
     * @returns Completed or attempted synthetic invocation count.
     *
     * @public
     */
    public get executionCount(): number {
        return this._executionCount;
    }

    // #endregion

    // #region Methods

    /**
     * Emits fixture events and returns the explicitly supplied synthetic result.
     *
     * @param context - Real runtime context, cancellation and critical event sink.
     * @returns The configured synthetic result of this same invocation.
     * @throws An AiError on cancellation; host callback failures propagate unchanged.
     *
     * @public
     */
    public override async execute(context: IAiExecutionContext): Promise<IAiDriverResult> {
        this._executionCount++;

        for (const event of this._options.events ?? []) {
            this.checkAbort(context.signal);
            await context.emit(event);
        }

        this.checkAbort(context.signal);

        const result =
            typeof this._options.result === 'function'
                ? await this._options.result(context)
                : this._options.result;

        this.checkAbort(context.signal);

        return { ...result, ...(result.usage ? { usage: { ...result.usage } } : {}) };
    }

    private checkAbort(signal: AbortSignal): void {
        if (signal.aborted)
            throw signal.reason instanceof AiError
                ? signal.reason
                : new AiError('cancelled', 'The simulated execution was cancelled.');
    }

    // #endregion
}
