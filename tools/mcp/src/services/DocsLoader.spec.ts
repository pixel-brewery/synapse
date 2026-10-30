// #region Imports

import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { DocsLoader } from './DocsLoader.js';

// #endregion

const owned: string[] = [];
const packageNames = [
    'synapse-auth',
    'synapse-core',
    'synapse-provider-acp',
    'synapse-provider-claude',
    'synapse-provider-codex',
    'synapse-provider-opencode',
    'synapse-routing',
    'synapse-runtime',
    'synapse-testing',
];
const patternNames = [
    'config',
    'dto',
    'error-handling',
    'guard',
    'mapping',
    'module',
    'query',
    'repository',
    'testing',
];

afterEach(async () => {
    await Promise.all(
        owned.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

function corpus(): IKnowledgeCorpus {
    const document = {
        name: 'consumers',
        title: 'Consumers',
        description: 'Use Synapse.',
        content: '# Consumers\n\nExplicit composition.',
        order: 0,
    };

    return {
        schemaVersion: 1,
        packages: packageNames.map((name) => ({
            name,
            packageName: `@pixel-brewery/${name}`,
            version: '0.1.0',
            title: 'Runtime',
            description: 'Bounded execution.',
            overview: '# Runtime',
            apiContent: '# AiRuntime\n\nNative cleanup confirmation.',
            tags: [],
        })),
        guides: [document],
        patterns: patternNames.map((name) => ({ ...document, name: `${name}-pattern` })),
    };
}

async function fixture(value: unknown = corpus()): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'synapse-docs-loader-'));

    owned.push(directory);

    const file = join(directory, 'corpus.json');

    await writeFile(file, JSON.stringify(value));

    return file;
}

describe('DocsLoader', () => {
    it('reads one immutable self-contained revision once without depending on a source checkout', async () => {
        // Arrange
        const file = await fixture();
        const loader = new DocsLoader(pathToFileURL(file));

        // Act
        const [first, second] = await Promise.all([loader.load(), loader.load()]);

        await rm(file);

        const cached = await loader.load();

        // Assert
        expect(first).toBe(second);
        expect(cached).toBe(first);
        expect(first.packages[0]?.apiContent).toContain('Native cleanup confirmation.');
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.packages)).toBe(true);
        expect(Object.isFrozen(first.packages[0])).toBe(true);
        expect(Object.isFrozen(first.packages[0]?.tags)).toBe(true);
        expect(Object.isFrozen(first.guides[0])).toBe(true);
    });

    it.each([
        { name: 'unknown-version', value: { ...corpus(), schemaVersion: 2 } },
        {
            name: 'missing-one-package',
            value: { ...corpus(), packages: corpus().packages.slice(1) },
        },
        {
            name: 'missing-one-pattern',
            value: { ...corpus(), patterns: corpus().patterns.slice(1) },
        },
        {
            name: 'duplicate-package',
            value: { ...corpus(), packages: [...corpus().packages, ...corpus().packages] },
        },
        { name: 'unknown-property', value: { ...corpus(), sourceRoot: '/private/checkout' } },
        {
            name: 'malformed-package',
            value: {
                ...corpus(),
                packages: [{ ...corpus().packages[0], packageName: '@other/runtime' }],
            },
        },
        {
            name: 'non-finite-order',
            value: { ...corpus(), guides: [{ ...corpus().guides[0], order: 1.5 }] },
        },
        {
            name: 'excessive-documents',
            value: {
                ...corpus(),
                guides: Array.from({ length: 257 }, (_, index) => ({
                    ...corpus().guides[0],
                    name: `guide-${index}`,
                })),
            },
        },
    ])('rejects $name payloads without revealing their filesystem location', async ({ value }) => {
        // Arrange
        const file = await fixture(value);
        const loader = new DocsLoader(file);

        // Act
        const result = loader.load();

        // Assert
        await expect(result).rejects.toThrow('could not be loaded or validated');
        await expect(result).rejects.not.toThrow(file);
    });

    it.each(['oversized', 'invalid-utf8'] as const)(
        'rejects %s byte input within the file-read boundary',
        async (change) => {
            // Arrange
            const file = await fixture();

            await writeFile(
                file,
                change === 'oversized'
                    ? new Uint8Array(8 * 1024 * 1024 + 1)
                    : new Uint8Array([0xc3, 0x28]),
            );

            // Act
            const result = new DocsLoader(file).load();

            // Assert
            await expect(result).rejects.toThrow('could not be loaded or validated');
        },
    );

    it('rejects implicit locations before performing any read', () => {
        // Arrange / Act / Assert
        expect(() => new DocsLoader('data/corpus.json')).toThrow('absolute file location');
        expect(() => new DocsLoader(new URL('https://example.invalid/corpus.json'))).toThrow(
            'absolute file location',
        );
    });

    it.skipIf(process.platform === 'win32')(
        'rejects a symlink corpus instead of following it',
        async () => {
            // Arrange
            const target = await fixture();
            const linked = join(owned[0]!, 'linked.json');

            await symlink(target, linked);

            // Act
            const result = new DocsLoader(linked).load();

            // Assert
            await expect(result).rejects.toThrow('could not be loaded or validated');
        },
    );
});
