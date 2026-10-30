// #region Imports

import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, open, opendir, readFile, realpath } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { AiError } from '@pixel-brewery/synapse-core';
import type { IAiProfile, IAiProfilePaths } from '@pixel-brewery/synapse-core';
import type { IProfileManagerOptions } from '../interfaces/IProfileManagerOptions.js';
import type { IProfileRequest } from '../interfaces/IProfileRequest.js';

// #endregion

type ProfileMarker = {
    schemaVersion: 1;
    id: string;
    applicationId: string;
    accountId: string;
    driverId: string;
    paths: IAiProfilePaths;
};

/**
 * Creates isolated application/account directories without importing global credentials.
 *
 * @remarks Reuse one manager for all profiles in a host. Version 1 ownership markers reserve
 * every canonical profile directory across manager instances, including explicit legacy mappings.
 * Ancestor and descendant checks reject foreign overlapping claims. Each of the two inspection
 * passes visits at most 4,096 directories, 32,768 entries and 64 nested levels without following
 * directory symlinks; mappings that cannot be verified within those limits fail closed.
 * Claims already written before an initialization failure remain reserved; the same identity
 * and mapping can reopen them. Existing native files are never copied or removed.
 * Reopening a legacy version 1 profile backfills missing sidecars. Previously unmarked external
 * directories have no discoverable persistent owner until they are explicitly claimed.
 * POSIX directories/files use 0700/0600; Windows hosts supply a private ACL-protected base.
 *
 * @public
 */
export class ProfileManager {
    // #region Fields

    private readonly _rootDirectory: string;
    private readonly _maxProfiles: number;
    private readonly _profiles = new Map<string, IAiProfile>();
    private readonly _owners = new Map<string, string>();
    private readonly _paths = new Map<string, string>();
    private _pending: Promise<void> = Promise.resolve();

    // #endregion

    // #region Ctor

    /**
     * Captures profile storage policy without creating directories or reading accounts.
     *
     * @param options - Application-owned storage and bounded mapping policy.
     * @throws An AiError when the root is not absolute or the limit is invalid.
     *
     * @public
     */
    public constructor(options: IProfileManagerOptions) {
        if (
            !options ||
            typeof options.rootDirectory !== 'string' ||
            !path.isAbsolute(options.rootDirectory) ||
            options.rootDirectory.includes('\0') ||
            path.parse(options.rootDirectory).root === path.normalize(options.rootDirectory)
        ) {
            throw new AiError(
                'configuration',
                'A profile store requires an owned absolute directory.',
            );
        }

        const limit = options.maxProfiles ?? 1024;

        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new AiError(
                'configuration',
                'The profile mapping limit must be a positive integer.',
            );
        }

        this._rootDirectory = path.normalize(options.rootDirectory);
        this._maxProfiles = limit;
    }

    // #endregion

    // #region Methods

    /**
     * Creates or reopens one immutable isolated profile, preserving explicit legacy mappings.
     *
     * @param request - Application, account, driver and optional legacy locations.
     * @returns Stable identity and normalized absolute native paths, preserving explicit legacy spellings.
     * @throws An AiError for ownership/path collisions, unsupported markers or filesystem failure.
     * @remarks Existing credentials and sessions are preserved. No global login state is copied.
     * Every distinct mapped directory, including sqlite, receives a private ownership sidecar.
     * A failed initialization retains completed ownership claims for a retry with the same mapping.
     *
     * @public
     */
    public create(request: IProfileRequest): Promise<IAiProfile> {
        if (!request || typeof request !== 'object') {
            return Promise.reject(new AiError('configuration', 'A profile request is required.'));
        }

        const snapshot: IProfileRequest = {
            ...request,
            ...(request.paths ? { paths: { ...request.paths } } : {}),
        };
        const result = this._pending.then(() => this.createProfile(snapshot));

        this._pending = result.then(
            () => undefined,
            () => undefined,
        );

        return result;
    }

    private async createProfile(request: IProfileRequest): Promise<IAiProfile> {
        for (const value of [
            request.applicationId,
            request.accountId,
            request.driverId,
            request.id ?? 'derived',
        ]) {
            if (typeof value !== 'string' || !value.trim() || value.length > 1024) {
                throw new AiError(
                    'configuration',
                    'Profile identities must be nonempty bounded strings.',
                );
            }
        }

        const identity = JSON.stringify([
            request.applicationId,
            request.driverId,
            request.accountId,
        ]);
        const id = request.id ?? `synapse:${this.hash(identity)}`;
        const owner = JSON.stringify([id, identity]);

        if (
            request.paths !== undefined &&
            (!request.paths || typeof request.paths !== 'object' || Array.isArray(request.paths))
        ) {
            throw new AiError(
                'configuration',
                'Legacy profile mappings must be an object of absolute paths.',
            );
        }

        for (const value of Object.values(request.paths ?? {})) {
            if (
                value !== undefined &&
                (typeof value !== 'string' || !value || value.includes('\0'))
            ) {
                throw new AiError(
                    'configuration',
                    'Legacy profile mappings must contain valid path strings.',
                );
            }
        }

        if (this._owners.has(id) && this._owners.get(id) !== owner) {
            throw new AiError(
                'configuration',
                'A profile identifier is already owned by another account.',
            );
        }

        if (!this._profiles.has(id) && this._profiles.size >= this._maxProfiles) {
            throw new AiError(
                'output-limit',
                'The profile manager mapping limit has been reached.',
            );
        }

        let store: string;

        try {
            store = await this.canonical(this._rootDirectory);
        } catch (error) {
            if (error instanceof AiError) throw error;

            throw new AiError(
                'persistence',
                'The isolated AI profile store could not be initialized.',
                {
                    cause: error,
                },
            );
        }

        const temporaryBase = process.platform === 'darwin' ? '/tmp' : tmpdir();
        const root = request.paths?.root ?? path.join(store, this.hash(identity).slice(0, 32));
        const temporaryDigest = this.hash(JSON.stringify([store, identity])).slice(0, 24);
        const requested: IAiProfilePaths = {
            root,
            home: request.paths?.home ?? path.join(root, 'home'),
            configuration: request.paths?.configuration ?? path.join(root, 'configuration'),
            credentials: request.paths?.credentials ?? path.join(root, 'credentials'),
            execution: request.paths?.execution ?? path.join(root, 'execution'),
            temporary:
                request.paths?.temporary ?? path.join(temporaryBase, `synapse-${temporaryDigest}`),
            sqlite: request.paths?.sqlite ?? path.join(root, 'sqlite'),
        };

        try {
            for (const value of Object.values(requested)) {
                if (!path.isAbsolute(value) || path.parse(value).root === path.normalize(value)) {
                    throw new AiError(
                        'configuration',
                        'Profile paths must be owned absolute directories.',
                    );
                }
            }

            const [canonicalRoot, home, configuration, credentials, execution, temporary, sqlite] =
                await Promise.all([
                    this.canonical(requested.root),
                    this.canonical(requested.home),
                    this.canonical(requested.configuration),
                    this.canonical(requested.credentials),
                    this.canonical(requested.execution),
                    this.canonical(requested.temporary),
                    this.canonical(requested.sqlite ?? path.join(root, 'sqlite')),
                ]);
            const paths: IAiProfilePaths = {
                root: canonicalRoot,
                home,
                configuration,
                credentials,
                execution,
                temporary,
                sqlite,
            };

            // Native keychain identifiers and existing credential symlinks may depend on the
            // exact legacy spelling. Canonical paths remain the ownership authority only.
            const nativePaths: IAiProfilePaths = {
                root: path.normalize(requested.root),
                home: path.normalize(requested.home),
                configuration: path.normalize(requested.configuration),
                credentials: path.normalize(requested.credentials),
                execution: path.normalize(requested.execution),
                temporary: path.normalize(requested.temporary),
                sqlite: path.normalize(requested.sqlite ?? path.join(root, 'sqlite')),
            };
            const sharedDirectories = await Promise.all([
                this.canonical(temporaryBase, false),
                this.canonical(tmpdir(), false),
                this.canonical(homedir(), false),
            ]);

            if (Object.values(paths).some((directory) => sharedDirectories.includes(directory))) {
                throw new AiError(
                    'configuration',
                    'Profile paths cannot claim shared system or global account directories.',
                );
            }

            const previous = this._profiles.get(id);

            if (previous && JSON.stringify(previous.paths) !== JSON.stringify(nativePaths)) {
                throw new AiError(
                    'configuration',
                    'A profile cannot change its path mapping within one manager.',
                );
            }

            this.assertClaims(paths, owner);

            const marker: ProfileMarker = {
                schemaVersion: 1,
                id,
                applicationId: request.applicationId,
                accountId: request.accountId,
                driverId: request.driverId,
                paths,
            };

            await this.assertPersistentClaims(paths, marker, owner);

            for (const directory of new Set(Object.values(paths))) {
                await this.ensureDirectory(directory, false);
                await this.claimMarker(marker, directory);
            }

            // Recheck after claiming to reject overlapping managers that passed preflight together.
            // Existing reservations remain intact if this or a later initialization step fails.
            await this.assertPersistentClaims(paths, marker, owner);

            for (const directory of new Set(Object.values(paths)))
                await this.ensureDirectory(directory);

            const profile: IAiProfile = Object.freeze({
                id,
                applicationId: request.applicationId,
                accountId: request.accountId,
                paths: Object.freeze(nativePaths),
            });

            this._profiles.set(id, profile);
            this._owners.set(id, owner);

            for (const directory of Object.values(paths))
                this._paths.set(this.key(directory), owner);

            return profile;
        } catch (error) {
            if (error instanceof AiError) throw error;

            throw new AiError('persistence', 'The isolated AI profile could not be initialized.', {
                cause: error,
            });
        }
    }

    private hash(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }

    private key(value: string): string {
        return process.platform === 'win32' ? value.toLowerCase() : value;
    }

    private assertClaims(paths: IAiProfilePaths, owner: string): void {
        for (const directory of Object.values(paths)) {
            const candidate = this.key(directory);

            for (const [claimed, claimedOwner] of this._paths) {
                if (
                    claimedOwner !== owner &&
                    (candidate === claimed ||
                        candidate.startsWith(`${claimed}${path.sep}`) ||
                        claimed.startsWith(`${candidate}${path.sep}`))
                ) {
                    throw new AiError(
                        'configuration',
                        'Profile directories overlap another application or account.',
                    );
                }
            }
        }
    }

    private async canonical(directory: string, direct = true): Promise<string> {
        try {
            const metadata = await lstat(directory);

            if (
                (metadata.isSymbolicLink() && direct) ||
                (!metadata.isDirectory() && !metadata.isSymbolicLink())
            ) {
                throw new AiError(
                    'configuration',
                    'A profile path must be a real owned directory.',
                );
            }

            return await realpath(directory);
        } catch (error) {
            if (this.errorCode(error) !== 'ENOENT') throw error;

            return path.join(
                await this.canonical(path.dirname(directory), false),
                path.basename(directory),
            );
        }
    }

    private async ensureDirectory(directory: string, privateMode = true): Promise<void> {
        await mkdir(directory, { recursive: true, mode: 0o700 });

        const metadata = await lstat(directory);

        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
            throw new AiError('configuration', 'A profile path must be a real owned directory.');
        }

        if (privateMode && process.platform !== 'win32') await chmod(directory, 0o700);
    }

    private async claimMarker(
        expected: ProfileMarker,
        directory = expected.paths.root,
    ): Promise<void> {
        const file = path.join(directory, '.synapse-profile.json');

        try {
            const handle = await open(file, 'wx', 0o600);

            try {
                await handle.writeFile(`${JSON.stringify(expected, null, 2)}\n`);
            } finally {
                await handle.close();
            }
        } catch (error) {
            if (this.errorCode(error) !== 'EEXIST') throw error;

            const actual = await this.readMarker(file);

            if (
                !actual ||
                typeof actual !== 'object' ||
                JSON.stringify(actual) !== JSON.stringify(expected)
            ) {
                throw new AiError(
                    'configuration',
                    'The profile directory has another owner or an unsupported mapping.',
                );
            }

            if (process.platform !== 'win32') await chmod(file, 0o600);
        }
    }

    private async assertPersistentClaims(
        paths: IAiProfilePaths,
        expected: ProfileMarker,
        owner: string,
    ): Promise<void> {
        const directories = [...new Set(Object.values(paths))];

        for (const directory of directories) {
            await this.assertAncestorOwnership(directory, owner);

            try {
                const marker = await this.readMarker(path.join(directory, '.synapse-profile.json'));

                if (JSON.stringify(marker) !== JSON.stringify(expected)) {
                    throw new AiError(
                        'configuration',
                        'A profile directory has another owner or an unsupported mapping.',
                    );
                }
            } catch (error) {
                if (this.errorCode(error) !== 'ENOENT') throw error;
            }
        }

        const outermost = directories.filter(
            (directory) =>
                !directories.some(
                    (other) =>
                        this.key(directory) !== this.key(other) &&
                        this.key(directory).startsWith(`${this.key(other)}${path.sep}`),
                ),
        );
        const pending = outermost.map((directory) => ({ directory, depth: 0 }));
        let visitedDirectories = 0;
        let visitedEntries = 0;

        while (pending.length) {
            const current = pending.pop()!;

            if (++visitedDirectories > 4_096) this.inspectionLimit();

            try {
                const metadata = await lstat(current.directory);

                if (
                    !metadata.isDirectory() ||
                    metadata.isSymbolicLink() ||
                    this.key(await realpath(current.directory)) !== this.key(current.directory)
                ) {
                    throw new AiError(
                        'configuration',
                        'Profile ownership inspection encountered an unsafe directory.',
                    );
                }

                try {
                    const marker = await this.readMarker(
                        path.join(current.directory, '.synapse-profile.json'),
                    );

                    if (this.markerOwner(marker) !== owner) {
                        throw new AiError(
                            'configuration',
                            'A profile directory contains another account profile.',
                        );
                    }
                } catch (error) {
                    if (this.errorCode(error) !== 'ENOENT') throw error;
                }

                const entries = await opendir(current.directory);

                for await (const entry of entries) {
                    if (++visitedEntries > 32_768) this.inspectionLimit();

                    if (!entry.isDirectory()) continue;

                    if (current.depth >= 64) this.inspectionLimit();

                    pending.push({
                        directory: path.join(current.directory, entry.name),
                        depth: current.depth + 1,
                    });
                }
            } catch (error) {
                if (this.errorCode(error) !== 'ENOENT') throw error;
            }
        }
    }

    private inspectionLimit(): never {
        throw new AiError(
            'configuration',
            'Profile ownership inspection exceeded its bounded directory budget.',
        );
    }

    private markerOwner(marker: unknown): string {
        if (
            !marker ||
            typeof marker !== 'object' ||
            !('schemaVersion' in marker) ||
            marker.schemaVersion !== 1 ||
            !('id' in marker) ||
            !('applicationId' in marker) ||
            !('accountId' in marker) ||
            !('driverId' in marker) ||
            !('paths' in marker) ||
            !marker.paths ||
            typeof marker.paths !== 'object' ||
            Array.isArray(marker.paths) ||
            [marker.id, marker.applicationId, marker.accountId, marker.driverId].some(
                (value) => typeof value !== 'string' || !value.trim() || value.length > 1024,
            )
        ) {
            throw new AiError('configuration', 'A profile ownership marker is unsupported.');
        }

        const identity = JSON.stringify([marker.applicationId, marker.driverId, marker.accountId]);

        return JSON.stringify([marker.id, identity]);
    }

    private async assertAncestorOwnership(directory: string, owner: string): Promise<void> {
        for (
            let parent = path.dirname(directory);
            parent !== path.dirname(parent);
            parent = path.dirname(parent)
        ) {
            try {
                const marker = await this.readMarker(path.join(parent, '.synapse-profile.json'));

                if (this.markerOwner(marker) !== owner) {
                    throw new AiError(
                        'configuration',
                        'A profile cannot be nested in another account profile.',
                    );
                }
            } catch (error) {
                if (this.errorCode(error) !== 'ENOENT') throw error;
            }
        }
    }

    private async readMarker(file: string): Promise<unknown> {
        const metadata = await lstat(file);

        if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 131072) {
            throw new AiError(
                'configuration',
                'The profile ownership marker is invalid or too large.',
            );
        }

        const value: unknown = JSON.parse(await readFile(file, 'utf8'));

        return value;
    }

    private errorCode(error: unknown): string | undefined {
        return error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof error.code === 'string'
            ? error.code
            : undefined;
    }

    // #endregion
}
