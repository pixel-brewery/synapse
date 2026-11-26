// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';

// #endregion

const context = {
    repositoryId: 1439526639,
    repository: 'pixel-brewery/synapse',
    defaultBranch: 'main',
};
const metadata = {
    id: 1439526639,
    name: 'synapse',
    full_name: context.repository,
    default_branch: context.defaultBranch,
    fork: false,
};

describe('Dependabot repository identity', () => {
    it.each(['contributor-owner/synapse', 'pixel-brewery/synapse'])(
        'follows the same immutable repository through an owner transfer: %s',
        async (repository) => {
            // arrange
            const request = vi.fn(async () => ({ ...metadata, full_name: repository }));

            // act
            const result = await resolveDependabotRepository({ ...context, repository }, request);

            // assert
            expect(result).toEqual({
                id: 1439526639,
                fullName: repository,
                path: `repos/${repository}`,
                defaultBranch: 'main',
            });
            expect(request).toHaveBeenCalledExactlyOnceWith('GET', 'repositories/1439526639');
        },
    );

    it('binds the actual default branch without assuming the branch name', async () => {
        // arrange
        const request = vi.fn(async () => ({ ...metadata, default_branch: 'trunk' }));

        // act
        const result = await resolveDependabotRepository(
            { ...context, repositoryId: '1439526639', defaultBranch: 'trunk' },
            request,
        );

        // assert
        expect(result?.defaultBranch).toBe('trunk');
    });

    it.each([
        { repositoryId: 1326609527 },
        { repositoryId: 1440122209 },
        { repositoryId: '01439526639' },
        { repository: 'pixel-brewery/another-repository' },
        { repository: 'https://github.com/pixel-brewery/synapse' },
        { defaultBranch: 'main\nmalicious=value' },
        { defaultBranch: '../main' },
        { defaultBranch: 123 },
    ])(
        'rejects foreign or malformed event identity before an API request: %j',
        async (override) => {
            // arrange
            const request = vi.fn();

            // act
            const result = await resolveDependabotRepository({ ...context, ...override }, request);

            // assert
            expect(result).toBeUndefined();
            expect(request).not.toHaveBeenCalled();
        },
    );

    it.each([
        { id: 1326609527 },
        { id: 1440122209 },
        { fork: true },
        { name: 'synapse-private-backup' },
        { full_name: 'another-owner/synapse' },
        { default_branch: 'trunk' },
    ])('rejects an API identity that no longer matches the trusted event: %j', async (override) => {
        // arrange
        const request = vi.fn(async () => ({ ...metadata, ...override }));

        // act
        const result = await resolveDependabotRepository(context, request);

        // assert
        expect(result).toBeUndefined();
        expect(request).toHaveBeenCalledTimes(1);
    });
});
