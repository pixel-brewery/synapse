// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiInstance, IAiProfile } from '@pixel-brewery/synapse-core';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { ProfileSessionStoreBase } from '../abstracts/ProfileSessionStoreBase.js';

// #endregion

type Metadata = {
    readonly version: 1;
    readonly profileId: string;
    readonly applicationId: string;
    readonly accountId: string;
    readonly generation?: string;
    readonly configurationDigest?: string;
};

/**
 * Atomic private profile metadata that invalidates native continuations across account or configuration changes and restarts.
 *
 * @remarks Synchronization belongs to the shared profile coordinator; this file is not a cross-process execution lock. Version 1 stores explicit owner identifiers and optional generation/configuration digests, never native credentials or configuration plaintext. Metadata is limited to 8 KiB; canonical configuration hashing accepts at most 1 MiB, 10,000 nodes and 32 levels of JSON data.
 *
 * @public
 */
export class FileProfileSessionStore extends ProfileSessionStoreBase {
    // #region Ctor

    /**
     * Captures an identifier source without filesystem access.
     *
     * @param _createId - Distinct bounded generation identifiers; default cryptographic UUIDs.
     *
     * @public
     */
    public constructor(private readonly _createId: () => string = randomUUID) {
        super();
    }

    // #endregion

    // #region Methods

    /**
     * Binds the profile to a canonical SHA-256 digest of its current native configuration.
     *
     * @param instance - Driver, executable, JSON configuration, explicit environment and owned profile.
     * @returns Current generation, including undefined for a first or legacy binding.
     * @throws An AiError for non-JSON/cyclic/oversized configuration, unsupported metadata or persistence failure.
     * @remarks Object keys are sorted. Profile identity and stable paths are included; temporary paths and the instance identifier are excluded. An existing changed digest advances the generation before the new binding is persisted. This method requires the caller's exclusive profile gate.
     *
     * @public
     */
    public override async bind(instance: IAiInstance): Promise<string | undefined> {
        this.path(instance.profile);

        let configurationDigest: string;

        try {
            configurationDigest = this.digest(instance);
        } catch (cause) {
            throw cause instanceof AiError
                ? cause
                : new AiError(
                      'configuration',
                      'The session configuration could not be canonicalized.',
                      {
                          cause,
                      },
                  );
        }

        const previous = await this.load(instance.profile);

        if (previous?.configurationDigest === configurationDigest) return previous.generation;

        const generation = previous?.configurationDigest
            ? this.generation(previous.generation)
            : previous?.generation;

        await this.persist(instance.profile, {
            ...this.owner(instance.profile),
            ...(generation === undefined ? {} : { generation }),
            configurationDigest,
        });

        return generation;
    }

    /**
     * Reads bounded versioned metadata while preserving absent legacy state.
     *
     * @param profile - Explicit owner and absolute storage root.
     * @returns Current generation, or undefined when no credential/configuration change has been recorded.
     * @throws An AiError for malformed, foreign, symlinked or unsupported metadata.
     *
     * @public
     */
    public override async read(profile: IAiProfile): Promise<string | undefined> {
        return (await this.load(profile))?.generation;
    }

    /**
     * Persists a fresh generation before native credential mutation and preserves the configuration binding.
     *
     * @param profile - Drained profile exclusively owned by the shared coordinator.
     * @returns The new persisted generation, also readable by a restarted runtime.
     * @throws An AiError for invalid identifiers, unknown state or atomic-write failure.
     *
     * @public
     */
    public override async advance(profile: IAiProfile): Promise<string> {
        const previous = await this.load(profile);
        const generation = this.generation(previous?.generation);

        await this.persist(profile, {
            ...this.owner(profile),
            generation,
            ...(previous?.configurationDigest === undefined
                ? {}
                : { configurationDigest: previous.configurationDigest }),
        });

        return generation;
    }

    private async load(profile: IAiProfile): Promise<Metadata | undefined> {
        const path = this.path(profile);
        let data: Buffer;

        try {
            const metadata = await lstat(path);

            if (!metadata.isFile() || metadata.isSymbolicLink())
                throw new AiError(
                    'persistence',
                    'Profile session metadata is not an owned regular file.',
                );

            const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));

            try {
                const actual = await file.stat();

                if (!actual.isFile() || actual.ino !== metadata.ino || actual.dev !== metadata.dev)
                    throw new AiError(
                        'persistence',
                        'Profile session metadata changed while being opened.',
                    );

                const buffer = Buffer.alloc(8193);
                let offset = 0;

                while (offset < buffer.length) {
                    const result = await file.read(buffer, offset, buffer.length - offset, offset);

                    if (!result.bytesRead) break;

                    offset += result.bytesRead;
                }

                if (offset > 8192)
                    throw new AiError(
                        'persistence',
                        'Profile session metadata exceeded its byte budget.',
                    );

                data = buffer.subarray(0, offset);
            } finally {
                await file.close();
            }
        } catch (cause) {
            if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
                return undefined;

            throw cause instanceof AiError
                ? cause
                : new AiError('persistence', 'Profile session metadata could not be read.', {
                      cause,
                  });
        }

        let value: unknown;

        try {
            value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
        } catch (cause) {
            throw new AiError('persistence', 'Profile session metadata is malformed.', { cause });
        }

        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new AiError('persistence', 'Profile session metadata is malformed.');

        if (
            'version' in value &&
            typeof value.version === 'number' &&
            Number.isSafeInteger(value.version) &&
            value.version > 1
        )
            throw new AiError(
                'configuration',
                'Profile session metadata was written by a newer unsupported version.',
            );

        const allowed = new Set([
            'version',
            'profileId',
            'applicationId',
            'accountId',
            'generation',
            'configurationDigest',
        ]);

        if (
            Object.keys(value).some((key) => !allowed.has(key)) ||
            !('version' in value) ||
            value.version !== 1 ||
            !('profileId' in value) ||
            value.profileId !== profile.id ||
            !('applicationId' in value) ||
            value.applicationId !== profile.applicationId ||
            !('accountId' in value) ||
            value.accountId !== profile.accountId ||
            ('generation' in value &&
                (typeof value.generation !== 'string' ||
                    !/^[A-Za-z0-9_-]{1,128}$/u.test(value.generation))) ||
            ('configurationDigest' in value &&
                (typeof value.configurationDigest !== 'string' ||
                    !/^[a-f0-9]{64}$/u.test(value.configurationDigest)))
        )
            throw new AiError(
                'persistence',
                'Profile session metadata has an invalid version, owner or binding.',
            );

        return {
            ...this.owner(profile),
            ...('generation' in value && typeof value.generation === 'string'
                ? { generation: value.generation }
                : {}),
            ...('configurationDigest' in value && typeof value.configurationDigest === 'string'
                ? { configurationDigest: value.configurationDigest }
                : {}),
        };
    }

    private async persist(profile: IAiProfile, value: Metadata): Promise<void> {
        const data = JSON.stringify(value);

        if (Buffer.byteLength(data) > 8192)
            throw new AiError(
                'configuration',
                'Profile identities exceeded the session metadata budget.',
            );

        const path = this.path(profile);
        const temporary = `${path}.${randomUUID()}.tmp`;
        let created = false;

        try {
            await mkdir(profile.paths.root, { recursive: true, mode: 0o700 });

            const file = await open(temporary, 'wx', 0o600);

            created = true;

            try {
                await file.writeFile(data, 'utf8');
                await file.sync();
            } finally {
                await file.close();
            }

            await rename(temporary, path);
            created = false;
        } catch (cause) {
            throw cause instanceof AiError
                ? cause
                : new AiError(
                      'persistence',
                      'The profile session binding could not be persisted.',
                      {
                          cause,
                      },
                  );
        } finally {
            if (created) await rm(temporary, { force: true }).catch(() => undefined);
        }
    }

    private owner(profile: IAiProfile): Metadata {
        return {
            version: 1,
            profileId: profile.id,
            applicationId: profile.applicationId,
            accountId: profile.accountId,
        };
    }

    private generation(previous: string | undefined): string {
        let generation: string;

        try {
            generation = this._createId();
        } catch (cause) {
            throw new AiError(
                'configuration',
                'The profile generation identifier could not be created.',
                {
                    cause,
                },
            );
        }

        if (
            typeof generation !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/u.test(generation) ||
            generation === previous
        )
            throw new AiError(
                'configuration',
                'A profile transition requires a fresh generation identifier.',
            );

        return generation;
    }

    private digest(instance: IAiInstance): string {
        const paths = instance.profile.paths;

        if (
            !instance.driverId.trim() ||
            (instance.executable !== undefined &&
                (typeof instance.executable !== 'string' || !instance.executable.trim()))
        )
            throw new AiError(
                'configuration',
                'A session binding requires an explicit native driver and valid executable.',
            );

        const nativePaths: Record<string, string> = {};

        for (const name of [
            'root',
            'home',
            'configuration',
            'credentials',
            'execution',
            'sqlite',
        ] as const) {
            const value = paths[name];

            if (name === 'sqlite' && value === undefined) continue;

            if (typeof value !== 'string' || !isAbsolute(value))
                throw new AiError(
                    'configuration',
                    'Session binding paths must be explicit absolute directories.',
                );

            nativePaths[name] = value;
        }

        const hash = createHash('sha256');
        let bytes = 0;
        let nodes = 0;
        const active = new Set<object>();
        const append = (chunk: string): void => {
            bytes += Buffer.byteLength(chunk);

            if (bytes > 1_048_576)
                throw new AiError(
                    'configuration',
                    'The session configuration exceeded its byte budget.',
                );

            hash.update(chunk);
        };
        const text = (value: string): void => {
            if (Buffer.byteLength(value) > 1_048_576)
                throw new AiError(
                    'configuration',
                    'The session configuration exceeded its byte budget.',
                );

            append(JSON.stringify(value));
        };
        const encode = (value: unknown, depth: number): void => {
            if (++nodes > 10_000 || depth > 32)
                throw new AiError(
                    'configuration',
                    'The session configuration exceeded its structural budget.',
                );

            if (value === null) {
                append('null');

                return;
            }

            if (typeof value === 'string') {
                text(value);

                return;
            }

            if (
                typeof value === 'boolean' ||
                (typeof value === 'number' && Number.isFinite(value))
            ) {
                append(JSON.stringify(value));

                return;
            }

            if (typeof value !== 'object' || active.has(value))
                throw new AiError(
                    'configuration',
                    'Session configuration must contain acyclic JSON data.',
                );

            const array = Array.isArray(value);

            if (
                !array &&
                Object.getPrototypeOf(value) !== Object.prototype &&
                Object.getPrototypeOf(value) !== null
            )
                throw new AiError(
                    'configuration',
                    'Session configuration objects must contain plain JSON data.',
                );

            const descriptors = Object.getOwnPropertyDescriptors(value);
            const keys = Reflect.ownKeys(descriptors);

            if (keys.length > 10_000 || keys.some((key) => typeof key !== 'string'))
                throw new AiError(
                    'configuration',
                    'Session configuration keys exceeded their supported budget.',
                );

            active.add(value);
            append(array ? '[' : '{');

            if (array && (value.length > 10_000 || keys.length !== value.length + 1))
                throw new AiError(
                    'configuration',
                    'Session configuration arrays must be dense bounded JSON lists.',
                );

            const ordered = array
                ? Array.from({ length: value.length }, (_, index) => String(index))
                : Object.keys(descriptors).sort();

            for (const [index, key] of ordered.entries()) {
                const descriptor = descriptors[key];

                if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
                    throw new AiError(
                        'configuration',
                        'Session configuration cannot contain hidden fields, sparse entries or accessors.',
                    );

                if (index > 0) append(',');

                if (!array) {
                    text(key);
                    append(':');
                }

                encode(descriptor.value, depth + 1);
            }

            append(array ? ']' : '}');
            active.delete(value);
        };

        encode(
            {
                driverId: instance.driverId,
                executable: instance.executable ?? null,
                configuration: instance.configuration ?? {},
                environment: instance.environment ?? {},
                profile: {
                    id: instance.profile.id,
                    applicationId: instance.profile.applicationId,
                    accountId: instance.profile.accountId,
                    paths: nativePaths,
                },
            },
            0,
        );

        return hash.digest('hex');
    }

    private path(profile: IAiProfile): string {
        if (
            !profile.id.trim() ||
            !profile.applicationId.trim() ||
            !profile.accountId.trim() ||
            !isAbsolute(profile.paths.root)
        )
            throw new AiError(
                'configuration',
                'Session metadata requires an explicit owned profile.',
            );

        return join(profile.paths.root, '.synapse-session-generation.json');
    }

    // #endregion
}
