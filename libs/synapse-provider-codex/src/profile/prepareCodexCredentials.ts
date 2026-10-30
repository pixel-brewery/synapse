// #region Imports

import { AiError, type IAiInstance } from '@pixel-brewery/synapse-core';
import { lstat, mkdir, readFile, readlink, rename, rm, writeFile, chmod } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import type { ICodexCredentialSnapshot } from '../interfaces/ICodexCredentialSnapshot.js';
import { readCodexCredentialFile } from './readCodexCredentialFile.js';

// #endregion

/**
 * Creates an owned same-profile auth snapshot without Windows symlink privileges.
 *
 * @param instance - Account whose native credentials may be copied.
 * @param inspection - Whether to use separate metadata-only native state.
 * @returns Snapshot metadata for a later compare-and-swap refresh commit.
 * @throws An AiError if an unmanaged authentication file would be overwritten.
 *
 * @public
 */
export async function prepareCodexCredentials(
    instance: IAiInstance,
    inspection = false,
): Promise<ICodexCredentialSnapshot> {
    const home = join(instance.profile.paths.execution, inspection ? 'inspection' : 'codex');
    const source = join(instance.profile.paths.credentials, 'auth.json');
    const target = join(home, 'auth.json');
    const marker = join(home, '.synapse-auth-owner.json');

    await mkdir(home, { recursive: true, mode: 0o700 });

    if (resolve(source) === resolve(target)) return { home, source, target };

    let current;

    try {
        current = await lstat(target);
    } catch (cause) {
        if (!missing(cause))
            throw new AiError('host', 'Could not inspect Codex profile credentials.', { cause });
    }

    if (current?.isSymbolicLink()) {
        const linked = resolve(dirname(target), await readlink(target));

        if (linked !== resolve(source))
            throw new AiError(
                'configuration',
                'Codex execution credentials belong to a different profile.',
            );

        await rm(target);
    } else if (current) {
        let owner: unknown;

        try {
            owner = JSON.parse(await readFile(marker, 'utf8'));
        } catch {
            throw new AiError(
                'configuration',
                'Codex execution authentication is not a managed snapshot.',
            );
        }

        if (
            !owner ||
            typeof owner !== 'object' ||
            !('profileId' in owner) ||
            owner.profileId !== instance.profile.id ||
            !('source' in owner) ||
            owner.source !== resolve(source)
        )
            throw new AiError(
                'configuration',
                'Codex execution credentials belong to a different profile.',
            );
    }

    await writeFile(
        marker,
        JSON.stringify({ profileId: instance.profile.id, source: resolve(source) }),
        { mode: 0o600 },
    );

    let credential: Buffer;

    try {
        credential = await readCodexCredentialFile(source);
    } catch (cause) {
        if (cause instanceof AiError) throw cause;

        if (!missing(cause))
            throw new AiError('host', 'Could not read Codex profile credentials.', { cause });

        if (current) await rm(target, { force: true });

        return { home, source, target };
    }

    const temporary = `${target}.${randomUUID()}.tmp`;

    try {
        await writeFile(temporary, credential, { mode: 0o600 });
        await chmod(temporary, 0o600);
        await rename(temporary, target);
    } finally {
        await rm(temporary, { force: true });
    }

    return { home, source, target, baseline: digest(credential) };
}

function missing(cause: unknown): boolean {
    return Boolean(
        cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT',
    );
}

function digest(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}
