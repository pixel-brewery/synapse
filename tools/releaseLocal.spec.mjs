// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { releaseLocal } from './releaseLocal.mjs';

// #endregion

function controlled(options = {}) {
    const calls = [];
    let remoteReads = 0;
    const execute = vi.fn((command, arguments_) => {
        const step = `${command} ${arguments_.join(' ')}`;

        calls.push(step);

        if (options.fail === step) throw new Error('Controlled command failure.');

        if (step === 'git branch --show-current') return options.branch ?? 'main';

        if (step === 'git status --porcelain') return options.dirty ? '?? personal.txt' : '';

        if (step === 'git rev-parse --abbrev-ref --symbolic-full-name @{upstream}')
            return options.upstream ?? 'origin/main';

        if (step === 'git rev-parse HEAD') return options.ahead ? 'local-main' : 'original-main';

        if (step === 'git merge-base HEAD origin/main')
            return options.diverged ? 'common-base' : 'original-main';

        if (step === 'git rev-parse origin/main') {
            remoteReads++;

            return options.behind || (options.remoteMoved && remoteReads > 1)
                ? 'newer-main'
                : 'original-main';
        }

        if (step === 'git tag --list v[0-9]*') return options.tags ?? 'v0.1.0';

        if (step === `git tag --list v${options.version ?? '0.1.1'}`)
            return options.existingTag ? `v${options.version ?? '0.1.1'}` : '';

        if (step === 'git diff --name-only -z --no-renames HEAD')
            return (
                options.changed ??
                'libs/synapse-core/package.json\0yarn.lock\0CHANGELOG.md\0.docs/api/index.json\0'
            );

        if (step === 'git ls-files --others --exclude-standard -z') return options.untracked ?? '';

        if (step.startsWith('git ls-remote --tags')) return options.remoteTag ? 'existing-tag' : '';

        return '';
    });
    const client = {
        release: vi.fn(async () => {
            calls.push('nx release');

            return { workspaceVersion: options.version ?? '0.1.1' };
        }),
    };
    const createClient = vi.fn(async () => client);
    const readConfiguration = vi.fn(() => ({
        release: { git: { commitMessage: 'chore(release): publish {version} [skip ci]' } },
    }));
    const write = vi.fn();

    return { execute, client, createClient, readConfiguration, write, calls };
}

describe('local release', () => {
    it.each([
        ['patch', 'minor'],
        ['--dry-run', '--dry-run'],
        ['--dry-run=false'],
        ['1.2.3'],
        ['patch', '--unknown'],
        ['--help'],
    ])(
        'rejects unsupported arguments before commands or Nx initialization: %s',
        async (...arguments_) => {
            // Arrange
            const dependencies = controlled();

            // Act
            const result = releaseLocal(arguments_, dependencies);

            // Assert
            await expect(result).rejects.toThrow('Usage:');
            expect(dependencies.execute).not.toHaveBeenCalled();
            expect(dependencies.createClient).not.toHaveBeenCalled();
            expect(dependencies.readConfiguration).not.toHaveBeenCalled();
        },
    );

    it('previews through native Nx after reading local tags without fetching, mutation or publication', async () => {
        // Arrange
        const dependencies = controlled({ dirty: true });

        // Act
        const result = await releaseLocal(['minor', '--dry-run'], dependencies);

        // Assert
        expect(result).toEqual({ version: '0.1.1', dryRun: true });
        expect(dependencies.calls).toEqual(['git tag --list v[0-9]*', 'nx release']);
        expect(dependencies.execute).toHaveBeenCalledExactlyOnceWith('git', [
            'tag',
            '--list',
            'v[0-9]*',
        ]);
        expect(dependencies.readConfiguration).not.toHaveBeenCalled();
        expect(dependencies.createClient).toHaveBeenCalledWith(
            expect.objectContaining({
                git: { commit: false, tag: false, push: false, stageChanges: false },
            }),
        );
        expect(dependencies.createClient.mock.calls[0][0]).not.toHaveProperty('version');
        expect(dependencies.client.release).toHaveBeenCalledExactlyOnceWith({
            specifier: 'minor',
            dryRun: true,
            firstRelease: false,
            groups: ['synapse'],
            yes: true,
            skipPublish: true,
        });
        expect(dependencies.write).toHaveBeenCalledWith(
            expect.stringContaining('None of those steps ran.'),
        );
    });

    it.each([
        { specifier: 'patch', version: '0.0.3' },
        { specifier: 'minor', version: '0.1.0' },
        { specifier: 'major', version: '1.0.0' },
    ])(
        'delegates a $specifier increment without existing tags to Nx using the disk version',
        async ({ specifier, version }) => {
            // Arrange
            const dependencies = controlled({ tags: '', version });

            // Act
            const result = await releaseLocal([specifier, '--dry-run'], dependencies);

            // Assert
            expect(result).toEqual({ version, dryRun: true });
            expect(dependencies.createClient).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    version: {
                        currentVersionResolver: 'disk',
                    },
                }),
            );
            expect(dependencies.client.release).toHaveBeenCalledExactlyOnceWith({
                specifier,
                dryRun: true,
                firstRelease: true,
                groups: ['synapse'],
                yes: true,
                skipPublish: true,
            });
            expect(dependencies.calls).toEqual(['git tag --list v[0-9]*', 'nx release']);
            expect(dependencies.readConfiguration).not.toHaveBeenCalled();
        },
    );

    it('treats prerelease, build-metadata and malformed tags as a fresh stable release history', async () => {
        // Arrange
        const dependencies = controlled({
            tags: 'v0.0.2-rc.1\nv0.0.2+build.1\nv01.2.3\nv0.0',
        });

        // Act
        await releaseLocal(['patch', '--dry-run'], dependencies);

        // Assert
        expect(dependencies.createClient).toHaveBeenCalledWith(
            expect.objectContaining({
                version: expect.objectContaining({ currentVersionResolver: 'disk' }),
            }),
        );
        expect(dependencies.client.release).toHaveBeenCalledWith(
            expect.objectContaining({ firstRelease: true, specifier: 'patch' }),
        );
    });

    it('keeps configured tag-based resolution when any valid stable family tag exists', async () => {
        // Arrange
        const dependencies = controlled({ tags: 'v0.0.2-rc.1\r\nv0.0.2\r\nv01.2.3' });

        // Act
        await releaseLocal(['major', '--dry-run'], dependencies);

        // Assert
        expect(dependencies.createClient.mock.calls[0][0]).not.toHaveProperty('version');
        expect(dependencies.client.release).toHaveBeenCalledWith(
            expect.objectContaining({ firstRelease: false, specifier: 'major' }),
        );
    });

    it('stops before Nx initialization when local tag inspection fails', async () => {
        // Arrange
        const dependencies = controlled({ fail: 'git tag --list v[0-9]*' });

        // Act
        const result = releaseLocal(['--dry-run'], dependencies);

        // Assert
        await expect(result).rejects.toThrow('Controlled command failure.');
        expect(dependencies.calls).toEqual(['git tag --list v[0-9]*']);
        expect(dependencies.createClient).not.toHaveBeenCalled();
    });

    it('detects a real release without existing tags only after validating current main', async () => {
        // Arrange
        const dependencies = controlled({ tags: '' });

        // Act
        await releaseLocal(['patch'], dependencies);

        // Assert
        const tagRead = dependencies.calls.indexOf('git tag --list v[0-9]*');

        expect(tagRead).toBeGreaterThan(dependencies.calls.indexOf('git fetch origin main --tags'));
        expect(tagRead).toBeGreaterThan(
            dependencies.calls.indexOf('git merge-base HEAD origin/main'),
        );
        expect(tagRead).toBeLessThan(dependencies.calls.indexOf('nx release'));
        expect(dependencies.client.release).toHaveBeenCalledWith(
            expect.objectContaining({ firstRelease: true, specifier: 'patch', dryRun: false }),
        );
        expect(dependencies.calls).toContain('yarn verify');
        expect(dependencies.calls).toContain('yarn packaging:verify');
    });

    it.each([
        { branch: 'feature' },
        { dirty: true },
        { upstream: 'fork/main' },
        { behind: true },
        { diverged: true },
    ])('refuses unsafe main state before Nx prepares files: %j', async (options) => {
        // Arrange
        const dependencies = controlled(options);

        // Act
        const result = releaseLocal(['patch'], dependencies);

        // Assert
        await expect(result).rejects.toThrow();
        expect(dependencies.createClient).not.toHaveBeenCalled();
        expect(dependencies.calls.some((step) => step.startsWith('yarn '))).toBe(false);
    });

    it('verifies the candidate before a single commit/tag and atomic push, then delegates publication and verification', async () => {
        // Arrange
        const dependencies = controlled({
            untracked: '.docs/packages/synapse-core/api/new-reference.md\0',
        });

        // Act
        const result = await releaseLocal(['patch'], dependencies);

        // Assert
        expect(result).toEqual({ version: '0.1.1', dryRun: false });
        expect(
            dependencies.calls.filter(
                (step) =>
                    step === 'nx release' ||
                    step.startsWith('yarn ') ||
                    /^git (?:add|commit|tag --annotate|push)/u.test(step),
            ),
        ).toEqual([
            'nx release',
            'yarn docs',
            'yarn prettier --write CHANGELOG.md',
            'yarn verify',
            'yarn packaging:verify',
            'git add -- libs/synapse-core/package.json yarn.lock CHANGELOG.md .docs/api/index.json .docs/packages/synapse-core/api/new-reference.md',
            'git commit -m chore(release): publish 0.1.1 [skip ci]',
            'git tag --annotate v0.1.1 --message v0.1.1',
            'git push --atomic origin HEAD:refs/heads/main refs/tags/v0.1.1',
            'yarn release:publish',
            'yarn release:verify',
        ]);
        expect(dependencies.client.release).toHaveBeenCalledTimes(1);
    });

    it('releases committed local changes ahead of origin main in the same atomic push', async () => {
        // Arrange
        const dependencies = controlled({ ahead: true });

        // Act
        const result = await releaseLocal(['patch'], dependencies);

        // Assert
        expect(result.dryRun).toBe(false);
        expect(dependencies.calls).toContain('git merge-base HEAD origin/main');
        expect(dependencies.calls).toContain(
            'git push --atomic origin HEAD:refs/heads/main refs/tags/v0.1.1',
        );
        expect(dependencies.calls).toContain('yarn release:publish');
    });

    it.each([
        { tags: '', ahead: false },
        { tags: 'v0.1.0', ahead: false },
        { tags: '', ahead: true },
        { tags: 'v0.1.0', ahead: true },
    ])(
        'creates one CI-skipping release commit and tag after verifying unchanged source: %j',
        async (options) => {
            // Arrange
            const dependencies = controlled({ changed: '', ...options });

            // Act
            const result = await releaseLocal(['patch'], dependencies);

            // Assert
            expect(result).toEqual({ version: '0.1.1', dryRun: false });
            expect(
                dependencies.calls.filter(
                    (step) =>
                        step === 'nx release' ||
                        step.startsWith('yarn ') ||
                        /^git (?:add|commit|tag --annotate|push)/u.test(step),
                ),
            ).toEqual([
                'nx release',
                'yarn docs',
                'yarn prettier --write CHANGELOG.md',
                'yarn verify',
                'yarn packaging:verify',
                'git commit --allow-empty -m chore(release): publish 0.1.1 [skip ci]',
                'git tag --annotate v0.1.1 --message v0.1.1',
                'git push --atomic origin HEAD:refs/heads/main refs/tags/v0.1.1',
                'yarn release:publish',
                'yarn release:verify',
            ]);
            expect(dependencies.readConfiguration).toHaveBeenCalledTimes(1);
            expect(dependencies.client.release).toHaveBeenCalledTimes(1);
        },
    );

    it('refuses an unchanged local release without a CI-skipping commit message', async () => {
        // Arrange
        const dependencies = controlled({ changed: '', ahead: true });

        dependencies.readConfiguration.mockReturnValue({
            release: { git: { commitMessage: 'chore(release): publish {version}' } },
        });

        // Act
        const result = releaseLocal(['patch'], dependencies);

        // Assert
        await expect(result).rejects.toThrow('[skip ci]');
        expect(dependencies.calls).toContain('yarn verify');
        expect(dependencies.calls).toContain('yarn packaging:verify');
        expect(
            dependencies.calls.some((step) =>
                /^git (?:add|commit|tag --annotate|push)/u.test(step),
            ),
        ).toBe(false);
        expect(dependencies.calls).not.toContain('yarn release:publish');
    });

    it.each(['yarn verify', 'yarn packaging:verify'])(
        'does not commit, tag, push or publish after a failed candidate check: %s',
        async (fail) => {
            // Arrange
            const dependencies = controlled({ fail });

            // Act
            const result = releaseLocal(['patch'], dependencies);

            // Assert
            await expect(result).rejects.toThrow('Controlled command failure.');
            expect(
                dependencies.calls.some((step) =>
                    /^git (?:add|commit|tag --annotate|push)/u.test(step),
                ),
            ).toBe(false);
            expect(dependencies.calls).not.toContain('yarn release:publish');
        },
    );

    it.each(['yarn verify', 'yarn packaging:verify'])(
        'does not tag or publish an unchanged release after a failed candidate check: %s',
        async (fail) => {
            // Arrange
            const dependencies = controlled({ changed: '', fail });

            // Act
            const result = releaseLocal(['patch'], dependencies);

            // Assert
            await expect(result).rejects.toThrow('Controlled command failure.');
            expect(
                dependencies.calls.some((step) =>
                    /^git (?:add|commit|tag --annotate|push)/u.test(step),
                ),
            ).toBe(false);
            expect(dependencies.calls).not.toContain('yarn release:publish');
        },
    );

    it.each([
        { changed: 'libs/synapse-core/src/index.ts\0' },
        { untracked: 'personal.txt\0' },
        { changed: '', untracked: 'personal.txt\0' },
        { existingTag: true },
        { changed: '', existingTag: true },
    ])(
        'retains unexpected or already prepared state without staging or committing it: %j',
        async (options) => {
            // Arrange
            const dependencies = controlled(options);

            // Act
            const result = releaseLocal(['patch'], dependencies);

            // Assert
            await expect(result).rejects.toThrow();
            expect(
                dependencies.calls.some((step) =>
                    /^git (?:add|commit|tag --annotate|push)/u.test(step),
                ),
            ).toBe(false);
            expect(dependencies.calls).not.toContain('yarn release:publish');
        },
    );

    it.each([
        { remoteMoved: true },
        { remoteTag: true },
        { changed: '', remoteMoved: true },
        { changed: '', remoteTag: true },
    ])('refuses a remote race before pushing or publishing: %j', async (options) => {
        // Arrange
        const dependencies = controlled(options);

        // Act
        const result = releaseLocal(['patch'], dependencies);

        // Assert
        await expect(result).rejects.toThrow();
        expect(dependencies.calls.some((step) => step.startsWith('git push'))).toBe(false);
        expect(dependencies.calls).not.toContain('yarn release:publish');
        expect(dependencies.client.release).toHaveBeenCalledTimes(1);
    });

    it('stops at a failed atomic push without publishing, changing the version again or rolling back', async () => {
        // Arrange
        const dependencies = controlled({
            fail: 'git push --atomic origin HEAD:refs/heads/main refs/tags/v0.1.1',
        });

        // Act
        const result = releaseLocal(['patch'], dependencies);

        // Assert
        await expect(result).rejects.toThrow('Controlled command failure.');
        expect(dependencies.calls).not.toContain('yarn release:publish');
        expect(dependencies.calls).not.toContain('yarn release:verify');
        expect(dependencies.client.release).toHaveBeenCalledTimes(1);
        expect(
            dependencies.calls.some((step) => /git (?:reset|checkout|tag --delete)/u.test(step)),
        ).toBe(false);
    });

    it('stops after a failed publication and leaves the existing tag available for recovery', async () => {
        // Arrange
        const dependencies = controlled({ fail: 'yarn release:publish' });

        // Act
        const result = releaseLocal(['patch'], dependencies);

        // Assert
        await expect(result).rejects.toThrow('Controlled command failure.');
        expect(dependencies.calls).not.toContain('yarn release:verify');
        expect(dependencies.client.release).toHaveBeenCalledTimes(1);
    });
});
