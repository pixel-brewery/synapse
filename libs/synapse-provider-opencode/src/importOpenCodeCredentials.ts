// #region Imports

import { AiError, type IAiInstance } from '@pixel-brewery/synapse-core';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isOpenCodeCredential } from './isOpenCodeCredential.js';

// #endregion

/**
 * Explicitly copies a native OpenCode credential file into one isolated application profile.
 *
 * @param sourceFile - Exact user-selected existing auth.json file; never discovered automatically.
 * @param instance - Destination application/account profile.
 * @returns Completion after a validated private temporary file is atomically renamed into place.
 * @throws An AiError for invalid files, oversized data or host filesystem failure.
 * @remarks This is a host-triggered credential mutation. Call it through the shared coordinator's `credentialChange(instance.profile, action)` to drain affected executions and invalidate their persistent session generation before copying credentials.
 *
 * @public
 */
export async function importOpenCodeCredentials(
    sourceFile: string,
    instance: IAiInstance,
): Promise<void> {
    const target = join(instance.profile.paths.home, '.local', 'share', 'opencode', 'auth.json');
    const temporary = `${target}.importing-${randomUUID()}`;

    try {
        const input = await open(sourceFile, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        let data: string;

        try {
            const metadata = await input.stat();

            if (!metadata.isFile() || metadata.size > 2 * 1024 * 1024)
                throw new AiError(
                    'configuration',
                    'The selected OpenCode credential file is invalid or too large.',
                );

            const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
            let length = 0;

            while (length < buffer.length) {
                const chunk = await input.read(buffer, length, buffer.length - length, null);

                if (!chunk.bytesRead) break;

                length += chunk.bytesRead;
            }

            if (length > 2 * 1024 * 1024)
                throw new AiError(
                    'configuration',
                    'OpenCode credential data exceeded its read limit.',
                );

            data = buffer.toString('utf8', 0, length);
        } finally {
            await input.close();
        }

        const parsed: unknown = JSON.parse(data);

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
            throw new AiError(
                'configuration',
                'The selected OpenCode credential file is not an object.',
            );

        if (!Object.keys(parsed).length || !Object.values(parsed).every(isOpenCodeCredential))
            throw new AiError(
                'configuration',
                'The selected file contains no complete native OpenCode credentials.',
            );

        await mkdir(dirname(target), { recursive: true, mode: 0o700 });

        const output = await open(temporary, 'wx', 0o600);

        try {
            await output.writeFile(data, 'utf8');
            await output.sync();
        } finally {
            await output.close();
        }

        await rename(temporary, target);
    } catch (cause) {
        if (cause instanceof AiError) throw cause;

        throw new AiError(
            'host',
            'OpenCode credentials could not be imported into the selected profile.',
            { cause },
        );
    } finally {
        await rm(temporary, { force: true });
    }
}
