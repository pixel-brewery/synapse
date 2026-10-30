// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { ProfileAccessCoordinator } from './ProfileAccessCoordinator.js';
import { AiError, isCleanupIncomplete } from '@pixel-brewery/synapse-core';

// #endregion

describe('ProfileAccessCoordinator', () => {
    it('retains the cleanup fault and cancels remaining leases when another callback throws', () => {
        // Arrange
        const access = new ProfileAccessCoordinator(10);
        const cleanup = new AiError('host', 'Synthetic unconfirmed cleanup.', {
            cleanupIncomplete: true,
        });
        const releaseFirst = access.enter('one', () => undefined);
        const abortFaulty = vi.fn(() => {
            throw new Error('Synthetic cancellation failure.');
        });
        const releaseFaulty = access.enter('one', abortFaulty);
        const abortLast = vi.fn(() => releaseLast());
        const releaseLast = access.enter('one', abortLast);

        // Act
        releaseFirst(cleanup);

        // Assert
        expect(abortFaulty).toHaveBeenCalledOnce();
        expect(abortLast).toHaveBeenCalledOnce();
        releaseFaulty();
        expect(() => access.enter('one', () => undefined)).toThrow(
            expect.objectContaining({ code: 'host', cleanupIncomplete: true, cause: cleanup }),
        );
    });

    it('still drains every lease and quarantines uncertainty when one cancellation callback throws', async () => {
        // Arrange
        const access = new ProfileAccessCoordinator(10);
        const abortOther = vi.fn();
        const releaseFirst = access.enter('one', () => {
            throw new Error('Synthetic cancellation failure.');
        });
        const releaseOther = access.enter('one', () => {
            abortOther();
            releaseOther();
        });
        const change = vi.fn(async () => undefined);

        // Act
        const transition = access.exclusive('one', change);

        // Assert
        await expect(transition).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });
        expect(abortOther).toHaveBeenCalledOnce();
        expect(change).not.toHaveBeenCalled();
        releaseFirst();
        expect(() => access.enter('one', () => undefined)).toThrow('termination is unconfirmed');
        await expect(access.exclusive('one', change)).rejects.toMatchObject({
            cleanupIncomplete: true,
        });
    });

    it('rejects a failed cancellation without mutating credentials after all leases confirmed cleanup', async () => {
        // Arrange
        const access = new ProfileAccessCoordinator(10);
        const release = access.enter('one', () => {
            release();

            throw new Error('Synthetic post-cleanup cancellation failure.');
        });
        const change = vi.fn(async () => undefined);

        // Act
        const failure = await access.exclusive('one', change).catch((error: unknown) => error);

        // Assert
        expect(failure).toMatchObject({ code: 'host' });
        expect(isCleanupIncomplete(failure)).toBe(false);
        expect(change).not.toHaveBeenCalled();
        access.enter('one', () => undefined)();
    });

    it.each([false, true])(
        'keeps a timed-out drain blocked even when the credential transition is cancelled: %s',
        async (cancelled) => {
            // Arrange
            const access = new ProfileAccessCoordinator(10);
            const abort = vi.fn();
            const change = vi.fn(async () => undefined);
            const controller = new AbortController();
            const profile = {
                id: 'stalled',
                applicationId: 'tests',
                accountId: 'stalled',
                paths: {
                    root: '/unused',
                    home: '/unused/home',
                    configuration: '/unused/config',
                    credentials: '/unused/credentials',
                    execution: '/unused/execution',
                    temporary: '/unused/tmp',
                },
            };

            access.enter(profile.id, abort);

            // Act
            const transition = access.exclusive(profile.id, change, controller.signal);

            await Promise.resolve();

            if (cancelled) controller.abort();

            // Assert
            await expect(transition).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
            });
            expect(abort).toHaveBeenCalled();
            expect(change).not.toHaveBeenCalled();
            expect(() => access.enter(profile.id, () => undefined)).toThrow(
                'termination is unconfirmed',
            );
            await expect(access.credentialChange(profile, change)).rejects.toMatchObject({
                code: 'host',
                cleanupIncomplete: true,
            });
            expect(change).not.toHaveBeenCalled();
            access.enter('another', () => undefined)();
        },
    );

    it('blocks credential mutation and later admission when an aborted lease cannot confirm process termination', async () => {
        // Arrange
        const access = new ProfileAccessCoordinator();
        const cleanup = new AiError('host', 'Process termination unconfirmed.', {
            cleanupIncomplete: true,
        });
        const release: (error?: unknown) => void = access.enter('one', () => release(cleanup));
        const change = vi.fn(async () => undefined);
        const profile = {
            id: 'one',
            applicationId: 'tests',
            accountId: 'one',
            paths: {
                root: '/unused',
                home: '/unused/home',
                configuration: '/unused/config',
                credentials: '/unused/credentials',
                execution: '/unused/execution',
                temporary: '/unused/tmp',
            },
        };

        // Act
        const transition = access.credentialChange(profile, change);

        // Assert
        await expect(transition).rejects.toMatchObject({ code: 'host', cleanupIncomplete: true });
        expect(change).not.toHaveBeenCalled();
        expect(() => access.enter('one', () => undefined)).toThrow('termination is unconfirmed');
        await expect(access.credentialChange(profile, change)).rejects.toMatchObject({
            cleanupIncomplete: true,
        });

        const other = access.enter('another', () => undefined);

        other();
        expect(change).not.toHaveBeenCalled();
    });

    it('blocks new work and waits for aborted execution cleanup before changing credentials', async () => {
        // Arrange
        const access = new ProfileAccessCoordinator();
        const abort = vi.fn();
        const release = access.enter('one', abort);
        const change = vi.fn(async () => 'changed');

        // Act
        const transition = access.exclusive('one', change);

        await Promise.resolve();

        // Assert
        expect(abort).toHaveBeenCalledOnce();
        expect(change).not.toHaveBeenCalled();
        expect(() => access.enter('one', () => undefined)).toThrow('Authentication is changing');

        const releaseOther = access.enter('other', () => undefined);

        releaseOther();
        release();
        await expect(transition).resolves.toBe('changed');
        access.enter('one', () => undefined)();
    });

    it('rejects a cancelled queued transition without running its credential mutation', async () => {
        // Arrange
        const access = new ProfileAccessCoordinator();
        let finish!: () => void;
        const first = access.exclusive(
            'one',
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );

        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));

        const controller = new AbortController();
        const change = vi.fn(async () => undefined);
        const second = access.exclusive('one', change, controller.signal);
        const rejected = expect(second).rejects.toMatchObject({ code: 'cancelled' });

        // Act
        controller.abort();
        finish();
        await first;

        // Assert
        await rejected;
        expect(change).not.toHaveBeenCalled();
        access.enter('one', () => undefined)();
    });
});
