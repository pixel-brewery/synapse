// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChildProcess, spawn } from 'node:child_process';
import type * as ChildProcessModule from 'node:child_process';
import { PassThrough } from 'node:stream';
import { runSystemTool } from './runSystemTool.js';
import { AiError } from '@pixel-brewery/synapse-core';

// #endregion

vi.mock('node:child_process', async (loadOriginal) => {
    const actual = await loadOriginal<typeof ChildProcessModule>();

    return { ...actual, spawn: vi.fn(actual.spawn) };
});

afterEach(() => {
    vi.useRealTimers();
    vi.mocked(spawn).mockReset();
    vi.restoreAllMocks();
});

describe('runSystemTool', () => {
    it('returns bounded output only after a zero-status helper exit', async () => {
        // Arrange
        const helper = fixture();
        const captured: string[] = [];
        const pending = runSystemTool('owned-helper', [], true, (value) => captured.push(value));

        // Act
        helper.stdout?.emit('data', Buffer.from('123\r\n'));
        helper.emit('close', 0, null);

        // Assert
        await expect(pending).resolves.toBe('123\r\n');
        expect(captured).toEqual(['123\r\n']);
    });

    it('rejects unsuccessful exit status while retaining complete partial inspection output', async () => {
        // Arrange
        const helper = fixture();
        const captured: string[] = [];
        const pending = runSystemTool('owned-helper', [], true, (value) => captured.push(value));
        const rejected = expect(pending).rejects.toMatchObject({ code: 'host' });

        // Act
        helper.stdout?.emit('data', Buffer.from('123\r\n45'));
        helper.emit('close', 1, null);

        // Assert
        await rejected;
        expect(captured).toEqual(['123\r\n45']);
    });

    it('waits for helper closure after a launch error rather than releasing ownership immediately', async () => {
        // Arrange
        const helper = fixture();
        const underlying = new AiError('host', 'Synthetic helper failure.', {
            cleanupIncomplete: true,
            sessionUsable: false,
        });
        const pending = runSystemTool('owned-helper', []);
        let settled = false;

        void pending.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );

        const rejected = expect(pending).rejects.toMatchObject({ code: 'host', cause: underlying });

        // Act
        helper.emit('error', underlying);
        await Promise.resolve();

        // Assert
        expect(helper.kill).toHaveBeenCalledWith('SIGKILL');
        expect(settled).toBe(false);
        helper.emit('close', -1, null);
        await rejected;
    });

    it('kills an over-budget helper and waits for its close barrier before rejecting', async () => {
        // Arrange
        const helper = fixture();
        const pending = runSystemTool('owned-helper', [], true);
        const rejected = expect(pending).rejects.toMatchObject({
            code: 'host',
            message: 'Native process ownership inspection exceeded its budget.',
        });
        let settled = false;

        void pending.catch(() => {
            settled = true;
        });

        // Act
        helper.stdout?.emit('data', Buffer.alloc(64_001));
        await Promise.resolve();

        // Assert
        expect(helper.kill).toHaveBeenCalledWith('SIGKILL');
        expect(settled).toBe(false);
        helper.emit('close', null, 'SIGKILL');
        await rejected;
    });

    it('awaits forced helper closure after its execution timeout', async () => {
        // Arrange
        vi.useFakeTimers();

        const helper = fixture();
        const pending = runSystemTool('owned-helper', []);
        const rejected = expect(pending).rejects.toMatchObject({
            code: 'host',
            message: 'Native process cleanup timed out.',
        });
        let settled = false;

        void pending.catch(() => {
            settled = true;
        });

        // Act
        await vi.advanceTimersByTimeAsync(5_000);

        // Assert
        expect(helper.kill).toHaveBeenCalledWith('SIGKILL');
        expect(settled).toBe(false);
        helper.emit('close', null, 'SIGKILL');
        await rejected;
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reports terminal host failure if a signalled helper never closes', async () => {
        // Arrange
        vi.useFakeTimers();
        fixture();

        const pending = runSystemTool('owned-helper', []);
        const rejected = expect(pending).rejects.toMatchObject({
            code: 'host',
            message: 'A native cleanup helper did not exit after termination.',
        });

        // Act
        await vi.advanceTimersByTimeAsync(6_000);

        // Assert
        await rejected;
        expect(vi.getTimerCount()).toBe(0);
    });
});

function fixture(): ChildProcess {
    const helper = new ChildProcess();

    helper.stdout = new PassThrough();
    helper.kill = vi.fn(() => true);
    vi.mocked(spawn).mockReturnValueOnce(helper);

    return helper;
}
