// #region Imports

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IKnowledgeCorpus } from './interfaces/IKnowledgeCorpus.js';
import { SynapseMcpServer } from './SynapseMcpServer.js';

// #endregion

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
const corpus: IKnowledgeCorpus = {
    schemaVersion: 1,
    packages: [
        {
            name: 'synapse-runtime',
            packageName: '@pixel-brewery/synapse-runtime',
            version: '0.1.0',
            title: 'Synapse runtime',
            description: 'Bounded execution and cleanup.',
            tags: ['runtime'],
            overview: '# Runtime overview\nExplicit host composition.',
            apiContent:
                '# AiRuntime\n## NestedOnlyContinuationMarker\nDocumented run and disposal contract.',
        },
    ],
    guides: [
        {
            name: 'consumers',
            title: 'Consumer composition',
            description: 'Host ownership.',
            order: 1,
            content: '# Consumers\nIsolated profile ownership is explicit.',
        },
    ],
    patterns: patternNames.map((name) => ({
        name: `${name}-pattern`,
        title: `${name} pattern`,
        description: 'Synapse-specific fixture.',
        order: 1,
        content: `# ${name} pattern\nSynapse fixture guidance for ${name}.`,
    })),
};

function text(result: unknown): string {
    return CallToolResultSchema.parse(result)
        .content.flatMap((entry) => (entry.type === 'text' ? [entry.text] : []))
        .join('\n');
}

describe('SynapseMcpServer', () => {
    let server: SynapseMcpServer;
    let client: Client;

    beforeEach(async () => {
        server = new SynapseMcpServer(corpus, '3.4.5');
        client = new Client({ name: 'synapse-memory-fixture', version: '1.0.0' });

        const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();

        await server.connect(serverTransport);
        await client.connect(clientTransport, { timeout: 3000 });
    });

    afterEach(async () => {
        try {
            await client.close();
        } finally {
            await server.dispose();
            vi.restoreAllMocks();
        }
    });

    it('advertises exactly the compatible fifteen read-only tools without execution capabilities', async () => {
        // Arrange
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
        const result = await client.listTools({}, { timeout: 3000 });

        // Assert
        expect(result.tools.map((tool) => tool.name).sort()).toEqual(expected.sort());
        expect(client.getServerVersion()).toMatchObject({ name: 'synapse-mcp', version: '3.4.5' });
        expect(client.getServerCapabilities()).not.toHaveProperty('resources');
        expect(client.getServerCapabilities()).not.toHaveProperty('prompts');

        for (const tool of result.tools)
            expect(tool.annotations).toMatchObject({
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            });
    });

    it('finds API-only member documentation and returns it with the complete package overview', async () => {
        // Arrange
        const requests = [
            { name: 'get-package-doc', arguments: { packageName: 'synapse-runtime' } },
            { name: 'search-docs', arguments: { query: 'nestedonlycontinuationmarker' } },
        ];

        // Act
        const results = await Promise.all(
            requests.map((request) => client.callTool(request, undefined, { timeout: 3000 })),
        );

        // Assert
        for (const result of results) {
            expect(result.isError).not.toBe(true);
            expect(text(result)).toContain('Runtime overview');
            expect(text(result)).toContain('NestedOnlyContinuationMarker');
        }
    });

    it.each([
        { name: 'get-package-doc', arguments: { packageName: 'missing-package' } },
        { name: 'get-guide', arguments: { guideName: '../../unowned-file' } },
        { name: 'missing-tool', arguments: {} },
        { name: 'get-package-doc', arguments: { packageName: 42 } },
        { name: 'search-docs', arguments: { query: ' ' } },
        { name: 'search-guides', arguments: { query: 'x'.repeat(257) } },
        { name: 'get-module-pattern', arguments: { bases: ['NotAnAbstractSeam'] } },
        {
            name: 'get-query-pattern',
            arguments: { fields: Array.from({ length: 65 }, () => 'field') },
        },
        { name: 'list-packages', arguments: { unexpected: true } },
    ])('reports invalid or unknown $name requests as tool errors', async (request) => {
        // Arrange
        const input = { ...request };

        // Act
        const result = await client.callTool(input, undefined, { timeout: 3000 });

        // Assert
        expect(result.isError).toBe(true);
        expect(text(result).length).toBeGreaterThan(0);
    });

    it.each([
        {
            name: 'get-query-pattern',
            arguments: { modelName: 'fixture-model', fields: ['summary'] },
            expected: 'outputSchema',
        },
        {
            name: 'get-repository-pattern',
            arguments: { modelName: 'ApplicationAccount', fields: ['id'] },
            expected: 'HostStorageProjection',
        },
        {
            name: 'get-mapping-pattern',
            arguments: { entityName: 'NativeRecord', fields: ['text'], responseName: 'HostResult' },
            expected: 'projectSelectedFields',
        },
        {
            name: 'get-module-pattern',
            arguments: { moduleName: 'HostComposition', bases: ['AiDriverBase'] },
            expected: 'new AiRuntime',
        },
    ])(
        'adds inert Synapse context to $name without replacing the authored pattern',
        async ({ name, arguments: arguments_, expected }) => {
            // Arrange
            const request = { name, arguments: arguments_ };

            // Act
            const result = await client.callTool(request, undefined, { timeout: 3000 });

            // Assert
            expect(result.isError).not.toBe(true);
            expect(text(result)).toContain('Synapse fixture guidance');
            expect(text(result)).toContain(expected);
        },
    );

    it('treats a search miss as an empty discovery outcome rather than an invalid tool call', async () => {
        // Arrange
        const request = { name: 'search-docs', arguments: { query: 'unrepresented-fixture-term' } };

        // Act
        const result = await client.callTool(request, undefined, { timeout: 3000 });

        // Assert
        expect(result.isError).not.toBe(true);
        expect(text(result)).not.toContain('Runtime overview');
    });

    it('shares concurrent cleanup and permanently rejects another transport after disposal', async () => {
        // Arrange
        const [replacement] = InMemoryTransport.createLinkedPair();

        // Act
        const first = server.dispose();
        const second = server.dispose();

        // Assert
        expect(first).toBe(second);
        await first;
        await expect(server.closed).resolves.toBeUndefined();
        await expect(server.connect(replacement)).rejects.toThrow('one transport');
    });
});
