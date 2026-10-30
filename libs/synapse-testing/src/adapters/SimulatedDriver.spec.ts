// #region Imports

import { AiError, type IAiExecutionContext } from '@pixel-brewery/synapse-core';
import { describe, expect, it } from 'vitest';
import { SimulatedDriver } from './SimulatedDriver.js';

// #endregion

function context(): IAiExecutionContext {
    return {
        instance: {
            id: 'i',
            driverId: 'simulated',
            profile: {
                id: 'p',
                applicationId: 'a',
                accountId: 'b',
                paths: {
                    root: '/owned',
                    home: '/owned/home',
                    configuration: '/owned/config',
                    credentials: '/owned/credentials',
                    execution: '/owned/execution',
                    temporary: '/owned/tmp',
                },
            },
        },
        request: {
            target: { instanceId: 'i' },
            prompt: 'synthetic',
            policy: { mode: 'read-only' },
        },
        workingDirectory: '/owned',
        signal: new AbortController().signal,
        emit: async () => undefined,
        session: (nativeId) => ({
            nativeId,
            driverId: 'simulated',
            instanceId: 'i',
            profileId: 'p',
            candidateId: 'i',
        }),
    };
}

describe('SimulatedDriver', () => {
    it('requires explicit execution before returning the supplied synthetic result', async () => {
        // Arrange
        const driver = new SimulatedDriver({ result: { text: 'Explicit fixture.' } });

        expect(driver.executionCount).toBe(0);

        // Act
        const result = await driver.execute(context());

        // Assert
        expect(result.text).toBe('Explicit fixture.');
        expect(driver.executionCount).toBe(1);
    });
    it('does not hide a host event failure behind synthetic success', async () => {
        // Arrange
        const failure = new AiError('persistence', 'Synthetic host failure.');
        const value = context();
        const driver = new SimulatedDriver({
            events: [{ type: 'text', text: 'partial' }],
            result: { text: 'complete' },
        });

        // Act
        const result = driver.execute({
            ...value,
            emit: async () => {
                throw failure;
            },
        });

        // Assert
        await expect(result).rejects.toBe(failure);
    });
});
