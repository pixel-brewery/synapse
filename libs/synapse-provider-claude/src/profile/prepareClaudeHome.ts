// #region Imports

import { AiError, type IAiInstance } from '@pixel-brewery/synapse-core';
import { homedir } from 'node:os';
import { lstat, mkdir, readlink, symlink, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// #endregion

/**
 * Makes profile-specific native secure storage use the existing macOS login keychain.
 *
 * @param instance - Isolated application/account home and configuration identity.
 * @returns Completion of explicit OS-keychain path preparation; other platforms do nothing.
 * @throws An AiError when required path preparation fails.
 * @remarks Only OS keychain routing is shared. Native services stay account-specific through CLAUDE_SECURESTORAGE_CONFIG_DIR; no credential values or unrelated CLI configuration are copied.
 *
 * @public
 */
export async function prepareClaudeHome(instance: IAiInstance): Promise<void> {
    if (process.platform !== 'darwin') return;

    const realHome = homedir();
    const isolatedHome = instance.profile.paths.home;

    if (!realHome || resolve(realHome) === resolve(isolatedHome)) return;

    for (const suffix of [
        ['Library', 'Keychains'],
        ['Library', 'Preferences', 'com.apple.security.plist'],
    ]) {
        const source = join(realHome, ...suffix);
        const target = join(isolatedHome, ...suffix);

        try {
            await lstat(source);
        } catch (cause) {
            if (missing(cause)) continue;

            throw new AiError('host', 'Could not inspect native Claude secure storage.', { cause });
        }

        try {
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });

            let current;

            try {
                current = await lstat(target);
            } catch (cause) {
                if (!missing(cause)) throw cause;
            }

            // Preserve real profile content; native file-based storage remains available.
            if (current?.isSymbolicLink()) {
                if (resolve(dirname(target), await readlink(target)) === resolve(source)) continue;

                await unlink(target);
            } else if (current) continue;

            await symlink(source, target);
        } catch (cause) {
            throw new AiError('host', 'Could not prepare native Claude secure storage.', { cause });
        }
    }
}

function missing(cause: unknown): boolean {
    return Boolean(
        cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT',
    );
}
