// #region Imports

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectPackage } from './inspectPackage.mjs';

// #endregion

const owned = [];

afterEach(async () => {
    await Promise.all(owned.splice(0).map((file) => rm(file, { recursive: true, force: true })));
});

async function fixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'synapse-manifest-'));

    owned.push(root);
    await mkdir(path.join(root, 'dist'));

    const manifest = {
        name: '@pixel-brewery/synapse-fixture',
        version: '0.1.0',
        type: 'module',
        sideEffects: false,
        license: 'MIT',
        exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
    };

    await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
    await writeFile(path.join(root, 'dist/index.js'), 'export const answer = 42;');
    await writeFile(path.join(root, 'dist/index.d.ts'), 'export declare const answer: number;');
    await writeFile(path.join(root, 'README.md'), '# Fixture');
    await writeFile(path.join(root, 'LICENSE'), 'MIT');

    return { root, manifest };
}

describe('packed package inspection', () => {
    it('resolves each advertised runtime and declaration module from installed contents', async () => {
        // Arrange
        const { root, manifest } = await fixture();

        // Act
        const inspected = await inspectPackage(root, manifest);

        // Assert
        expect(inspected.imports).toEqual([manifest.name]);
        expect(inspected.emittedModules).toBe(1);
    });
    it('rejects dependency aliases that cannot be installed outside the workspace', async () => {
        // Arrange
        const { root, manifest } = await fixture();

        await writeFile(
            path.join(root, 'package.json'),
            JSON.stringify({
                ...manifest,
                dependencies: { '@pixel-brewery/synapse-core': 'workspace:^' },
            }),
        );

        // Act / Assert
        await expect(inspectPackage(root, manifest)).rejects.toThrow('Workspace-local dependency');
    });
    it('rejects compiler state that would expose build-machine metadata in a public artifact', async () => {
        // Arrange
        const { root, manifest } = await fixture();

        await writeFile(path.join(root, 'dist/tsconfig.lib.tsbuildinfo'), '{}');

        // Act / Assert
        await expect(inspectPackage(root, manifest)).rejects.toThrow('compiler state');
    });
    it('rejects export paths outside the published output owner', async () => {
        // Arrange
        const { root, manifest } = await fixture();
        const value = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

        value.exports['.'].import = '../outside.js';
        await writeFile(path.join(root, 'package.json'), JSON.stringify(value));

        // Act / Assert
        await expect(inspectPackage(root, manifest)).rejects.toThrow('Invalid exported target');
    });
});
