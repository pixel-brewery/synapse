// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { ChildProcess, spawn } from 'node:child_process';
import type * as ChildProcessModule from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeProcessRunner } from './NodeProcessRunner.js';

// #endregion

const owned: NodeProcessRunner[] = [];
const expectedCleanupFailures = new Set<NodeProcessRunner>();
const ownedDirectories: string[] = [];
const platforms: PropertyDescriptor[] = [];

vi.mock('node:child_process', async (loadOriginal) => {
    const actual = await loadOriginal<typeof ChildProcessModule>();

    return { ...actual, spawn: vi.fn(actual.spawn) };
});

const environment = (): Record<string, string> =>
    Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
const runner = (): NodeProcessRunner => {
    const value = new NodeProcessRunner({ terminationGraceMs: 50 });

    owned.push(value);

    return value;
};
const request = (code: string) => ({
    executable: process.execPath,
    args: ['-e', code],
    environment: environment(),
    workingDirectory: process.cwd(),
    timeoutMs: 5_000,
});

afterEach(async () => {
    try {
        await Promise.all(
            owned.splice(0).map(async (value) => {
                if (expectedCleanupFailures.delete(value)) {
                    await expect(value.dispose()).rejects.toMatchObject({
                        code: 'host',
                        cleanupIncomplete: true,
                    });
                } else await value.dispose();
            }),
        );
        await Promise.all(
            ownedDirectories.splice(0).map((value) => rm(value, { recursive: true, force: true })),
        );
    } finally {
        for (const platform of platforms.splice(0).toReversed())
            Object.defineProperty(process, 'platform', platform);

        vi.unstubAllEnvs();
        vi.mocked(spawn).mockReset();
        vi.restoreAllMocks();
    }
});

describe('NodeProcessRunner', () => {
    it.skipIf(process.platform === 'win32')(
        'retains failed Windows cleanup when disposal follows an already rejected run',
        async () => {
            // Arrange
            const execution = runner();

            expectedCleanupFailures.add(execution);

            const controller = new AbortController();
            let pid = 0;

            vi.mocked(spawn).mockImplementation((executable, args) => {
                const helper = helperProcess();

                queueMicrotask(() => {
                    if (String(executable).endsWith('powershell.exe')) {
                        helper.emit(
                            'error',
                            Object.assign(new Error('unavailable'), { code: 'ENOENT' }),
                        );
                        helper.emit('close', -1, null);
                    } else {
                        process.kill(-Number(args?.[1]), 'SIGKILL');
                        helper.emit('close', 0, null);
                    }
                });

                return helper;
            });

            const result = execution.run({
                ...request('process.stdout.write(String(process.pid));setInterval(()=>{},1000)'),
                signal: controller.signal,
                onStdout: async (chunk) => {
                    pid = Number(chunk.trim());
                    windowsBranch();
                    controller.abort();
                },
            });

            // Act / Assert
            try {
                const failure = await result.catch((cause: unknown) => cause);

                expect(failure).toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                    sessionUsable: false,
                    cause: { code: 'host' },
                });
                await expect(execution.dispose()).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                    sessionUsable: false,
                    cause: { errors: [failure] },
                });
                expect(
                    vi
                        .mocked(spawn)
                        .mock.calls.some(([file]) => String(file).endsWith('taskkill.exe')),
                ).toBe(true);
                expect(pid).toBeGreaterThan(0);
                expect(() => process.kill(pid, 0)).toThrow();
            } finally {
                killOwnedGroup(pid);
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'falls back to the owned root and rejects when taskkill fails against a live process',
        async () => {
            // Arrange
            const execution = runner();

            expectedCleanupFailures.add(execution);

            const controller = new AbortController();
            let pid = 0;

            vi.mocked(spawn).mockImplementation((executable) => {
                const helper = helperProcess();

                queueMicrotask(() =>
                    helper.emit(
                        'close',
                        String(executable).endsWith('powershell.exe') ? 0 : 1,
                        null,
                    ),
                );

                return helper;
            });

            const result = execution.run({
                ...request('process.stdout.write(String(process.pid));setInterval(()=>{},1000)'),
                signal: controller.signal,
                onStdout: async (chunk) => {
                    pid = Number(chunk.trim());
                    windowsBranch();
                    controller.abort();
                },
            });

            // Act / Assert
            try {
                await expect(result).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                    sessionUsable: false,
                });
                await expect(execution.dispose()).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                });
                expect(pid).toBeGreaterThan(0);
                expect(() => process.kill(pid, 0)).toThrow();
            } finally {
                killOwnedGroup(pid);
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'continues through every captured Windows descendant after an individual taskkill failure',
        async () => {
            // Arrange
            const execution = runner();

            expectedCleanupFailures.add(execution);

            const controller = new AbortController();
            let root = 0;
            let descendants: number[] = [];
            const terminated: number[] = [];

            vi.mocked(spawn).mockImplementation((executable, args) => {
                const helper = helperProcess();

                queueMicrotask(() => {
                    if (String(executable).endsWith('powershell.exe')) {
                        helper.stdout?.emit('data', Buffer.from(descendants.join('\n') + '\n'));
                        helper.emit('close', 0, null);
                    } else {
                        const pid = Number(args?.[1]);

                        terminated.push(pid);

                        if (pid === descendants[0]) helper.emit('close', 1, null);
                        else {
                            process.kill(pid, 'SIGKILL');
                            helper.emit('close', 0, null);
                        }
                    }
                });

                return helper;
            });

            const code =
                "const {spawn}=require('node:child_process');const children=[1,2].map(()=>spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}));process.stdout.write(JSON.stringify({root:process.pid,children:children.map(child=>child.pid)}));setInterval(()=>{},1000)";
            const result = execution.run({
                ...request(code),
                signal: controller.signal,
                onStdout: async (chunk) => {
                    const value: { root: number; children: number[] } = JSON.parse(chunk);

                    root = value.root;
                    descendants = value.children;
                    windowsBranch();
                    controller.abort();
                },
            });

            // Act / Assert
            try {
                await expect(result).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                    sessionUsable: false,
                });
                await expect(execution.dispose()).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                });
                expect(terminated).toEqual([root, ...descendants]);

                for (const pid of [root, ...descendants])
                    expect(() => process.kill(pid, 0)).toThrow();
            } finally {
                killOwnedGroup(root);
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'settles run and dispose with host errors when an undiscovered child keeps the closed barrier open',
        async () => {
            // Arrange
            const execution = runner();

            expectedCleanupFailures.add(execution);

            let root = 0;
            let descendant = 0;
            let disposal!: Promise<void>;
            let ready!: () => void;
            const started = new Promise<void>((resolve) => {
                ready = resolve;
            });

            vi.mocked(spawn).mockImplementation((executable) => {
                const helper = helperProcess();

                queueMicrotask(() => {
                    if (String(executable).endsWith('powershell.exe')) {
                        helper.emit(
                            'error',
                            Object.assign(new Error('missing'), { code: 'ENOENT' }),
                        );
                        helper.emit('close', -1, null);
                    } else helper.emit('close', 1, null);
                });

                return helper;
            });

            const code =
                "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});process.stdout.write(JSON.stringify({root:process.pid,child:child.pid}));setInterval(()=>{},1000)";
            const result = execution.run({
                ...request(code),
                onStdout: async (chunk) => {
                    const value: { root: number; child: number } = JSON.parse(chunk);

                    root = value.root;
                    descendant = value.child;
                    windowsBranch();
                    disposal = execution.dispose();
                    void disposal.catch(() => undefined);
                    ready();
                },
            });

            // Act
            try {
                await started;

                const outcomes = await Promise.allSettled([result, disposal]);

                // Assert
                for (const outcome of outcomes)
                    expect(outcome).toMatchObject({
                        status: 'rejected',
                        reason: { code: 'host', cleanupIncomplete: true, sessionUsable: false },
                    });

                const [runFailure, disposeFailure] = outcomes;

                if (runFailure?.status === 'rejected' && disposeFailure?.status === 'rejected') {
                    expect(disposeFailure.reason).toMatchObject({
                        cause: { errors: [runFailure.reason] },
                    });
                }

                expect(() => process.kill(root, 0)).toThrow();
                expect(() => process.kill(descendant, 0)).not.toThrow();
            } finally {
                killOwnedGroup(root);
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'accepts unsuccessful taskkill only after confirming that its target actually exited',
        async () => {
            // Arrange
            const execution = runner();
            const controller = new AbortController();
            let pid = 0;

            vi.mocked(spawn).mockImplementation((executable, args) => {
                const helper = helperProcess();

                queueMicrotask(() => {
                    if (String(executable).endsWith('powershell.exe'))
                        helper.emit('close', 0, null);
                    else {
                        process.kill(-Number(args?.[1]), 'SIGKILL');
                        setTimeout(() => helper.emit('close', 1, null), 20);
                    }
                });

                return helper;
            });

            const result = execution.run({
                ...request('process.stdout.write(String(process.pid));setInterval(()=>{},1000)'),
                signal: controller.signal,
                onStdout: async (chunk) => {
                    pid = Number(chunk.trim());
                    windowsBranch();
                    controller.abort();
                },
            });

            // Act / Assert
            try {
                await expect(result).rejects.toMatchObject({ code: 'cancelled' });
                expect(() => process.kill(pid, 0)).toThrow();
            } finally {
                killOwnedGroup(pid);
            }
        },
    );

    it.runIf(process.platform === 'win32')(
        'reaps a native Windows child retaining stdout after its root exits first',
        async () => {
            // Arrange
            let descendant = 0;
            const code =
                "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});process.stdout.write(String(child.pid)+'\\n');process.exit(0)";

            // Act
            try {
                const result = await runner().run({
                    ...request(code),
                    timeoutMs: 10_000,
                    onStdout: async (chunk) => {
                        descendant = Number(chunk.trim());
                    },
                });

                // Assert
                expect(result.exitCode).toBe(0);
                expect(descendant).toBeGreaterThan(0);
                expect(() => process.kill(descendant, 0)).toThrow();
            } finally {
                if (descendant > 0) {
                    try {
                        process.kill(descendant, 'SIGKILL');
                    } catch {
                        /* Already reaped. */
                    }
                }
            }
        },
    );

    it('cancels a pending callback for the final fragmented UTF-8 flush during disposal', async () => {
        // Arrange
        const execution = runner();
        let entered!: () => void;
        const started = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const result = execution.run({
            ...request('process.stdout.write(Buffer.from([0xe2]))'),
            onStdout: async () => {
                entered();
                await new Promise<void>(() => undefined);
            },
        });
        const cancelled = expect(result).rejects.toMatchObject({ code: 'cancelled' });

        await started;

        // Act
        await execution.dispose();

        // Assert
        await cancelled;
    });

    it('classifies final UTF-8 flush callback failures and rejects overflowing native timers', async () => {
        // Arrange
        const execution = runner();

        // Act / Assert
        await expect(
            execution.run({
                ...request('process.stdout.write(Buffer.from([0xe2]))'),
                onStdout: async () => {
                    throw new Error('private storage detail');
                },
            }),
        ).rejects.toMatchObject({
            code: 'host',
            message: 'A critical native stream callback failed.',
        });
        await expect(
            execution.run({ ...request('setInterval(()=>{},1000)'), timeoutMs: 3_000_000_000 }),
        ).rejects.toMatchObject({ code: 'configuration' });
    });

    it.runIf(process.platform === 'win32').each(['global', 'local'])(
        'runs a %s Windows command shim with literal special-character arguments',
        async (location) => {
            // Arrange
            const root = await mkdtemp(join(tmpdir(), 'synapse shim & '));

            ownedDirectories.push(root);

            const bin = location === 'local' ? join(root, 'node_modules', '.bin') : root;

            await mkdir(bin, { recursive: true });
            await writeFile(
                join(bin, 'fixture.cjs'),
                'process.stdout.write(JSON.stringify(process.argv.slice(2)));',
            );
            await writeFile(
                join(bin, 'synapse-fixture.CMD'),
                `@echo off\r\n"${process.execPath}" "%~dp0fixture.cjs" %*\r\n`,
            );

            const env = environment();
            const originalPath =
                Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';

            for (const key of Object.keys(env))
                if (['PATH', 'PATHEXT'].includes(key.toUpperCase())) delete env[key];

            env['Path'] = bin + delimiter + originalPath;
            env['PathExt'] = '.CMD;.EXE;.COM;.BAT';

            const args = [
                'a space',
                '&echo unexpected',
                '"quotes"',
                '^caret',
                '!bang',
                '%SYNAPSE_LITERAL%',
            ];

            // Act
            const result = await runner().run({
                executable: 'synapse-fixture',
                args,
                environment: env,
                workingDirectory: root,
                timeoutMs: 10_000,
            });

            // Assert
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual(args);
        },
    );

    it('preserves stdin and literal arguments without shell interpolation', async () => {
        // Arrange
        const execution = runner();
        const args = ['a space', '&echo unwanted', '%PATH%', '"quoted"', '^caret', '!bang'];

        // Act
        const result = await execution.run({
            ...request(
                "let value='';process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({args:process.argv.slice(1),value})))",
            ),
            args: [
                '-e',
                "let value='';process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({args:process.argv.slice(1),value})))",
                '--',
                ...args,
            ],
            input: 'private prompt with spaces\nand lines',
        });

        // Assert
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({
            args,
            value: 'private prompt with spaces\nand lines',
        });
    });

    it('decodes UTF-8 correctly across byte fragments', async () => {
        // Arrange
        const execution = runner();
        const chunks: string[] = [];

        // Act
        const result = await execution.run({
            ...request(
                "const bytes=Buffer.from('Grüße 🌊');for(let i=0;i<bytes.length;i++)setTimeout(()=>process.stdout.write(bytes.subarray(i,i+1)),i*2)",
            ),
            onStdout: async (value) => {
                chunks.push(value);
            },
        });

        // Assert
        expect(result.stdout).toBe('Grüße 🌊');
        expect(chunks.join('')).toBe(result.stdout);
    });

    it('aborts during startup and waits for the native process to exit', async () => {
        // Arrange
        const execution = runner();
        const controller = new AbortController();

        // Act
        const result = execution.run({
            ...request('setInterval(()=>{},1000)'),
            signal: controller.signal,
            onStart: () => controller.abort(),
        });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'cancelled' });
    });

    it.skipIf(process.platform === 'win32').each(['transient', 'persistent'] as const)(
        'requires confirmed absence after a %s startup group permission failure',
        async (kind) => {
            // Arrange
            const execution = runner();
            const controller = new AbortController();
            const nativeKill = process.kill.bind(process);
            const ownedHandleKill = vi.spyOn(ChildProcess.prototype, 'kill');
            let root = 0;
            let injected = false;

            if (kind === 'persistent') expectedCleanupFailures.add(execution);

            const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
                if (pid < 0 && signal === 0) {
                    root ||= -pid;

                    if (pid === -root && (kind === 'persistent' || !injected)) {
                        injected = true;

                        throw Object.assign(new Error('Synthetic group permission uncertainty.'), {
                            code: 'EPERM',
                        });
                    }
                }

                return nativeKill(pid, signal);
            });

            // Act
            try {
                const result = execution.run({
                    ...request('setInterval(()=>{},1000);setTimeout(()=>process.exit(0),10000)'),
                    signal: controller.signal,
                    onStart: () => controller.abort(),
                });

                // Assert
                if (kind === 'persistent') {
                    await expect(result).rejects.toMatchObject({
                        code: 'host',
                        cleanupIncomplete: true,
                        sessionUsable: false,
                    });
                    await expect(execution.dispose()).rejects.toMatchObject({
                        code: 'host',
                        cleanupIncomplete: true,
                    });
                    expect(
                        kill.mock.calls.filter(([pid, signal]) => pid < 0 && signal !== 0),
                    ).toEqual([]);
                } else {
                    await expect(result).rejects.toMatchObject({ code: 'cancelled' });
                }

                expect(injected).toBe(true);
                expect(root).toBeGreaterThan(0);
                expect(ownedHandleKill).toHaveBeenCalledWith('SIGTERM');
                expect(
                    ownedHandleKill.mock.contexts.every(
                        (child) => child instanceof ChildProcess && child.pid === root,
                    ),
                ).toBe(true);
                expect(() => nativeKill(root, 0)).toThrow();
            } finally {
                kill.mockRestore();
                ownedHandleKill.mockRestore();
                killOwnedGroup(root);
            }
        },
    );

    it('enforces combined output and elapsed time budgets', async () => {
        // Arrange
        const execution = runner();

        // Act / Assert
        await expect(
            execution.run({
                ...request("process.stdout.write('x'.repeat(20000))"),
                maxOutputBytes: 10,
            }),
        ).rejects.toMatchObject({ code: 'output-limit' });
        await expect(
            execution.run({ ...request('setInterval(()=>{},1000)'), timeoutMs: 30 }),
        ).rejects.toMatchObject({ code: 'timeout' });
    });

    it('preserves critical host failure classification while draining the process', async () => {
        // Arrange
        const execution = runner();
        const failure = new AiError('persistence', 'Storage failed.');

        // Act
        const result = execution.run({
            ...request("process.stdout.write('ready');setInterval(()=>{},1000)"),
            onStdout: async () => {
                throw failure;
            },
        });

        // Assert
        await expect(result).rejects.toBe(failure);
    });

    it.skipIf(process.platform === 'win32')(
        'awaits forced descendant termination after the root closes independent output streams',
        async () => {
            // Arrange
            const execution = runner();
            let root = 0;
            let descendant = 0;
            let output = '';

            // Act
            try {
                const result = await execution.run({
                    ...request(independentStreamsTree()),
                    onStdout: async (chunk) => {
                        output += chunk;

                        if (!output.includes('\n')) return;

                        const value: { root: number; child: number } = JSON.parse(output);

                        root = value.root;
                        descendant = value.child;
                    },
                });

                // Assert
                expect(result.exitCode).toBe(0);
                expect(root).toBeGreaterThan(0);
                expect(descendant).toBeGreaterThan(0);
                expect(() => process.kill(root, 0)).toThrow();
                expect(() => process.kill(descendant, 0)).toThrow();
                expect(() => process.kill(-root, 0)).toThrow();
            } finally {
                killOwnedGroup(root);
            }
        },
    );

    it.skipIf(process.platform === 'win32')(
        'retains incomplete POSIX cleanup when group absence cannot be confirmed after SIGKILL',
        async () => {
            // Arrange
            const execution = runner();
            const controller = new AbortController();
            const nativeKill = process.kill.bind(process);
            let root = 0;
            let forced = false;

            expectedCleanupFailures.add(execution);

            const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
                if (pid === -root && signal === 0 && forced) return true;

                const result = nativeKill(pid, signal);

                if (pid === -root && signal === 'SIGKILL') forced = true;

                return result;
            });

            // Act
            try {
                const result = execution.run({
                    ...request(
                        "process.on('SIGTERM',()=>{});process.stdout.write(String(process.pid));setInterval(()=>{},1000)",
                    ),
                    signal: controller.signal,
                    onStdout: async (chunk) => {
                        root = Number(chunk.trim());
                        controller.abort();
                    },
                });

                // Assert
                await expect(result).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                    sessionUsable: false,
                });
                await expect(execution.dispose()).rejects.toMatchObject({
                    code: 'host',
                    cleanupIncomplete: true,
                });
                expect(forced).toBe(true);
                expect(root).toBeGreaterThan(0);
                expect(() => nativeKill(root, 0)).toThrow();
            } finally {
                kill.mockRestore();
                killOwnedGroup(root);
            }
        },
    );

    it('ends owned descendants that ignore graceful cancellation', async () => {
        // Arrange
        const execution = runner();
        const controller = new AbortController();
        let descendant = 0;
        let ready!: () => void;
        const started = new Promise<void>((resolve) => {
            ready = resolve;
        });
        const code =
            "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)\"],{stdio:'inherit'});process.stdout.write(String(child.pid)+'\\n');setInterval(()=>{},1000)";
        const result = execution.run({
            ...request(code),
            signal: controller.signal,
            onStdout: async (chunk) => {
                descendant = Number(chunk.trim());
                ready();
            },
        });
        const rejected = expect(result).rejects.toMatchObject({ code: 'cancelled' });

        await started;

        // Act
        controller.abort();

        // Assert
        await rejected;
        expect(descendant).toBeGreaterThan(0);
        expect(() => process.kill(descendant, 0)).toThrow();
    });
});

function independentStreamsTree(): string {
    const child = [
        "process.on('SIGTERM',()=>{});",
        'setInterval(()=>{},1000);',
        'setTimeout(()=>process.exit(0),10000);',
        "process.send('ready');",
    ].join('');

    return [
        "const {spawn}=require('node:child_process');",
        `const child=spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:['ignore','ignore','ignore','ipc']});`,
        "child.once('message',()=>process.stdout.write(JSON.stringify({root:process.pid,child:child.pid})+'\\n',()=>process.exit(0)));",
    ].join('');
}

function helperProcess(): ChildProcess {
    const helper = new ChildProcess();

    helper.stdout = new PassThrough();
    helper.kill = vi.fn(() => true);

    return helper;
}

function windowsBranch(): void {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');

    if (!descriptor) throw new Error('Native platform descriptor is unavailable.');

    platforms.push(descriptor);
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' });
    vi.stubEnv('SystemRoot', '/synthetic-system');
}

function killOwnedGroup(pid: number): void {
    if (pid < 1) return;

    try {
        process.kill(-pid, 'SIGKILL');
    } catch {
        /* Already reaped. */
    }
}
