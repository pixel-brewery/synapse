// #region Imports

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { codexProjectMcpServers } from './codexProjectMcpServers.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(configuration: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'synapse-codex-mcp-'));

    owned.push(root);
    await mkdir(join(root, '.codex'));
    await writeFile(join(root, '.codex/config.toml'), configuration);

    return root;
}

describe('codexProjectMcpServers', () => {
    it('discovers inline and quoted server names missed by section-only parsing', async () => {
        // Arrange
        const root = await fixture(
            'mcp_servers = { inline = { command = "never-start" }, "quoted.tool" = { command = "never-start" } }\n',
        );

        // Act
        const names = await codexProjectMcpServers(root);

        // Assert
        expect(names).toEqual(['inline', 'quoted.tool']);
    });
    it('rejects invalid TOML rather than launching with unexamined ambient servers', async () => {
        // Arrange
        const root = await fixture('[mcp_servers.bad\ncommand="never-start"\n');

        // Act
        const result = codexProjectMcpServers(root);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
    });
    it('bounds configuration reads before parsing native settings', async () => {
        // Arrange
        const root = await fixture('#' + 'x'.repeat(1_048_576));

        // Act
        const result = codexProjectMcpServers(root);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'output-limit' });
    });
});
