// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { open } from 'node:fs/promises';

// #endregion

/**
 * Reads one native credential file with an actual one-MiB descriptor read bound.
 *
 * @param path - Explicit same-profile native credential file.
 * @returns The captured bytes used for both the snapshot and its baseline digest.
 * @throws An AiError for oversized native credentials; filesystem errors preserve their native code for the profile owner.
 *
 * @public
 */
export async function readCodexCredentialFile(path: string): Promise<Buffer> {
    const handle = await open(path, 'r');

    try {
        const buffer = Buffer.alloc(1_048_577);
        let offset = 0;

        while (offset < buffer.length) {
            const result = await handle.read(buffer, offset, buffer.length - offset, offset);

            if (!result.bytesRead) break;

            offset += result.bytesRead;
        }

        if (offset > 1_048_576)
            throw new AiError(
                'output-limit',
                'Codex native credentials exceed the supported byte bound.',
            );

        return Buffer.from(buffer.subarray(0, offset));
    } finally {
        await handle.close();
    }
}
