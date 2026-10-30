// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import type { ICodexCredentialSnapshot } from '../interfaces/ICodexCredentialSnapshot.js';
import { readCodexCredentialFile } from './readCodexCredentialFile.js';

// #endregion

/**
 * Preserves a native token refresh only if its original same-profile credentials still match.
 *
 * @param snapshot - Owned snapshot and baseline from prepareCodexCredentials.
 * @returns Completion after any safe atomic credential refresh is persisted.
 * @throws An AiError for native refresh persistence failures; callers must not retry inference.
 *
 * @public
 */
export async function commitCodexCredentials(snapshot: ICodexCredentialSnapshot): Promise<void> {
    if (!snapshot.baseline) return;

    let source: Buffer;
    let updated: Buffer;

    try {
        [source, updated] = await Promise.all([
            readCodexCredentialFile(snapshot.source),
            readCodexCredentialFile(snapshot.target),
        ]);
    } catch (cause) {
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
            return;

        throw new AiError('persistence', 'Could not preserve refreshed Codex credentials.', {
            cause,
        });
    }

    const digest = (value: Buffer): string => createHash('sha256').update(value).digest('hex');

    if (digest(source) !== snapshot.baseline || digest(updated) === snapshot.baseline) return;

    let parsed: unknown;

    try {
        parsed = JSON.parse(updated.toString('utf8'));
    } catch {
        throw new AiError('persistence', 'Codex wrote an invalid credential refresh.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new AiError('persistence', 'Codex wrote an invalid credential refresh.');

    const temporary = `${snapshot.source}.${randomUUID()}.tmp`;

    try {
        await writeFile(temporary, updated, { mode: 0o600 });
        await rename(temporary, snapshot.source);
    } catch (cause) {
        throw new AiError('persistence', 'Could not preserve refreshed Codex credentials.', {
            cause,
        });
    } finally {
        await rm(temporary, { force: true });
    }
}
