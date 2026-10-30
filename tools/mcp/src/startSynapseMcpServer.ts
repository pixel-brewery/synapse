// #region Imports

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { DocsLoader } from './services/DocsLoader.js';
import { SynapseMcpServer } from './SynapseMcpServer.js';

// #endregion

/**
 * Explicitly loads this installed package's metadata and corpus, then serves one owned stdio session.
 *
 * @returns Completion after EOF, a termination signal or transport closure and bounded cleanup.
 * @throws An Error when installed metadata/corpus is invalid, startup fails, a stream breaks or cleanup cannot finish.
 * @remarks Paths are relative to this module, so npm/Yarn launch symlinks and arbitrary working directories do not trigger checkout discovery. Only this explicit operation registers process and stream lifecycle listeners.
 *
 * @internal
 */
export async function startSynapseMcpServer(): Promise<void> {
    const raw: unknown = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const metadata = z
        .object({
            name: z.literal('@pixel-brewery/synapse-mcp'),
            version: z.string().min(1).max(128),
        })
        .passthrough()
        .safeParse(raw);

    if (!metadata.success)
        throw new Error('The installed Synapse MCP package metadata is invalid.');

    const corpus = await new DocsLoader().load();
    const server = new SynapseMcpServer(corpus, metadata.data.version);
    const transport = new StdioServerTransport(process.stdin, process.stdout, {
        maxBufferSize: 65_536,
    });
    let failure: Error | undefined;
    const close = (): void => {
        void server.dispose().catch((cause: unknown) => {
            failure ??=
                cause instanceof Error ? cause : new Error('The MCP transport could not close.');
        });
    };
    const brokenStream = (): void => {
        failure ??= new Error('The MCP stdio stream closed unexpectedly.');
        close();
    };

    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    process.stdin.once('end', close);
    process.stdin.once('close', close);
    process.stdin.once('error', brokenStream);
    process.stdout.once('error', brokenStream);

    try {
        await server.connect(transport);

        if (process.stdin.readableEnded || process.stdin.destroyed) close();

        await server.closed;

        if (failure) throw failure;
    } finally {
        process.removeListener('SIGINT', close);
        process.removeListener('SIGTERM', close);
        process.stdin.removeListener('end', close);
        process.stdin.removeListener('close', close);
        process.stdin.removeListener('error', brokenStream);
        process.stdout.removeListener('error', brokenStream);

        await server.dispose();
    }
}
