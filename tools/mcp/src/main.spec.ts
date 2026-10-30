// #region Imports

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// #endregion

const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const patternNames = [
    'query',
    'repository',
    'mapping',
    'module',
    'error-handling',
    'config',
    'guard',
    'dto',
    'testing',
];

function text(result: unknown): string {
    return CallToolResultSchema.parse(result)
        .content.flatMap((item) => (item.type === 'text' ? [item.text] : []))
        .join('\n');
}

async function withClient<T>(
    operation: (client: Client) => Promise<T>,
    executable = entry,
): Promise<{
    readonly value: T;
    readonly diagnostics: readonly string[];
    readonly stderr: string;
}> {
    const directory = await mkdtemp(join(tmpdir(), 'synapse-mcp-stdio-'));
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [executable],
        cwd: directory,
        stderr: 'pipe',
    });
    const client = new Client({ name: 'synapse-stdio-fixture', version: '1.0.0' });
    const diagnostics: string[] = [];
    let stderr = '';

    client.onerror = (cause) => diagnostics.push(cause.message);
    transport.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length);
    });

    try {
        await client.connect(transport, { timeout: 5000 });

        const value = await operation(client);

        await client.close();

        return { value, diagnostics, stderr };
    } finally {
        try {
            await client.close();
        } finally {
            await transport.close();
            await rm(directory, { recursive: true, force: true });
        }
    }
}

describe('Synapse MCP CLI stdio', () => {
    it('serves all fifteen actual documentation contracts from a foreign working directory', async () => {
        // Arrange
        const metadata: unknown = JSON.parse(
            await readFile(new URL('../package.json', import.meta.url), 'utf8'),
        );

        if (
            typeof metadata !== 'object' ||
            metadata === null ||
            !('version' in metadata) ||
            typeof metadata.version !== 'string'
        )
            throw new Error('The fixture package metadata has no version.');

        const expected = [
            'list-packages',
            'get-package-doc',
            'search-docs',
            'list-guides',
            'get-guide',
            'search-guides',
            ...patternNames.map((name) => `get-${name}-pattern`),
        ];

        // Act
        const report = await withClient(async (client) => {
            const listing = await client.listTools({}, { timeout: 5000 });
            const responses: { readonly name: string; readonly result: CallToolResult }[] = [];

            for (const tool of listing.tools) {
                const arguments_: Record<string, unknown> =
                    tool.name === 'get-package-doc'
                        ? { packageName: 'synapse-runtime' }
                        : tool.name === 'search-docs'
                          ? { query: 'cleanupIncomplete' }
                          : tool.name === 'get-guide'
                            ? { guideName: 'consumers' }
                            : tool.name === 'search-guides'
                              ? { query: 'profile' }
                              : {};
                const result = await client.callTool(
                    { name: tool.name, arguments: arguments_ },
                    undefined,
                    { timeout: 5000 },
                );

                responses.push({ name: tool.name, result: CallToolResultSchema.parse(result) });
            }

            return {
                listing,
                responses,
                version: client.getServerVersion(),
                capabilities: client.getServerCapabilities(),
            };
        });

        // Assert
        expect(report.value.listing.tools.map((tool) => tool.name).sort()).toEqual(expected.sort());
        expect(report.value.version).toMatchObject({
            name: 'synapse-mcp',
            version: metadata.version,
        });
        expect(report.value.capabilities).not.toHaveProperty('resources');
        expect(report.value.capabilities).not.toHaveProperty('prompts');

        for (const { result } of report.value.responses) {
            expect(result.isError).not.toBe(true);
            expect(text(result).length).toBeGreaterThan(0);
        }

        const packageResponse = report.value.responses.find(
            (response) => response.name === 'get-package-doc',
        );

        expect(packageResponse).toBeDefined();
        expect(text(packageResponse!.result)).toContain('Class: AiRuntime');
        expect(text(packageResponse!.result)).toContain('### run()');
        expect(text(packageResponse!.result)).toContain('### dispose()');
        expect(report.diagnostics).toEqual([]);
        expect(report.stderr).toBe('');
    });

    it('returns protocol tool errors for invalid input and unknown identities without reading outside its corpus', async () => {
        // Arrange
        const requests = [
            { name: 'get-package-doc', arguments: { packageName: 'missing-package' } },
            { name: 'get-guide', arguments: { guideName: '../../unowned-file' } },
            { name: 'get-package-doc', arguments: { packageName: 42 } },
            { name: 'get-module-pattern', arguments: { bases: ['InvalidSeam'] } },
            { name: 'missing-tool', arguments: {} },
        ];

        // Act
        const report = await withClient(async (client) =>
            Promise.all(
                requests.map((request) => client.callTool(request, undefined, { timeout: 5000 })),
            ),
        );

        // Assert
        expect(report.value.every((result) => result.isError === true)).toBe(true);
        expect(report.diagnostics).toEqual([]);
        expect(report.stderr).toBe('');
    });

    it.skipIf(process.platform === 'win32')(
        'resolves installed metadata and corpus through a POSIX package-manager launch symlink',
        async () => {
            // Arrange
            const directory = await mkdtemp(join(tmpdir(), 'synapse-mcp-bin-'));
            const launcher = join(directory, 'synapse-mcp');

            await symlink(entry, launcher);

            try {
                // Act
                const report = await withClient(
                    (client) => client.listTools({}, { timeout: 5000 }),
                    launcher,
                );

                // Assert
                expect(report.value.tools).toHaveLength(15);
                expect(report.diagnostics).toEqual([]);
                expect(report.stderr).toBe('');
            } finally {
                await rm(directory, { recursive: true, force: true });
            }
        },
    );

    it('exits cleanly on stdin EOF without adding non-protocol stdout or leaving a live session', async () => {
        // Arrange
        const directory = await mkdtemp(join(tmpdir(), 'synapse-mcp-eof-'));

        try {
            // Act
            const result = spawnSync(process.execPath, [entry], {
                cwd: directory,
                input: '',
                encoding: 'utf8',
                timeout: 5000,
                maxBuffer: 65_536,
            });

            // Assert
            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status).toBe(0);
            expect(result.stdout).toBe('');
            expect(result.stderr).toBe('');
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it('imports server and service modules with filesystem discovery, processes, network, timers and signal registration blocked', async () => {
        // Arrange
        const directory = await mkdtemp(join(tmpdir(), 'synapse-mcp-inert-'));
        const imports = [
            'SynapseMcpServer.js',
            'startSynapseMcpServer.js',
            'services/DocsLoader.js',
        ].map((name) => new URL(`../dist/${name}`, import.meta.url).href);
        const probe = fileURLToPath(new URL('../../packaging/importProbe.mjs', import.meta.url));
        const preload = [
            'const original = process.cwd;',
            'process.cwd = function (...arguments_) {',
            '    const caller = new Error().stack?.split("\\n").slice(2).find((line) => !line.includes("(node:path:") && !line.includes("(node:path/") && !line.includes("(node:fs:") && !line.includes("(node:fs/") && !line.includes("(node:events:"));',
            '    if (!caller?.includes("node:internal/")) throw new Error("Import-time effect rejected: process.cwd");',
            '    return Reflect.apply(original, this, arguments_);',
            '};',
        ].join('\n');
        const environment = { ...process.env };

        delete environment['FORCE_COLOR'];

        try {
            // Act
            const result = spawnSync(
                process.execPath,
                [
                    '--import',
                    `data:text/javascript,${encodeURIComponent(preload)}`,
                    probe,
                    JSON.stringify(imports),
                ],
                {
                    cwd: directory,
                    env: environment,
                    encoding: 'utf8',
                    timeout: 5000,
                    maxBuffer: 65_536,
                },
            );

            // Assert
            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.stderr).toBe('');
            expect(result.status).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({ imports: imports.length, effects: [] });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
});
