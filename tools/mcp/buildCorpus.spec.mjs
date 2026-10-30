// #region Imports

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCorpus } from './buildCorpus.mjs';
import { DocsLoader } from './src/services/DocsLoader.js';

// #endregion

const owned = [];
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

afterEach(async () => {
    await Promise.all(
        owned.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

async function write(file, content) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
}

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'synapse-mcp-corpus-source-'));
    const packed = await mkdtemp(join(tmpdir(), 'synapse-mcp-corpus-packed-'));

    owned.push(root, packed);

    const index = { schemaVersion: 1, linkBase: '.docs/', packages: [], entries: [] };

    for (const [number, slug] of packageNames.entries()) {
        const name = `@pixel-brewery/${slug}`;
        const api = `packages/${slug}/api/index.md`;

        await write(
            join(root, 'libs', slug, 'package.json'),
            JSON.stringify({
                name,
                version: '0.1.0',
                description: `Fixture package ${number}.`,
                keywords: ['cli', 'fixture'],
            }),
        );
        await write(
            join(root, 'libs', slug, 'README.md'),
            `# Fixture ${number}\n\nCanonical overview.`,
        );
        await write(
            join(root, '.docs', api),
            `# Package ${number}\n\nGenerated public entry point.`,
        );
        await write(
            join(root, '.docs', 'packages', slug, 'api', 'classes', 'FixtureRuntime.md'),
            '# Class: FixtureRuntime\n\nNested cleanup confirmation method.',
        );
        await write(
            join(root, '.docs', 'packages', slug, 'api', 'interfaces', 'IFixtureOptions.md'),
            '# Interface: IFixtureOptions\n\nExplicit resource bounds.',
        );
        await write(
            join(root, '.docs', 'packages', slug, 'api', 'functions', 'fixtureRun.md'),
            '# Function: fixtureRun\n\nAn indexed public function.',
        );

        index.packages.push({
            name,
            version: '0.1.0',
            entryPoints: [{ importPath: name, api, exports: ['fixtureRun'] }],
        });
        index.entries.push({
            packageName: name,
            name: 'fixtureRun',
            link: `packages/${slug}/api/functions/fixtureRun.md`,
        });
    }

    await write(join(root, '.docs', 'api', 'api-index.json'), JSON.stringify(index));
    await write(
        join(root, '.docs', 'guides', 'consumers.md'),
        '# Consumer guide\n\nExplicit runtime composition.',
    );
    await write(
        join(root, '.docs', 'architecture', 'streaming.md'),
        '# Streaming\n\nBounded observation and result completion.',
    );

    for (const name of patternNames)
        await write(
            join(root, '.docs', 'patterns', `${name}-pattern.md`),
            `# ${name} pattern\n\nSynapse-specific ${name} guidance.`,
        );

    return { root, packed, index, output: join(packed, 'dist', 'data', 'corpus.json') };
}

describe('documentation corpus builder', () => {
    it('ships recursive checked API pages and authored documents independently of the checkout', async () => {
        // Arrange
        const selected = await fixture();

        // Act
        const result = await buildCorpus(selected);

        await rm(selected.root, { recursive: true, force: true });

        const corpus = await new DocsLoader(pathToFileURL(selected.output)).load();

        // Assert
        expect(result).toEqual({ packages: 9, guides: 2, patterns: 9 });
        expect(corpus.packages[0].apiContent).toContain('Nested cleanup confirmation method.');
        expect(corpus.packages[0].apiContent).toContain('Interface: IFixtureOptions');
        expect(corpus.packages[0].apiContent).toContain('Function: fixtureRun');
        expect(corpus.packages[0].overview).toContain('Canonical overview.');
        expect(corpus.guides.map((entry) => entry.name)).toEqual([
            'consumers',
            'architecture-streaming',
        ]);
        expect(corpus.patterns.map((entry) => entry.name).sort()).toEqual(
            patternNames.map((name) => `${name}-pattern`).sort(),
        );
        expect(JSON.stringify(corpus)).not.toContain(selected.root);
        expect(JSON.stringify(corpus)).not.toContain(selected.packed);
    });

    it('builds deterministic bytes and rejects a stale check without repairing it', async () => {
        // Arrange
        const selected = await fixture();

        await buildCorpus(selected);

        const initial = await readFile(selected.output, 'utf8');

        // Act
        await buildCorpus(selected);
        await buildCorpus({ ...selected, check: true });

        // Assert
        expect(await readFile(selected.output, 'utf8')).toBe(initial);

        await writeFile(selected.output, `${initial} `);

        await expect(buildCorpus({ ...selected, check: true })).rejects.toThrow('stale');
        expect(await readFile(selected.output, 'utf8')).toBe(`${initial} `);
    });

    it.each(['version', 'missing-page', 'traversal'])(
        'rejects inconsistent generated metadata before replacing a good payload: %s',
        async (change) => {
            // Arrange
            const selected = await fixture();

            await buildCorpus(selected);

            const previous = await readFile(selected.output, 'utf8');

            if (change === 'version') selected.index.packages[0].version = '9.0.0';
            else if (change === 'missing-page')
                selected.index.entries[0].link = 'packages/synapse-auth/api/functions/missing.md';
            else selected.index.packages[0].entryPoints[0].api = '../../outside.md';

            await writeFile(
                join(selected.root, '.docs', 'api', 'api-index.json'),
                JSON.stringify(selected.index),
            );

            // Act
            const result = buildCorpus(selected);

            // Assert
            await expect(result).rejects.toThrow();
            expect(await readFile(selected.output, 'utf8')).toBe(previous);
        },
    );

    it.each(['oversized', 'invalid-utf8', 'checkout-path'])(
        'rejects unsafe document data before writing a payload: %s',
        async (change) => {
            // Arrange
            const selected = await fixture();
            const file = join(selected.root, '.docs', 'guides', 'consumers.md');
            const content =
                change === 'oversized'
                    ? 'x'.repeat(256 * 1024 + 1)
                    : change === 'invalid-utf8'
                      ? new Uint8Array([0xc3, 0x28])
                      : `# Private path\n\n${selected.root}`;

            await writeFile(file, content);

            // Act
            const result = buildCorpus(selected);

            // Assert
            await expect(result).rejects.toThrow();
            await expect(readFile(selected.output)).rejects.toMatchObject({ code: 'ENOENT' });
        },
    );

    it.skipIf(process.platform === 'win32')(
        'rejects documentation symlinks instead of bundling external files',
        async () => {
            // Arrange
            const selected = await fixture();
            const outside = join(selected.packed, 'outside.md');

            await writeFile(outside, '# External data');
            await symlink(outside, join(selected.root, '.docs', 'guides', 'external.md'));

            // Act
            const result = buildCorpus(selected);

            // Assert
            await expect(result).rejects.toThrow('symlinks');
            await expect(readFile(selected.output)).rejects.toMatchObject({ code: 'ENOENT' });
        },
    );
});
