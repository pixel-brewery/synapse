// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { JsonLineDecoder, type IProcessRequest } from '@pixel-brewery/synapse-runtime';
import { describe, expect, it } from 'vitest';
import { ReplayProcessRunner } from './ReplayProcessRunner.js';

// #endregion

const request: IProcessRequest = {
    executable: 'fixture-agent',
    args: ['exec'],
    workingDirectory: process.cwd(),
    environment: {},
};

describe('ReplayProcessRunner', () => {
    it('preserves external fragmentation through a real JSON decoder', async () => {
        // Arrange
        const decoded: unknown[] = [];
        const decoder = new JsonLineDecoder(async (value) => {
            decoded.push(value);
        });
        const runner = new ReplayProcessRunner([
            { stdout: ['{"ty', 'pe":"text","text":"hello"}', '\n'] },
        ]);

        // Act
        const result = await runner.run({ ...request, onStdout: (chunk) => decoder.push(chunk) });

        await decoder.finish();

        // Assert
        expect(decoded).toEqual([{ type: 'text', text: 'hello' }]);
        expect(result.exitCode).toBe(0);
        expect(runner.executionCount).toBe(1);
    });
    it('enforces a combined UTF-8 byte limit across output streams', async () => {
        // Arrange
        const runner = new ReplayProcessRunner([{ stdout: ['ä'], stderr: ['x'] }]);

        // Act
        const result = runner.run({ ...request, maxOutputBytes: 2 });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'output-limit' });
    });
    it('preserves a host callback error rather than inventing a provider failure', async () => {
        // Arrange
        const failure = new AiError('persistence', 'Fixture host failed.');
        const runner = new ReplayProcessRunner([{ stdout: ['frame'] }]);

        // Act
        const result = runner.run({
            ...request,
            onStdout: () => {
                throw failure;
            },
        });

        // Assert
        await expect(result).rejects.toBe(failure);
    });
    it('rejects a script invoked with the wrong native arguments', async () => {
        // Arrange
        const runner = new ReplayProcessRunner([{ executable: 'fixture-agent', args: ['login'] }]);

        // Act
        const result = runner.run(request);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'protocol' });
    });
    it('drains an invocation waiting for external stop when disposed', async () => {
        // Arrange
        const runner = new ReplayProcessRunner([{ waitForStop: true }]);
        const pending = runner.run(request);

        // Act
        await runner.dispose();

        // Assert
        await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
        await expect(runner.run(request)).rejects.toMatchObject({ code: 'disposed' });
    });
    it('stops intentionally without converting native completion into caller cancellation', async () => {
        // Arrange
        const runner = new ReplayProcessRunner([{ waitForStop: true }]);

        // Act
        const result = await runner.run({
            ...request,
            onStart: (control) => {
                void control.stop();
            },
        });

        // Assert
        expect(result).toMatchObject({ exitCode: null, signal: 'SIGTERM' });
    });
});
