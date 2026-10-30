// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { Application } from 'typedoc';
import { generate } from './generate.mjs';

// #endregion

const fixtures = [];

afterEach(async () => {
    vi.restoreAllMocks();

    for (const fixture of fixtures.splice(0)) await rm(fixture, { recursive: true, force: true });
});

describe('generate', () => {
    it('documents native public import paths through portable TypeDoc globs and preserves authored guides', async () => {
        // Arrange
        const root = await fixture({ subpath: true });
        const guide = path.join(root, '.docs', 'guides', 'owned.md');
        const bootstrap = vi.spyOn(Application, 'bootstrapWithPlugins');

        await mkdir(path.dirname(guide), { recursive: true });
        await writeFile(guide, '# Authored guide\n');

        // Act
        const result = await generate({ root });

        // Assert
        expect(result).toEqual({ packages: 1, entryPoints: 2, exports: 2 });

        const entryPoints = new Set(
            bootstrap.mock.calls.flatMap(([options]) => options.entryPoints),
        );

        for (const entryPoint of entryPoints) {
            expect(entryPoint).not.toContain('\\');
        }

        expect(
            new Set(await Promise.all([...entryPoints].map((entry) => realpath(entry)))),
        ).toEqual(
            new Set(
                await Promise.all(
                    ['index.ts', 'alternate.ts'].map((entry) =>
                        realpath(path.join(root, 'libs', 'synapse-fixture', 'src', entry)),
                    ),
                ),
            ),
        );

        const index = JSON.parse(
            await readFile(path.join(root, '.docs', 'api', 'api-index.json'), 'utf8'),
        );

        expect(index.packages[0].entryPoints.map((entry) => entry.importPath)).toEqual([
            '@pixel-brewery/synapse-fixture',
            '@pixel-brewery/synapse-fixture/alternate',
        ]);
        expect(index.entries.map((entry) => entry.id)).toEqual([
            '@pixel-brewery/synapse-fixture#summarize',
            '@pixel-brewery/synapse-fixture/alternate#summarize',
        ]);
        expect(await readFile(guide, 'utf8')).toBe('# Authored guide\n');
        expect(JSON.stringify(index)).not.toContain(root);

        for (const entry of index.entries) {
            expect(
                await readFile(path.join(root, '.docs', entry.link.split('#')[0]), 'utf8'),
            ).toContain('summarize');
        }
    });

    it('checks deterministic output without rewriting a stale artifact', async () => {
        // Arrange
        const root = await fixture();

        await generate({ root });
        await generate({ root, mode: 'check' });

        const indexPath = path.join(root, '.docs', 'api', 'api-index.json');

        await writeFile(indexPath, 'stale\n');

        // Act
        const result = generate({ root, mode: 'check' });

        // Assert
        await expect(result).rejects.toThrow('Generated API documentation is stale');
        expect(await readFile(indexPath, 'utf8')).toBe('stale\n');
    });

    it('rejects undocumented public declarations rather than filtering them from the API', async () => {
        // Arrange
        const root = await fixture({ documented: false });

        // Act
        const result = generate({ root });

        // Assert
        await expect(result).rejects.toThrow('TypeDoc validation failed');
    });

    it('rejects a public export excluded from the reflection model', async () => {
        // Arrange
        const root = await fixture({ internal: true });

        // Act
        const result = generate({ root });

        // Assert
        await expect(result).rejects.toThrow('API reflection coverage differs from public exports');
    });

    it('requires documentation for public interface members', async () => {
        // Arrange
        const root = await fixture({ undocumentedMember: true });

        // Act
        const result = generate({ root });

        // Assert
        await expect(result).rejects.toThrow('TypeDoc validation failed');
    });

    it('rejects a missing exported source entry point', async () => {
        // Arrange
        const root = await fixture();

        await rm(path.join(root, 'libs', 'synapse-fixture', 'src', 'index.ts'));

        // Act
        const result = generate({ root });

        // Assert
        await expect(result).rejects.toThrow('Public export has no matching source entry point');
    });

    it('fails unresolved TSDoc links during validation', async () => {
        // Arrange
        const root = await fixture({ brokenLink: true });

        // Act
        const result = generate({ root });

        // Assert
        await expect(result).rejects.toThrow('TypeDoc validation failed');
    });

    it('refuses output symlinks and preserves the linked directory', async () => {
        // Arrange
        const root = await fixture();
        const owned = path.join(root, 'owned');

        await mkdir(owned);
        await writeFile(path.join(owned, 'retained.txt'), 'retained\n');
        await mkdir(path.join(root, '.docs'));
        await symlink(
            owned,
            path.join(root, '.docs', 'api'),
            process.platform === 'win32' ? 'junction' : 'dir',
        );

        // Act
        const result = generate({ root });

        // Assert
        await expect(result).rejects.toThrow(
            'Documentation output cannot traverse a symbolic link',
        );
        expect(await readFile(path.join(owned, 'retained.txt'), 'utf8')).toBe('retained\n');
    });

    it('uses configured ambient Node types without exposing Node dependencies in the public API', async () => {
        // Arrange
        const root = await fixture({ nodeTypes: true });

        // Act
        const result = await generate({ root });

        // Assert
        expect(result.exports).toBe(1);

        const document = await readFile(
            path.join(root, '.docs/packages/synapse-fixture/api/functions/summarize.md'),
            'utf8',
        );

        expect(document).toContain('Text to normalize.');
    });

    it('retains deeply nested union contracts without requiring unsupported anonymous URLs', async () => {
        // Arrange
        const root = await fixture({ anonymous: true });

        // Act
        const result = await generate({ root });

        // Assert
        expect(result.exports).toBe(2);

        const reflection = await readFile(
            path.join(root, '.docs/api/synapse-fixture/reflection.json'),
            'utf8',
        );

        expect(reflection).toContain('Nested result text.');

        const document = await readFile(
            path.join(root, '.docs/packages/synapse-fixture/api/type-aliases/Status.md'),
            'utf8',
        );

        expect(document).toContain('Intersected lifecycle variants.');
        expect(document).toContain('Nested result text.');
        expect(document).toContain('Status[state="ready"].result.text');
    });

    it('links resolved package and subpath symbols with the same name to their actual public owners', async () => {
        // Arrange
        const root = await linkedFixture();

        // Act
        const result = await generate({ root });

        await generate({ root, mode: 'check' });

        // Assert
        expect(result).toEqual({ packages: 2, entryPoints: 3, exports: 3 });

        const document = await readFile(
            path.join(root, '.docs/packages/synapse-consumer/api/functions/select.md'),
            'utf8',
        );

        expect(document).toContain('../../../synapse-base/api/interfaces/IValue.md');
        expect(document).toContain(
            '../../../synapse-base/api/subpaths/alternate/interfaces/IValue.md',
        );
        expect(document).not.toContain('synapse-api:');

        const reflection = await readFile(
            path.join(root, '.docs/api/synapse-consumer/reflection.json'),
            'utf8',
        );

        expect(reflection).toContain(
            '"externalUrl": "packages/synapse-base/api/interfaces/IValue.md"',
        );
        expect(reflection).toContain(
            '"externalUrl": "packages/synapse-base/api/subpaths/alternate/interfaces/IValue.md"',
        );
        expect(reflection).not.toContain(root);
        expect(reflection).not.toContain('synapse-api:');
    });
});

async function fixture({
    subpath = false,
    documented = true,
    internal = false,
    brokenLink = false,
    undocumentedMember = false,
    nodeTypes = false,
    anonymous = false,
} = {}) {
    const root = await mkdtemp(path.join(tmpdir(), 'synapse-api-fixture-'));

    fixtures.push(root);

    const library = path.join(root, 'libs', 'synapse-fixture');

    await mkdir(path.join(library, 'src'), { recursive: true });
    await writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({ private: true, type: 'module' }),
    );

    const exports = {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
        ...(subpath
            ? { './alternate': { types: './dist/alternate.d.ts', import: './dist/alternate.js' } }
            : {}),
    };

    await writeFile(
        path.join(library, 'package.json'),
        JSON.stringify({
            name: '@pixel-brewery/synapse-fixture',
            version: '0.1.0',
            type: 'module',
            exports,
        }),
    );
    await writeFile(
        path.join(library, 'tsconfig.lib.json'),
        JSON.stringify({
            compilerOptions: {
                target: 'ES2023',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                strict: true,
                rootDir: 'src',
                outDir: 'dist',
                types: nodeTypes ? ['node'] : [],
                ...(nodeTypes
                    ? {
                          typeRoots: [
                              fileURLToPath(new URL('../../node_modules/@types', import.meta.url)),
                          ],
                      }
                    : {}),
                skipLibCheck: true,
            },
            include: ['src/**/*.ts'],
        }),
    );

    const comment = documented
        ? `/**
 * Summarizes an input value for an API integration example.${brokenLink ? ' See {@link MissingSymbol}.' : ''}
 * @${internal ? 'internal' : 'public'}
 * @param value - Text to normalize.
 * @returns Trimmed text.
 */\n`
        : '';

    await writeFile(
        path.join(library, 'src', 'summarize.ts'),
        `${comment}export function summarize(value: string): string { return ${nodeTypes ? 'Buffer.from(value).toString().trim()' : 'value.trim()'}; }\n`,
    );
    await writeFile(
        path.join(library, 'src', 'index.ts'),
        "export { summarize } from './summarize.js';\n" +
            (undocumentedMember
                ? `
/** Describes a metadata value that is returned to consumers. @public */
export interface IMetadata { readonly value: string; }
`
                : ''),
    );

    if (anonymous) {
        await writeFile(
            path.join(library, 'src', 'Status.ts'),
            `
/** Intersected lifecycle variants. @public */
export type Status = {
  /** Stable request identity. */
  readonly id: string;
} & ({
  /** Completed variant. */
  readonly state: 'ready';
  /** Completed output. */
  readonly result: {
    /** Nested result text. */
    readonly text: string;
  };
} | {
  /** Pending variant. */
  readonly state: 'pending';
});
`,
        );
        await writeFile(
            path.join(library, 'src', 'index.ts'),
            "export { summarize } from './summarize.js';\nexport type { Status } from './Status.js';\n",
        );
    }

    if (subpath)
        await writeFile(
            path.join(library, 'src', 'alternate.ts'),
            "export { summarize } from './summarize.js';\n",
        );

    return root;
}

async function linkedFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'synapse-linked-api-fixture-'));

    fixtures.push(root);
    await writeFile(
        path.join(root, 'package.json'),
        JSON.stringify({ private: true, type: 'module' }),
    );

    const base = await linkedLibrary(
        root,
        'synapse-base',
        {
            'index.ts': "export type { IValue } from './IValue.js';\n",
            'IValue.ts':
                '/** Root input. @public */\nexport interface IValue {\n/** Root text. */\nreadonly root: string;\n}\n',
            'alternate.ts': "export type { IValue } from './alternate/IValue.js';\n",
            'alternate/IValue.ts':
                '/** Alternate input. @public */\nexport interface IValue {\n/** Alternate text. */\nreadonly alternate: string;\n}\n',
        },
        true,
    );
    const read = ts.readConfigFile(path.join(base, 'tsconfig.lib.json'), ts.sys.readFile);
    const config = ts.parseJsonConfigFileContent(read.config, ts.sys, base);
    const program = ts.createProgram(config.fileNames, config.options);

    expect(ts.getPreEmitDiagnostics(program)).toHaveLength(0);
    expect(program.emit().emitSkipped).toBe(false);

    const scope = path.join(root, 'node_modules', '@pixel-brewery');

    await mkdir(scope, { recursive: true });
    await symlink(
        base,
        path.join(scope, 'synapse-base'),
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    await linkedLibrary(root, 'synapse-consumer', {
        'index.ts': "export { select } from './select.js';\n",
        'select.ts': `import type { IValue } from '@pixel-brewery/synapse-base';
import type { IValue as IAlternateValue } from '@pixel-brewery/synapse-base/alternate';
/**
 * Selects the first input. See {@link @pixel-brewery/synapse-base!IValue}.
 * @public
 * @param first - Root input.
 * @param second - Alternative subpath input with the same declaration name.
 * @returns The root input.
 */
export function select(first: IValue, second: IAlternateValue): IValue { void second; return first; }
`,
    });

    return root;
}

async function linkedLibrary(root, slug, sources, subpath = false) {
    const library = path.join(root, 'libs', slug);

    for (const [file, source] of Object.entries(sources)) {
        await mkdir(path.dirname(path.join(library, 'src', file)), { recursive: true });
        await writeFile(path.join(library, 'src', file), source);
    }

    await writeFile(
        path.join(library, 'package.json'),
        JSON.stringify({
            name: `@pixel-brewery/${slug}`,
            version: '0.1.0',
            type: 'module',
            exports: {
                '.': { types: './dist/index.d.ts', import: './dist/index.js' },
                ...(subpath
                    ? {
                          './alternate': {
                              types: './dist/alternate.d.ts',
                              import: './dist/alternate.js',
                          },
                      }
                    : {}),
            },
        }),
    );
    await writeFile(
        path.join(library, 'tsconfig.lib.json'),
        JSON.stringify({
            compilerOptions: {
                target: 'ES2023',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                strict: true,
                rootDir: 'src',
                outDir: 'dist',
                types: [],
                declaration: true,
                declarationMap: true,
                skipLibCheck: true,
            },
            include: ['src/**/*.ts'],
        }),
    );

    return library;
}
