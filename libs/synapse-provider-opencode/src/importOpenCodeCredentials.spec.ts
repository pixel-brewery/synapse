// #region Imports

import type { IAiInstance } from '@pixel-brewery/synapse-core';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importOpenCodeCredentials } from './importOpenCodeCredentials.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(): Promise<{ root: string; selected: IAiInstance }> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-opencode-import-'));

    owned.push(root);

    return {
        root,
        selected: {
            id: 'i',
            driverId: 'opencode',
            profile: {
                id: 'p',
                applicationId: 'app',
                accountId: 'account',
                paths: {
                    root,
                    home: join(root, 'home'),
                    configuration: join(root, 'config'),
                    credentials: join(root, 'credentials'),
                    execution: join(root, 'execution'),
                    temporary: join(root, 'tmp'),
                },
            },
        },
    };
}

describe('importOpenCodeCredentials', () => {
    it('copies a selected native credential file without changing its source', async () => {
        // Arrange
        const { root, selected } = await fixture();
        const source = join(root, 'selected-auth.json');
        const content =
            '{"openai":{"type":"oauth","access":"synthetic-token","refresh":"synthetic-refresh","expires":9999999999999}}';

        await writeFile(source, content);

        // Act
        await importOpenCodeCredentials(source, selected);

        // Assert
        const target = join(selected.profile.paths.home, '.local/share/opencode/auth.json');

        expect(await readFile(target, 'utf8')).toBe(content);
        expect(await readFile(source, 'utf8')).toBe(content);

        if (process.platform !== 'win32') expect((await stat(target)).mode & 0o777).toBe(0o600);
    });
    it('rejects malformed credentials before creating destination account state', async () => {
        // Arrange
        const { root, selected } = await fixture();
        const source = join(root, 'selected-auth.json');

        await writeFile(source, 'not-json');

        // Act
        const result = importOpenCodeCredentials(source, selected);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'host' });
        await expect(
            stat(join(selected.profile.paths.home, '.local/share/opencode/auth.json')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
