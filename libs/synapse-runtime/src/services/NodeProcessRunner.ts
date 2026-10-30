// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import crossSpawn from 'cross-spawn';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { setTimeout as delay } from 'node:timers/promises';
import { ProcessRunnerBase } from '../abstracts/ProcessRunnerBase.js';
import type { IProcessRequest } from '../interfaces/IProcessRequest.js';
import type { IProcessResult } from '../interfaces/IProcessResult.js';
import type { INodeProcessRunnerOptions } from '../interfaces/INodeProcessRunnerOptions.js';
import { resolveExecutable } from '../resolveExecutable.js';
import { runSystemTool } from '../runSystemTool.js';

// #endregion

type ActiveProcess = { readonly stop: () => Promise<void>; readonly done: Promise<void> };

type GroupPresence = 'present' | 'absent' | 'unconfirmed';

/**
 * Native executable/shim runner with bounded UTF-8 streams and awaited process-tree cleanup.
 *
 * @remarks Uses cross-spawn's Windows PATH/PATHEXT and command-shim escaping rather than interpolating user shell commands.
 *
 * @public
 */
export class NodeProcessRunner extends ProcessRunnerBase {
    // #region Fields

    private readonly _active = new Set<ActiveProcess>();
    private readonly _grace: number;
    private readonly _maximum: number;
    private _cleanupFailure?: AiError;
    private _disposed = false;

    // #endregion

    // #region Ctor

    /**
     * Creates an inert runner; executable resolution occurs only during run.
     *
     * @param options - Process-count and termination budgets.
     * @throws An AiError when a resource budget is invalid.
     *
     * @public
     */
    public constructor(options: INodeProcessRunnerOptions = {}) {
        super();
        this._grace = options.terminationGraceMs ?? 500;
        this._maximum = options.maximumProcesses ?? 32;

        if (
            !Number.isSafeInteger(this._grace) ||
            this._grace < 1 ||
            !Number.isSafeInteger(this._maximum) ||
            this._maximum < 1
        ) {
            throw new AiError('configuration', 'Invalid native process budgets.');
        }
    }

    // #endregion

    // #region Methods

    /**
     * Executes one explicit argument vector and resolves after native output and cleanup finish.
     *
     * @param request - Executable, complete profile environment, stdin and bounded callbacks.
     * @returns Captured output and native exit status; an intentional control.stop is a normal termination.
     * @throws An AiError for launch, abort, timeout, resource-limit or critical callback failure; cleanupIncomplete remains set when native termination cannot be confirmed.
     * @remarks POSIX cleanup waits for the owned process group to disappear, including descendants with separate output streams. Forced termination has a further one-second confirmation window after the configured graceful window. Native start and root-close acknowledgments use bounded one-second waits. Permission-denied group probes remain unconfirmed until absence is proven; fallback signals target only the owned child handle. Unconfirmed cleanup fails closed.
     *
     * @public
     */
    public override async run(request: IProcessRequest): Promise<IProcessResult> {
        if (this._disposed) throw new AiError('disposed', 'This process runner has been disposed.');

        if (this._active.size >= this._maximum)
            throw new AiError('host', 'The native process budget is exhausted.');

        if (request.signal?.aborted) throw this.abortError(request.signal);

        const budget = request.maxOutputBytes ?? 4 * 1024 * 1024;
        const timeoutMs = request.timeoutMs ?? 300_000;

        if (
            !Number.isSafeInteger(budget) ||
            budget < 1 ||
            !Number.isSafeInteger(timeoutMs) ||
            timeoutMs < 1 ||
            timeoutMs > 2_147_483_647 ||
            !request.executable ||
            request.executable.includes('\0')
        ) {
            throw new AiError('configuration', 'Invalid native execution configuration.');
        }

        if (Buffer.byteLength(request.input ?? '') > 32 * 1024 * 1024)
            throw new AiError('configuration', 'Native stdin exceeded its byte budget.');

        const executable = resolveExecutable(
            request.executable,
            request.environment,
            request.workingDirectory,
        );
        const child = crossSpawn(executable, [...request.args], {
            cwd: request.workingDirectory,
            env: { ...request.environment },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        let bytes = 0;
        let failure: unknown;
        let stopped = false;
        let callbacks = Promise.resolve();
        let finish!: () => void;
        const done = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const interrupted = new AbortController();
        const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
        let terminate: Promise<void> | undefined;
        let rejectCleanup!: (cause: unknown) => void;
        const cleanupFailed = new Promise<never>((_resolve, reject) => {
            rejectCleanup = reject;
        });

        void cleanupFailed.catch(() => undefined);

        const started = new Promise<void>((resolve) => {
            child.once('spawn', () => resolve());
        });
        const closed = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
            child.once('error', (cause) => {
                failure ??= new AiError('host', 'The configured CLI could not be started.', {
                    cause,
                });
                interrupted.abort();
            });
            child.once('close', (code, signal) => resolve({ code, signal }));
        });
        const terminateTree = (): Promise<void> => {
            const pid = child.pid;

            if (!pid) return Promise.resolve();

            const cleanup = async (): Promise<void> => {
                if (
                    process.platform !== 'win32' &&
                    !(await this.awaitProcessEvent(started, 1_000))
                ) {
                    child.kill('SIGKILL');
                    await this.awaitProcessEvent(closed, 1_000);

                    throw new AiError('host', 'Native process startup could not be confirmed.');
                }

                await this.terminateTree(pid, child, closed);
            };

            terminate ??= cleanup().catch((cause: unknown) => {
                const cleanup = new AiError(
                    'host',
                    'The native process tree could not be terminated.',
                    {
                        cause,
                        cleanupIncomplete: true,
                        sessionUsable: false,
                    },
                );

                this._cleanupFailure ??= cleanup;
                interrupted.abort();
                rejectCleanup(cleanup);

                throw cleanup;
            });

            return terminate;
        };
        const stop = async (): Promise<void> => {
            stopped = true;
            child.stdin?.destroy();
            child.stdout?.resume();
            child.stderr?.resume();
            await terminateTree();
            await closed;
        };
        const fail = (cause: unknown): void => {
            failure ??= cause;
            interrupted.abort();
            void stop().catch((cleanup) => {
                failure ??= cleanup;
            });
        };
        const active: ActiveProcess = {
            stop: async (): Promise<void> => {
                fail(new AiError('cancelled', 'The native process runner is shutting down.'));
                await stop();
            },
            done,
        };

        this._active.add(active);

        const onAbort = (): void => fail(this.abortError(request.signal!));

        request.signal?.addEventListener('abort', onAbort, { once: true });

        const timeout = setTimeout(
            () => fail(new AiError('timeout', 'The native CLI execution deadline expired.')),
            timeoutMs,
        );
        const consume = (kind: 'stdout' | 'stderr', buffer: Buffer): void => {
            if (stopped) return;

            bytes += buffer.byteLength;

            if (bytes > budget) {
                fail(
                    new AiError(
                        'output-limit',
                        'The native CLI exceeded its combined output budget.',
                    ),
                );

                return;
            }

            const chunk = decoders[kind].write(buffer);

            if (kind === 'stdout') stdout += chunk;
            else stderr += chunk;

            const callback = kind === 'stdout' ? request.onStdout : request.onStderr;

            if (!callback || !chunk) return;

            const stream = kind === 'stdout' ? child.stdout : child.stderr;

            stream?.pause();
            callbacks = callbacks
                .then(async () => {
                    if (failure) return;

                    await callback(chunk);
                })
                .catch((cause: unknown) => {
                    fail(
                        cause instanceof AiError
                            ? cause
                            : new AiError('host', 'A critical native stream callback failed.', {
                                  cause,
                              }),
                    );
                })
                .finally(() => {
                    stream?.resume();
                });
        };

        child.stdout?.on('data', (chunk: Buffer) => consume('stdout', chunk));
        child.stderr?.on('data', (chunk: Buffer) => consume('stderr', chunk));
        child.stdin?.on('error', (cause: NodeJS.ErrnoException) => {
            if (cause.code !== 'EPIPE' && !stopped)
                fail(new AiError('host', 'Native stdin failed.', { cause }));
        });

        // A CLI may exit while descendants still retain its output pipes. Reap the tree immediately.
        child.once('exit', () => {
            void terminateTree().catch(fail);
        });

        try {
            try {
                request.onStart?.({
                    write: (value: string): void => {
                        if (!stopped) child.stdin?.write(value);
                    },
                    end: (): void => {
                        child.stdin?.end();
                    },
                    stop,
                });

                if (request.input !== undefined) child.stdin?.write(request.input);

                if (!request.keepInputOpen) child.stdin?.end();
            } catch (cause) {
                fail(new AiError('host', 'Native process startup interaction failed.', { cause }));
            }

            if (request.signal?.aborted) onAbort();

            const status = await Promise.race([closed, cleanupFailed]);

            await this.awaitCallbacks(callbacks, interrupted.signal);

            if (!stopped && !failure) {
                for (const kind of ['stdout', 'stderr'] as const) {
                    const tail = decoders[kind].end();

                    if (!tail) continue;

                    if (kind === 'stdout') stdout += tail;
                    else stderr += tail;

                    const callback = kind === 'stdout' ? request.onStdout : request.onStderr;

                    if (callback) {
                        const flushed = Promise.resolve()
                            .then(() => callback(tail))
                            .catch((cause: unknown) => {
                                fail(
                                    cause instanceof AiError
                                        ? cause
                                        : new AiError(
                                              'host',
                                              'A critical native stream callback failed.',
                                              { cause },
                                          ),
                                );
                            });

                        await this.awaitCallbacks(flushed, interrupted.signal);
                    }
                }
            }

            if (failure) throw failure;

            return { stdout, stderr, exitCode: status.code, signal: status.signal };
        } finally {
            clearTimeout(timeout);
            request.signal?.removeEventListener('abort', onAbort);

            try {
                await terminateTree();
            } finally {
                this._active.delete(active);
                finish();
            }
        }
    }

    /**
     * Aborts all owned runs and awaits their process trees and result cleanup.
     *
     * @returns Completion after every active run reaches its cleanup barrier.
     * @throws An AiError with cleanupIncomplete and an unusable session if a native process tree cannot be terminated; a host must keep credential transitions blocked for the affected profile.
     * @remarks Earlier incomplete cleanup remains latched after its run rejects and is reported by every later disposal. The latch does not reject new run calls before explicit disposal; profile admission is coordinated by the host runtime.
     *
     * @public
     */
    public override async dispose(): Promise<void> {
        this._disposed = true;

        const active = [...this._active];
        const results = await Promise.allSettled(active.map((value) => value.stop()));

        await Promise.all(active.map((value) => value.done));

        const failures = new Set<unknown>(this._cleanupFailure ? [this._cleanupFailure] : []);

        for (const result of results) if (result.status === 'rejected') failures.add(result.reason);

        if (failures.size)
            throw new AiError('host', 'A native process could not be stopped.', {
                cause: new AggregateError([...failures]),
                cleanupIncomplete: true,
                sessionUsable: false,
            });
    }

    private abortError(signal: AbortSignal): AiError {
        return signal.reason instanceof AiError
            ? signal.reason
            : new AiError('cancelled', 'The native CLI execution was cancelled.');
    }

    private async awaitCallbacks(callbacks: Promise<void>, signal: AbortSignal): Promise<void> {
        if (signal.aborted) return;

        let stop!: () => void;
        const cancelled = new Promise<void>((resolve) => {
            stop = resolve;
        });

        signal.addEventListener('abort', stop, { once: true });

        try {
            await Promise.race([callbacks, cancelled]);
        } finally {
            signal.removeEventListener('abort', stop);
        }
    }

    private async awaitProcessEvent(event: Promise<unknown>, timeoutMs: number): Promise<boolean> {
        let timer!: ReturnType<typeof setTimeout>;
        const expired = new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), timeoutMs);
        });

        try {
            return await Promise.race([event.then(() => true), expired]);
        } finally {
            clearTimeout(timer);
        }
    }

    private async terminateTree(
        pid: number,
        child: ChildProcess,
        closed: Promise<unknown>,
    ): Promise<void> {
        if (process.platform === 'win32') {
            const systemRoot = process.env['SystemRoot'] ?? process.env['SYSTEMROOT'];
            const taskkill = systemRoot ? join(systemRoot, 'System32', 'taskkill.exe') : undefined;
            const failures: unknown[] = [];
            let descendants = '';

            // WMI retains ParentProcessId after a parent exits; find surviving owned descendants as well.
            const command = `$ErrorActionPreference='Stop'; function children([int]$parentId) { Get-CimInstance Win32_Process -Filter "ParentProcessId=$parentId" | ForEach-Object { [int]$_.ProcessId; children ([int]$_.ProcessId) } }; children ${pid}`;

            try {
                if (!systemRoot)
                    throw new AiError('host', 'Windows system process tools are unavailable.');

                descendants = await runSystemTool(
                    join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
                    ['-NoProfile', '-NonInteractive', '-Command', command],
                    true,
                    (captured) => {
                        // Never interpret a truncated final numeric token as another owned PID.
                        descendants = captured.slice(0, captured.lastIndexOf('\n') + 1);
                    },
                );
            } catch (cause) {
                failures.push(cause);
            }

            const owned = new Set([pid]);

            for (const value of descendants.split(/\s+/u).filter(Boolean)) {
                const descendant = Number(value);

                if (
                    !/^\d{1,10}$/u.test(value) ||
                    !Number.isSafeInteger(descendant) ||
                    descendant < 1 ||
                    descendant > 0xffff_ffff
                ) {
                    failures.push(
                        new AiError(
                            'host',
                            'Windows process ownership inspection returned invalid data.',
                        ),
                    );

                    continue;
                }

                owned.add(descendant);
            }

            for (const target of owned) {
                try {
                    await this.terminateWindowsTarget(target, taskkill);
                } catch (cause) {
                    failures.push(cause);
                }
            }

            if (failures.length)
                throw new AiError(
                    'host',
                    'The native Windows process tree could not be fully terminated.',
                    {
                        cause: new AggregateError(failures),
                    },
                );

            return;
        }

        let inspectionFailure: unknown;
        const presence = (): GroupPresence => {
            try {
                process.kill(-pid, 0);

                return 'present';
            } catch (cause) {
                if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return 'absent';

                if ((cause as NodeJS.ErrnoException).code === 'EPERM') {
                    inspectionFailure = cause;

                    return 'unconfirmed';
                }

                throw cause;
            }
        };
        const signal = (value: 'SIGTERM' | 'SIGKILL', state: GroupPresence): void => {
            if (state === 'present') {
                try {
                    process.kill(-pid, value);

                    return;
                } catch (cause) {
                    if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return;

                    if ((cause as NodeJS.ErrnoException).code !== 'EPERM') throw cause;

                    inspectionFailure = cause;
                }
            }

            // An unconfirmed group never authorizes signalling another numeric PID or group.
            // ChildProcess retains the native handle of the process this run actually spawned.
            child.kill(value);
        };
        const awaitAbsence = async (timeoutMs: number): Promise<boolean> => {
            const deadline = performance.now() + timeoutMs;

            while (performance.now() < deadline) {
                if (presence() === 'absent') return true;

                await delay(Math.min(10, timeoutMs));
            }

            return presence() === 'absent';
        };

        signal('SIGTERM', presence());

        let absent = await awaitAbsence(this._grace);

        if (!absent) {
            signal('SIGKILL', presence());

            // A terminating Darwin group may temporarily report EPERM while its zombies are reaped.
            // Only ESRCH proves absence; persistent permission uncertainty remains a cleanup fault.
            absent = await awaitAbsence(1_000);
        }

        let rootClosed = await this.awaitProcessEvent(closed, 1_000);

        if (!rootClosed) {
            child.kill('SIGKILL');
            rootClosed = await this.awaitProcessEvent(closed, 1_000);
        }

        if (!absent || !rootClosed)
            throw new AiError('host', 'Native POSIX process cleanup could not be confirmed.', {
                cause: inspectionFailure,
            });
    }

    private async terminateWindowsTarget(pid: number, taskkill: string | undefined): Promise<void> {
        if (!this.processExists(pid)) return;

        let failure: unknown;

        try {
            if (!taskkill)
                throw new AiError('host', 'Windows system process tools are unavailable.');

            await runSystemTool(taskkill, ['/PID', String(pid), '/T', '/F']);
        } catch (cause) {
            // A process may exit between inspection and taskkill. Only proven absence is benign.
            if (!this.processExists(pid)) return;

            failure = cause;
        }

        if (!failure) {
            const deadline = Date.now() + Math.min(this._grace, 1_000);

            while (this.processExists(pid) && Date.now() < deadline) await delay(10);

            if (!this.processExists(pid)) return;

            failure = new AiError(
                'host',
                'A Windows process remained alive after taskkill completed.',
            );
        }

        try {
            process.kill(pid, 'SIGKILL');
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'ESRCH')
                failure = new AggregateError([failure, cause]);
        }

        const deadline = Date.now() + Math.min(this._grace, 1_000);

        while (this.processExists(pid) && Date.now() < deadline) await delay(10);

        throw new AiError('host', 'A Windows process required fallback termination.', {
            cause: failure,
        });
    }

    private processExists(pid: number): boolean {
        try {
            process.kill(pid, 0);

            return true;
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'ESRCH') return false;

            if ((cause as NodeJS.ErrnoException).code === 'EPERM') return true;

            throw new AiError('host', 'Native process liveness could not be verified.', { cause });
        }
    }

    // #endregion
}
