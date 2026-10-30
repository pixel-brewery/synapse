// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import {
    ProcessRunnerBase,
    type IProcessRequest,
    type IProcessResult,
} from '@pixel-brewery/synapse-runtime';
import type { IProcessReplay } from '../interfaces/IProcessReplay.js';

// #endregion

/**
 * Replays sanitized external process fragments through actual provider parsing and normalization.
 *
 * @remarks No provider dependency, CLI, filesystem discovery or credential state is used.
 *
 * @public
 */
export class ReplayProcessRunner extends ProcessRunnerBase {
    // #region Fields

    private readonly _steps: readonly IProcessReplay[];
    private readonly _active = new Set<AbortController>();
    private readonly _pending = new Set<Promise<IProcessResult>>();
    private _next = 0;
    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Captures a deterministic transport script without executing it.
     *
     * @param steps - Externally supplied responses, one per actual native invocation.
     *
     * @public
     */
    public constructor(steps: readonly IProcessReplay[]) {
        super();
        this._steps = [...steps];
    }

    // #endregion

    // #region Properties

    /**
     * Returns the number of native invocations consumed from this transport script.
     *
     * @returns The replay invocation count, excluding calls rejected after disposal.
     *
     * @public
     */
    public get executionCount(): number {
        return this._next;
    }

    // #endregion

    // #region Methods

    /**
     * Replays one native response through the caller's real serialized output callbacks.
     *
     * @param request - Actual provider subprocess request, including cancellation and byte limits.
     * @returns Bounded captured output and configured native completion status.
     * @throws An AiError for script mismatch, cancellation, limits or disposal; callback failures remain unchanged.
     *
     * @public
     */
    public override run(request: IProcessRequest): Promise<IProcessResult> {
        if (this._disposed)
            return Promise.reject(new AiError('disposed', 'The replay runner has been disposed.'));

        if (request.signal?.aborted)
            return Promise.reject(
                request.signal.reason instanceof AiError
                    ? request.signal.reason
                    : new AiError('cancelled', 'The replayed process was cancelled before launch.'),
            );

        const step = this._steps[this._next++];

        if (!step)
            return Promise.reject(
                new AiError('protocol', 'The process replay script has no remaining invocation.'),
            );

        if (
            (step.executable && step.executable !== request.executable) ||
            (step.args && JSON.stringify(step.args) !== JSON.stringify(request.args))
        )
            return Promise.reject(
                new AiError(
                    'protocol',
                    'The process replay invocation does not match its expected executable or arguments.',
                ),
            );

        const controller = new AbortController();
        const abort = (): void => {
            controller.abort(
                request.signal?.reason instanceof AiError
                    ? request.signal.reason
                    : new AiError('cancelled', 'The replayed process was cancelled.'),
            );
        };

        if (request.signal?.aborted) abort();

        request.signal?.addEventListener('abort', abort, { once: true });
        this._active.add(controller);

        const timeout = setTimeout(
            () => controller.abort(new AiError('timeout', 'The replayed process timed out.')),
            request.timeoutMs ?? 300_000,
        );
        const promise = this.replay(request, step, controller).finally(() => {
            clearTimeout(timeout);
            request.signal?.removeEventListener('abort', abort);
            this._active.delete(controller);
            this._pending.delete(promise);
        });

        this._pending.add(promise);
        void promise.catch(() => undefined);

        return promise;
    }

    /**
     * Cancels and awaits all live replayed invocations without creating an operating-system process.
     *
     * @returns Completion after every active transport replay settles.
     *
     * @public
     */
    public override async dispose(): Promise<void> {
        this._disposed = true;

        for (const controller of this._active)
            controller.abort(new AiError('cancelled', 'The replay runner is shutting down.'));

        await Promise.allSettled([...this._pending]);
    }

    private async replay(
        request: IProcessRequest,
        step: IProcessReplay,
        controller: AbortController,
    ): Promise<IProcessResult> {
        let stopped = false;
        let wake: (() => void) | undefined;
        const stoppedPromise = new Promise<void>((resolve) => {
            wake = resolve;
        });

        request.onStart?.({
            write: (value) => {
                if (!stopped && !controller.signal.aborted) step.onInput?.(value);
            },
            end: () => undefined,
            stop: async () => {
                stopped = true;
                wake?.();
            },
        });

        if (request.input) step.onInput?.(request.input);

        let bytes = 0;
        let stdout = '';
        let stderr = '';
        const emit = async (chunk: string, target: 'stdout' | 'stderr'): Promise<void> => {
            controller.signal.throwIfAborted();
            bytes += Buffer.byteLength(chunk);

            if (bytes > (request.maxOutputBytes ?? 4 * 1024 * 1024))
                throw new AiError(
                    'output-limit',
                    'The replayed process exceeded its combined output budget.',
                );

            if (target === 'stdout') {
                stdout += chunk;

                if (request.onStdout)
                    await interruptible(
                        Promise.resolve(request.onStdout(chunk)),
                        controller.signal,
                    );
            } else {
                stderr += chunk;

                if (request.onStderr)
                    await interruptible(
                        Promise.resolve(request.onStderr(chunk)),
                        controller.signal,
                    );
            }
        };

        for (const chunk of step.stdout ?? []) {
            if (stopped) break;

            await emit(chunk, 'stdout');
        }

        for (const chunk of step.stderr ?? []) {
            if (stopped) break;

            await emit(chunk, 'stderr');
        }

        if (step.waitForStop && !stopped) await interruptible(stoppedPromise, controller.signal);

        controller.signal.throwIfAborted();

        return {
            stdout,
            stderr,
            exitCode: stopped ? null : step.exitCode === undefined ? 0 : step.exitCode,
            signal: stopped ? 'SIGTERM' : (step.signal ?? null),
        };
    }

    // #endregion
}

async function interruptible<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();

    let abort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
    });

    try {
        return await Promise.race([value, interrupted]);
    } finally {
        if (abort) signal.removeEventListener('abort', abort);
    }
}
