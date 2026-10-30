// #region Imports

import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { AiError } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Finds every target-project MCP key so ambient servers can be disabled before execution.
 *
 * @param directory - Explicit execution workspace, never searched during import.
 * @returns Bounded sorted names from ordinary, quoted, dotted and inline TOML tables.
 * @throws An AiError when configuration is oversized, invalid or cannot be inspected safely.
 *
 * @public
 */
export async function codexProjectMcpServers(directory: string): Promise<readonly string[]> {
    let configuration: string;

    try {
        configuration = await readConfiguration(join(directory, '.codex', 'config.toml'));
    } catch (cause) {
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
            return [];

        if (cause instanceof AiError) throw cause;

        throw new AiError('host', 'Could not inspect target Codex configuration.', { cause });
    }

    let parsed;

    try {
        parsed = parse(configuration);
    } catch {
        throw new AiError('configuration', 'Target Codex configuration is not valid TOML.');
    }

    const servers = parsed['mcp_servers'];

    if (servers === undefined) return [];

    if (
        !servers ||
        typeof servers !== 'object' ||
        Array.isArray(servers) ||
        servers instanceof Date
    ) {
        throw new AiError('configuration', 'Target Codex MCP configuration must be a table.');
    }

    const names = Object.keys(servers);

    if (names.length > 256)
        throw new AiError(
            'output-limit',
            'Target Codex configuration declares too many MCP servers.',
        );

    return names.sort();
}

async function readConfiguration(path: string): Promise<string> {
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
                'Target Codex configuration exceeds the inspection limit.',
            );

        return buffer.subarray(0, offset).toString('utf8');
    } finally {
        await handle.close();
    }
}
