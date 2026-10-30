// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IAiInstance } from '@pixel-brewery/synapse-core';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileProfileSessionStore } from './FileProfileSessionStore.js';

// #endregion

const fixtures: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
        fixtures.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe('FileProfileSessionStore', () => {
    it('leaves absent legacy state untouched until an explicit binding or credential transition', async () => {
        // Arrange
        const instance = await fixture();
        const createId = vi.fn(() => 'generation-one');
        const store = new FileProfileSessionStore(createId);

        // Act
        const generation = await store.read(instance.profile);

        // Assert
        expect(generation).toBeUndefined();
        expect(createId).not.toHaveBeenCalled();
        await expect(stat(instance.profile.paths.root)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('persists private hashed bindings across restart and keeps the digest when credentials advance', async () => {
        // Arrange
        const instance = await fixture();
        const store = new FileProfileSessionStore(() => 'generation-one');

        // Act
        const initial = await store.bind(instance);
        const first = await readFile(metadataPath(instance), 'utf8');
        const advanced = await store.advance(instance.profile);
        const second = await readFile(metadataPath(instance), 'utf8');
        const restarted = new FileProfileSessionStore(() => 'generation-two');

        // Assert
        expect(initial).toBeUndefined();
        expect(advanced).toBe('generation-one');
        await expect(restarted.read(instance.profile)).resolves.toBe('generation-one');
        await expect(restarted.bind(instance)).resolves.toBe('generation-one');
        expect(JSON.parse(first)).toMatchObject({
            version: 1,
            profileId: 'profile',
            applicationId: 'application',
            accountId: 'account',
            configurationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        });
        expect(JSON.parse(first)).not.toHaveProperty('generation');
        expect(JSON.parse(second).configurationDigest).toBe(JSON.parse(first).configurationDigest);
        expect(first).not.toContain('sensitive-value');
        expect(second).not.toContain('sensitive-value');
        expect(await readdir(instance.profile.paths.root)).toEqual([
            '.synapse-session-generation.json',
        ]);

        if (process.platform !== 'win32')
            expect((await stat(metadataPath(instance))).mode & 0o777).toBe(0o600);
    });

    it('canonicalizes object keys and ignores temporary paths and equivalent instance identities', async () => {
        // Arrange
        const instance = await fixture();
        const createId = vi.fn(() => 'changed');
        const store = new FileProfileSessionStore(createId);

        await store.bind(instance);

        const before = await readFile(metadataPath(instance), 'utf8');
        const equivalent: IAiInstance = {
            ...instance,
            id: 'another-runtime-instance',
            configuration: { nested: { a: ['text', true, null], z: 2 }, token: 'sensitive-value' },
            environment: { Z: 'last', SECRET: 'sensitive-value' },
            profile: {
                ...instance.profile,
                paths: {
                    ...instance.profile.paths,
                    temporary: join(instance.profile.paths.root, 'another-temporary'),
                },
            },
        };

        // Act
        const generation = await store.bind(equivalent);

        // Assert
        expect(generation).toBeUndefined();
        expect(createId).not.toHaveBeenCalled();
        expect(await readFile(metadataPath(instance), 'utf8')).toBe(before);
    });

    const changes: ReadonlyArray<readonly [string, (instance: IAiInstance) => IAiInstance]> = [
        ['driver', (instance) => ({ ...instance, driverId: 'other-driver' })],
        ['executable', (instance) => ({ ...instance, executable: '/explicit/native-cli' })],
        [
            'configuration',
            (instance) => ({ ...instance, configuration: { token: 'different-value' } }),
        ],
        [
            'environment',
            (instance) => ({ ...instance, environment: { SECRET: 'different-value' } }),
        ],
        ...(['home', 'configuration', 'credentials', 'execution', 'sqlite'] as const).map(
            (key): readonly [string, (instance: IAiInstance) => IAiInstance] => [
                `native ${key} path`,
                (instance) => ({
                    ...instance,
                    profile: {
                        ...instance.profile,
                        paths: {
                            ...instance.profile.paths,
                            [key]: join(instance.profile.paths.root, `changed-${key}`),
                        },
                    },
                }),
            ],
        ),
    ];

    it.each(changes)(
        'invalidates persisted continuation generations when the %s changes',
        async (_label, change) => {
            // Arrange
            const instance = await fixture();
            const store = new FileProfileSessionStore(() => 'changed-generation');

            await store.bind(instance);

            const before = JSON.parse(await readFile(metadataPath(instance), 'utf8'));

            // Act
            const generation = await store.bind(change(instance));

            // Assert
            expect(generation).toBe('changed-generation');

            const restarted = new FileProfileSessionStore();

            await expect(restarted.read(instance.profile)).resolves.toBe('changed-generation');
            await expect(restarted.bind(change(instance))).resolves.toBe('changed-generation');
            expect(
                JSON.parse(await readFile(metadataPath(instance), 'utf8')).configurationDigest,
            ).not.toBe(before.configurationDigest);
        },
    );

    it.each([undefined, 'legacy-generation'])(
        'preserves the first legacy generation %s when adding its first configuration digest',
        async (generation) => {
            // Arrange
            const instance = await fixture();
            const original = {
                version: 1,
                profileId: instance.profile.id,
                applicationId: instance.profile.applicationId,
                accountId: instance.profile.accountId,
                ...(generation === undefined ? {} : { generation }),
            };

            await writeMetadata(instance, JSON.stringify(original));

            const createId = vi.fn(() => 'new-generation');
            const store = new FileProfileSessionStore(createId);

            // Act
            const bound = await store.bind(instance);

            // Assert
            expect(bound).toBe(generation);
            expect(createId).not.toHaveBeenCalled();
            await expect(new FileProfileSessionStore().read(instance.profile)).resolves.toBe(
                generation,
            );
            expect(JSON.parse(await readFile(metadataPath(instance), 'utf8'))).toMatchObject({
                ...original,
                configurationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
            });
        },
    );

    it('preserves unsupported newer metadata and never invokes the generation source', async () => {
        // Arrange
        const instance = await fixture();
        const raw = '{"version":2,"futureState":"preserve-me"}';

        await writeMetadata(instance, raw);

        const createId = vi.fn(() => 'new-generation');
        const store = new FileProfileSessionStore(createId);

        // Act
        const outcomes = await Promise.allSettled([
            store.read(instance.profile),
            store.bind(instance),
            store.advance(instance.profile),
        ]);

        // Assert
        expect(outcomes).toHaveLength(3);

        for (const outcome of outcomes)
            expect(outcome).toMatchObject({
                status: 'rejected',
                reason: { code: 'configuration' },
            });

        expect(createId).not.toHaveBeenCalled();
        expect(await readFile(metadataPath(instance), 'utf8')).toBe(raw);
        expect(await readdir(instance.profile.paths.root)).toEqual([
            '.synapse-session-generation.json',
        ]);
    });

    it.each([
        ['malformed JSON', '{'],
        [
            'foreign owner',
            '{"version":1,"profileId":"foreign","applicationId":"application","accountId":"account"}',
        ],
        [
            'malformed digest',
            '{"version":1,"profileId":"profile","applicationId":"application","accountId":"account","configurationDigest":"invalid"}',
        ],
        [
            'unknown version-one field',
            '{"version":1,"profileId":"profile","applicationId":"application","accountId":"account","unknown":"keep"}',
        ],
        ['oversized metadata', ' '.repeat(8193)],
    ])('preserves %s when refusing a credential or configuration mutation', async (_label, raw) => {
        // Arrange
        const instance = await fixture();

        await writeMetadata(instance, raw);

        const store = new FileProfileSessionStore();

        // Act
        const outcomes = await Promise.allSettled([
            store.bind(instance),
            store.advance(instance.profile),
        ]);

        // Assert
        for (const outcome of outcomes)
            expect(outcome).toMatchObject({ status: 'rejected', reason: { code: 'persistence' } });

        expect(await readFile(metadataPath(instance), 'utf8')).toBe(raw);
    });

    it('rejects unsupported JSON, cycles and hashing budgets before changing an established binding', async () => {
        // Arrange
        const instance = await fixture();
        const store = new FileProfileSessionStore();

        await store.bind(instance);

        const before = await readFile(metadataPath(instance), 'utf8');
        const cycle: Record<string, unknown> = {};

        cycle['self'] = cycle;

        const getter = vi.fn(() => 'must-not-read');
        const accessor = Object.defineProperty({}, 'token', { get: getter, enumerable: true });
        const hidden = Object.defineProperty({}, 'token', { value: 'hidden', enumerable: false });
        let deep: Record<string, unknown> = {};

        for (let index = 0; index < 33; index++) deep = { child: deep };

        const invalid: ReadonlyArray<Readonly<Record<string, unknown>>> = [
            cycle,
            accessor,
            hidden,
            { value: undefined },
            { value: NaN },
            { value: 1n },
            { value: new Date() },
            { value: new Array(2) },
            { [Symbol('unsupported')]: 'value' },
            { value: 'x'.repeat(1_048_577) },
            { value: Array.from({ length: 10_001 }, () => 1) },
            deep,
        ];

        // Act
        const outcomes = [];

        for (const configuration of invalid)
            outcomes.push(await Promise.allSettled([store.bind({ ...instance, configuration })]));

        // Assert
        for (const outcome of outcomes.flat())
            expect(outcome).toMatchObject({
                status: 'rejected',
                reason: { code: 'configuration' },
            });

        expect(getter).not.toHaveBeenCalled();
        expect(await readFile(metadataPath(instance), 'utf8')).toBe(before);
    });

    it('refuses a repeated generation without discarding the existing configuration digest', async () => {
        // Arrange
        const instance = await fixture();
        const store = new FileProfileSessionStore(() => 'same-generation');

        await store.bind(instance);
        await store.advance(instance.profile);

        const before = await readFile(metadataPath(instance), 'utf8');

        // Act
        const advance = store.advance(instance.profile);

        // Assert
        await expect(advance).rejects.toMatchObject({ code: 'configuration' });
        expect(await readFile(metadataPath(instance), 'utf8')).toBe(before);
    });

    it.skipIf(process.platform === 'win32')(
        'refuses metadata symlinks without reading or overwriting their target',
        async () => {
            // Arrange
            const instance = await fixture();

            await mkdir(instance.profile.paths.root, { recursive: true });

            const target = join(instance.profile.paths.root, 'foreign.json');
            const content = '{"version":2,"preserved":true}';

            await writeFile(target, content);
            await symlink(target, metadataPath(instance));

            const store = new FileProfileSessionStore();

            // Act
            const outcome = store.bind(instance);

            // Assert
            await expect(outcome).rejects.toMatchObject({ code: 'persistence' });
            expect(await readFile(target, 'utf8')).toBe(content);
        },
    );
});

async function fixture(): Promise<IAiInstance> {
    const directory = await mkdtemp(join(tmpdir(), 'synapse-profile-session-'));

    fixtures.push(directory);

    const root = join(directory, 'profile');

    return {
        id: 'instance',
        driverId: 'driver',
        configuration: { token: 'sensitive-value', nested: { z: 2, a: ['text', true, null] } },
        environment: { SECRET: 'sensitive-value', Z: 'last' },
        profile: {
            id: 'profile',
            applicationId: 'application',
            accountId: 'account',
            paths: {
                root,
                home: join(root, 'home'),
                configuration: join(root, 'configuration'),
                credentials: join(root, 'credentials'),
                execution: join(root, 'execution'),
                temporary: join(root, 'temporary'),
            },
        },
    };
}

function metadataPath(instance: IAiInstance): string {
    return join(instance.profile.paths.root, '.synapse-session-generation.json');
}

async function writeMetadata(instance: IAiInstance, content: string): Promise<void> {
    await mkdir(instance.profile.paths.root, { recursive: true });
    await writeFile(metadataPath(instance), content, { mode: 0o600 });
}
