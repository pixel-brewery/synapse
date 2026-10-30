// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    mkdir,
    mkdtemp,
    open,
    readFile,
    readdir,
    realpath,
    rm,
    stat,
    writeFile,
    symlink,
} from 'node:fs/promises';
import type * as FileSystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProfileManager } from './ProfileManager.js';

// #endregion

const directories: string[] = [];

vi.mock('node:fs/promises', async (loadOriginal) => {
    const actual = await loadOriginal<typeof FileSystem>();

    return { ...actual, open: vi.fn(actual.open) };
});

afterEach(async () => {
    vi.mocked(open).mockReset();
    vi.restoreAllMocks();

    const temporaryDirectories = new Set<string>();

    for (const directory of directories)
        await collectOwnedTemporaries(directory, temporaryDirectories);

    for (const directory of temporaryDirectories)
        await rm(directory, { recursive: true, force: true });

    for (const directory of directories.splice(0))
        await rm(directory, { recursive: true, force: true });
});

describe('ProfileManager', () => {
    it('separates application, driver and account storage and reopens stable identities', async () => {
        // Arrange
        const root = await fixture();
        const manager = new ProfileManager({ rootDirectory: root });

        // Act
        const profiles = await Promise.all([
            manager.create({ applicationId: 'app-a', driverId: 'codex', accountId: 'account-a' }),
            manager.create({ applicationId: 'app-b', driverId: 'codex', accountId: 'account-a' }),
            manager.create({ applicationId: 'app-a', driverId: 'codex', accountId: 'account-b' }),
            manager.create({ applicationId: 'app-a', driverId: 'claude', accountId: 'account-a' }),
        ]);

        // Assert
        expect(new Set(profiles.map((profile) => profile.id)).size).toBe(4);
        expect(new Set(profiles.map((profile) => profile.paths.root)).size).toBe(4);

        const first = profiles[0]!;
        const reopened = await new ProfileManager({ rootDirectory: root }).create({
            applicationId: 'app-a',
            driverId: 'codex',
            accountId: 'account-a',
        });

        expect(reopened).toEqual(first);

        const separateStore = await new ProfileManager({ rootDirectory: await fixture() }).create({
            applicationId: 'app-a',
            driverId: 'codex',
            accountId: 'account-a',
        });

        expect(separateStore.paths.temporary).not.toBe(first.paths.temporary);

        if (process.platform === 'darwin') expect(first.paths.temporary.length).toBeLessThan(80);

        expect(await readdir(first.paths.credentials)).toEqual(['.synapse-profile.json']);

        if (process.platform !== 'win32') {
            expect((await stat(first.paths.root)).mode & 0o777).toBe(0o700);
            expect(
                (await stat(path.join(first.paths.root, '.synapse-profile.json'))).mode & 0o777,
            ).toBe(0o600);
        }
    });

    it('preserves explicit legacy credential and execution paths without copying accounts', async () => {
        // Arrange
        const store = await fixture();
        const legacy = await fixture();

        await writeFile(path.join(legacy, 'auth.json'), 'synthetic-existing-native-credential');

        const manager = new ProfileManager({ rootDirectory: store });

        // Act
        const profile = await manager.create({
            applicationId: 'symphony',
            driverId: 'codex',
            accountId: 'connection-id',
            id: 'legacy-profile',
            paths: { root: legacy, credentials: legacy, execution: path.join(legacy, 'execution') },
        });

        // Assert
        expect(profile.id).toBe('legacy-profile');
        expect(await readFile(path.join(profile.paths.credentials, 'auth.json'), 'utf8')).toBe(
            'synthetic-existing-native-credential',
        );
        expect(profile.paths.execution).toBe(path.join(profile.paths.root, 'execution'));
        expect(await readdir(store)).toEqual([]);
    });

    it('rejects another application claiming an existing profile root across managers', async () => {
        // Arrange
        const root = await fixture();
        const legacy = await fixture();

        await new ProfileManager({ rootDirectory: root }).create({
            applicationId: 'first-app',
            driverId: 'codex',
            accountId: 'one',
            paths: { root: legacy },
        });

        // Act
        const result = new ProfileManager({ rootDirectory: root }).create({
            applicationId: 'second-app',
            driverId: 'codex',
            accountId: 'one',
            paths: { root: legacy },
        });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });

        const marker: unknown = JSON.parse(
            await readFile(path.join(legacy, '.synapse-profile.json'), 'utf8'),
        );

        expect(marker).toMatchObject({ applicationId: 'first-app' });
    });

    it.each(['home', 'configuration', 'credentials', 'execution', 'temporary', 'sqlite'] as const)(
        'reserves an explicit %s directory across managers with different stores',
        async (location) => {
            // Arrange
            const firstStore = await fixture();
            const secondStore = await fixture();
            const shared = await fixture();
            const nativeFile = path.join(shared, 'native-state.json');

            await writeFile(nativeFile, 'existing-native-state');

            const first = await new ProfileManager({ rootDirectory: firstStore }).create({
                applicationId: 'first-app',
                accountId: 'first-account',
                driverId: 'codex',
                paths: { [location]: shared },
            });
            const markerFile = path.join(shared, '.synapse-profile.json');
            const marker = await readFile(markerFile, 'utf8');

            // Act
            const result = new ProfileManager({ rootDirectory: secondStore }).create({
                applicationId: 'second-app',
                accountId: 'second-account',
                driverId: 'claude',
                paths: { [location]: shared },
            });

            // Assert
            await expect(result).rejects.toMatchObject({ code: 'configuration' });
            expect(await readFile(markerFile, 'utf8')).toBe(marker);
            expect(JSON.parse(marker)).toMatchObject({ id: first.id, schemaVersion: 1 });
            expect(await readFile(nativeFile, 'utf8')).toBe('existing-native-state');
            expect(await readdir(secondStore)).toEqual([]);
        },
    );

    it.each(['inside', 'around'] as const)(
        'rejects a mapping %s a foreign external configuration directory',
        async (direction) => {
            // Arrange
            const firstStore = await fixture();
            const secondStore = await fixture();
            const shared = await fixture();
            const nested = path.join(shared, 'existing', 'native', 'account');
            const claimed = direction === 'inside' ? shared : nested;
            const candidate = direction === 'inside' ? nested : shared;
            const first = await new ProfileManager({ rootDirectory: firstStore }).create({
                applicationId: 'first-app',
                accountId: 'first-account',
                driverId: 'claude',
                paths: { configuration: claimed },
            });
            const nativeFile = path.join(first.paths.configuration, 'native-state.json');

            await writeFile(nativeFile, 'existing-native-configuration');

            // Act
            const result = new ProfileManager({ rootDirectory: secondStore }).create({
                applicationId: 'second-app',
                accountId: 'second-account',
                driverId: 'codex',
                paths: { credentials: candidate },
            });

            // Assert
            await expect(result).rejects.toMatchObject({ code: 'configuration' });
            expect(await readFile(nativeFile, 'utf8')).toBe('existing-native-configuration');
            await expect(stat(path.join(candidate, '.synapse-profile.json'))).rejects.toMatchObject(
                {
                    code: 'ENOENT',
                },
            );
            expect(await readdir(secondStore)).toEqual([]);
        },
    );

    it('reopens all mapped locations for the same owner from another manager and store', async () => {
        // Arrange
        const firstStore = await fixture();
        const secondStore = await fixture();
        const shared = await fixture();
        const first = await new ProfileManager({ rootDirectory: firstStore }).create({
            applicationId: 'app',
            accountId: 'account',
            driverId: 'codex',
            paths: { credentials: shared, configuration: path.join(shared, 'configuration') },
        });
        const markerFile = path.join(shared, '.synapse-profile.json');
        const original = await readFile(markerFile, 'utf8');

        await writeFile(path.join(shared, 'auth.json'), 'existing-native-credential');

        // Act
        const reopened = await new ProfileManager({ rootDirectory: secondStore }).create({
            applicationId: first.applicationId,
            accountId: first.accountId,
            driverId: 'codex',
            id: first.id,
            paths: first.paths,
        });

        // Assert
        expect(reopened).toEqual(first);
        expect(await readFile(markerFile, 'utf8')).toBe(original);
        expect(await readFile(path.join(shared, 'auth.json'), 'utf8')).toBe(
            'existing-native-credential',
        );
    });

    it('backfills missing directory claims while preserving a legacy version-one root marker', async () => {
        // Arrange
        const store = await fixture();
        const first = await new ProfileManager({ rootDirectory: store }).create({
            applicationId: 'app',
            accountId: 'account',
            driverId: 'codex',
        });
        const rootMarker = path.join(first.paths.root, '.synapse-profile.json');
        const original = await readFile(rootMarker, 'utf8');

        for (const directory of Object.values(first.paths)) {
            if (directory === first.paths.root || directory === first.paths.temporary) continue;

            await rm(path.join(directory, '.synapse-profile.json'));
        }

        await writeFile(path.join(first.paths.credentials, 'auth.json'), 'legacy-native-auth');

        // Act
        const reopened = await new ProfileManager({ rootDirectory: store }).create({
            applicationId: 'app',
            accountId: 'account',
            driverId: 'codex',
        });

        // Assert
        expect(reopened).toEqual(first);
        expect(await readFile(rootMarker, 'utf8')).toBe(original);

        for (const directory of Object.values(reopened.paths)) {
            expect(
                JSON.parse(await readFile(path.join(directory, '.synapse-profile.json'), 'utf8')),
            ).toEqual(JSON.parse(original));
        }

        expect(await readFile(path.join(first.paths.credentials, 'auth.json'), 'utf8')).toBe(
            'legacy-native-auth',
        );
    });

    it('rejects shared credential directories and nested profiles owned by other accounts', async () => {
        // Arrange
        const root = await fixture();
        const manager = new ProfileManager({ rootDirectory: root });
        const first = await manager.create({
            applicationId: 'app',
            driverId: 'codex',
            accountId: 'first',
        });

        // Act
        const outcomes = await Promise.allSettled([
            manager.create({
                applicationId: 'app',
                driverId: 'codex',
                accountId: 'second',
                paths: { credentials: first.paths.credentials },
            }),
            new ProfileManager({ rootDirectory: root }).create({
                applicationId: 'other',
                driverId: 'codex',
                accountId: 'third',
                paths: { root: path.join(first.paths.root, 'nested') },
            }),
        ]);

        // Assert
        expect(
            outcomes.every(
                (outcome) =>
                    outcome.status === 'rejected' && outcome.reason?.code === 'configuration',
            ),
        ).toBe(true);
    });

    it('preserves unsupported ownership markers and rejects unsafe directory roots', async () => {
        // Arrange
        const root = await fixture();
        const legacy = await fixture();
        const marker = path.join(legacy, '.synapse-profile.json');

        await writeFile(marker, '{"schemaVersion":99}\n');

        const manager = new ProfileManager({ rootDirectory: root });

        // Act
        const outcomes = await Promise.allSettled([
            manager.create({
                applicationId: 'app',
                driverId: 'codex',
                accountId: 'account',
                paths: { root: legacy },
            }),
            manager.create({
                applicationId: 'app',
                driverId: 'codex',
                accountId: 'other',
                paths: { root: path.parse(root).root },
            }),
        ]);

        // Assert
        expect(
            outcomes.every(
                (outcome) =>
                    outcome.status === 'rejected' && outcome.reason?.code === 'configuration',
            ),
        ).toBe(true);
        expect(await readFile(marker, 'utf8')).toBe('{"schemaVersion":99}\n');
    });

    it('preserves explicit aliased native configuration spellings while checking canonical ownership', async () => {
        // Arrange
        const store = await fixture();
        const backing = await fixture();
        const alias = path.join(store, 'legacy-alias');

        await symlink(backing, alias, process.platform === 'win32' ? 'junction' : 'dir');

        const root = path.join(alias, 'account');
        const manager = new ProfileManager({ rootDirectory: path.join(store, 'profiles') });

        // Act
        const profile = await manager.create({
            applicationId: 'symphony',
            accountId: 'connection',
            driverId: 'claude',
            paths: {
                root,
                home: path.join(root, 'home'),
                configuration: path.join(root, 'configuration'),
                credentials: path.join(root, 'configuration'),
            },
        });

        // Assert
        expect(profile.paths.root).toBe(root);
        expect(profile.paths.home).toBe(path.join(root, 'home'));
        expect(profile.paths.configuration).toBe(path.join(root, 'configuration'));
        expect(profile.paths.credentials).toBe(path.join(root, 'configuration'));
        await expect(
            new ProfileManager({ rootDirectory: path.join(store, 'other-profiles') }).create({
                applicationId: 'other-app',
                accountId: 'other-account',
                driverId: 'claude',
                paths: { root: path.join(backing, 'account') },
            }),
        ).rejects.toMatchObject({ code: 'configuration' });
    });

    it('checks canonical ownership for aliased configuration outside disjoint profile roots', async () => {
        // Arrange
        const firstStore = await fixture();
        const secondStore = await fixture();
        const backing = await fixture();
        const alias = path.join(firstStore, 'native-alias');

        await symlink(backing, alias, process.platform === 'win32' ? 'junction' : 'dir');

        const configuration = path.join(alias, 'native', 'account');
        const first = await new ProfileManager({
            rootDirectory: path.join(firstStore, 'profiles'),
        }).create({
            applicationId: 'app',
            accountId: 'account',
            driverId: 'claude',
            paths: { configuration },
        });

        // Act
        const collision = new ProfileManager({ rootDirectory: secondStore }).create({
            applicationId: 'other-app',
            accountId: 'other-account',
            driverId: 'claude',
            paths: { credentials: path.join(backing, 'native', 'account') },
        });

        // Assert
        await expect(collision).rejects.toMatchObject({ code: 'configuration' });
        expect(first.paths.configuration).toBe(configuration);
        expect(await readdir(secondStore)).toEqual([]);
        expect(
            JSON.parse(await readFile(path.join(configuration, '.synapse-profile.json'), 'utf8')),
        ).toMatchObject({
            id: first.id,
        });
    });

    it('leaves native data unclaimed when descendant inspection exceeds its depth budget', async () => {
        // Arrange
        const store = await fixture();
        const legacy = await fixture();
        const deep = path.join(legacy, ...Array.from({ length: 65 }, () => 'nested'));

        await mkdir(deep, { recursive: true });
        await writeFile(path.join(deep, 'auth.json'), 'existing-native-auth');

        // Act
        const result = new ProfileManager({ rootDirectory: store }).create({
            applicationId: 'app',
            accountId: 'account',
            driverId: 'codex',
            paths: { credentials: legacy },
        });

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
        expect(await readdir(store)).toEqual([]);
        await expect(stat(path.join(legacy, '.synapse-profile.json'))).rejects.toMatchObject({
            code: 'ENOENT',
        });
        expect(await readFile(path.join(deep, 'auth.json'), 'utf8')).toBe('existing-native-auth');
    });

    it('retains claims used by a concurrent identical owner when a later native write fails', async () => {
        // Arrange
        const firstStore = await fixture();
        const secondStore = await fixture();
        const shared = await realpath(await fixture());
        const markerFile = path.join(shared, 'credentials', '.synapse-profile.json');
        const native = await vi.importActual<typeof FileSystem>('node:fs/promises');
        let entered!: () => void;
        let release!: () => void;
        let selected = false;
        const blocked = new Promise<void>((resolve) => {
            entered = resolve;
        });
        const continuation = new Promise<void>((resolve) => {
            release = resolve;
        });
        const profileRequest = {
            applicationId: 'app',
            accountId: 'account',
            driverId: 'codex',
            paths: { root: shared, temporary: path.join(shared, 'temporary') },
        };

        vi.mocked(open).mockImplementation(async (...args) => {
            if (args[0] === markerFile && !selected) {
                selected = true;
                entered();
                await continuation;

                throw Object.assign(new Error('Synthetic profile claim failure.'), { code: 'EIO' });
            }

            return native.open(...args);
        });

        // Act
        const first = new ProfileManager({ rootDirectory: firstStore }).create(profileRequest);
        const failure = first.catch((cause: unknown) => cause);

        try {
            await Promise.race([blocked, first]);

            const successful = await new ProfileManager({ rootDirectory: secondStore }).create(
                profileRequest,
            );

            release();

            // Assert
            expect(selected).toBe(true);
            expect(await failure).toMatchObject({ code: 'persistence' });

            for (const directory of Object.values(successful.paths)) {
                expect(
                    JSON.parse(
                        await readFile(path.join(directory, '.synapse-profile.json'), 'utf8'),
                    ),
                ).toMatchObject({
                    schemaVersion: 1,
                    id: successful.id,
                });
            }

            await expect(
                new ProfileManager({ rootDirectory: firstStore }).create(profileRequest),
            ).resolves.toEqual(successful);
        } finally {
            release();
            await failure;
        }
    });
});

async function fixture(): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'synapse-profile-'));

    directories.push(directory);

    return directory;
}

async function collectOwnedTemporaries(directory: string, output: Set<string>): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);

        if (entry.isDirectory()) await collectOwnedTemporaries(file, output);
        else if (entry.name === '.synapse-profile.json') {
            const marker: unknown = JSON.parse(await readFile(file, 'utf8'));

            if (
                marker &&
                typeof marker === 'object' &&
                'paths' in marker &&
                marker.paths &&
                typeof marker.paths === 'object' &&
                'temporary' in marker.paths &&
                typeof marker.paths.temporary === 'string' &&
                /^synapse-[a-f0-9]{24}$/u.test(path.basename(marker.paths.temporary))
            ) {
                output.add(marker.paths.temporary);
            }
        }
    }
}
