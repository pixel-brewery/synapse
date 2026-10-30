// #region Imports

import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyMcpPackage } from './verifyMcpPackage.mjs';

// #endregion

const owned = [];
const version = '0.1.0';

afterEach(async () => {
    await Promise.all(owned.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * Creates small filesystem payloads for artifact validation; the external SDK process is the only fake.
 */
async function fixture(dependencies = { '@modelcontextprotocol/sdk': '1.32.1', zod: '4.4.3' }) {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'synapse-mcp-artifact-')));

    owned.push(root);

    const source = path.join(root, 'source');
    const staging = path.join(root, 'consumer');
    const installed = path.join(staging, 'node_modules/@pixel-brewery/synapse-mcp');
    const slugs = [
        'core',
        'runtime',
        'auth',
        'routing',
        'provider-codex',
        'provider-claude',
        'provider-opencode',
        'provider-acp',
        'testing',
    ].map((name) => `synapse-${name}`);
    const packages = slugs.map((slug) => ({ slug, name: `@pixel-brewery/${slug}`, version }));
    const manifest = {
        name: '@pixel-brewery/synapse-mcp',
        version,
        type: 'module',
        license: 'MIT',
        sideEffects: false,
        bin: './dist/main.js',
        exports: { './package.json': './package.json' },
        files: ['dist', 'README.md', 'LICENSE', '!**/*.tsbuildinfo'],
        dependencies,
    };
    const corpus = {
        schemaVersion: 1,
        packages: packages.map((pkg) => ({
            name: pkg.slug,
            packageName: pkg.name,
            version,
            overview: `# ${pkg.slug}`,
            apiContent:
                pkg.slug === 'synapse-runtime'
                    ? '# Class: AiRuntime\n\n### run()\n\n### dispose()'
                    : `# ${pkg.slug} API`,
        })),
        guides: ['consumers', 'cli-compatibility', 'native-verification', 'api-documentation'].map(
            (name) => ({ name, content: `# ${name}` }),
        ),
        patterns: [
            'query',
            'repository',
            'mapping',
            'module',
            'error-handling',
            'config',
            'guard',
            'dto',
            'testing',
        ].map((name) => ({ name: `${name}-pattern`, content: `# ${name} pattern` })),
    };

    await mkdir(path.join(source, 'dist/data'), { recursive: true });
    await writeFile(path.join(source, 'package.json'), JSON.stringify(manifest));
    await writeFile(path.join(source, 'README.md'), '# MCP artifact fixture');
    await writeFile(path.join(source, 'LICENSE'), 'MIT');
    await writeFile(path.join(source, 'dist/main.js'), '#!/usr/bin/env node\nexport {};\n');
    await writeFile(path.join(source, 'dist/main.d.ts'), 'export {};\n');
    await writeFile(path.join(source, 'dist/data/corpus.json'), JSON.stringify(corpus));
    await mkdir(path.dirname(installed), { recursive: true });
    await cp(source, installed, { recursive: true });

    const run = vi.fn(async () => ({
        stdout: JSON.stringify({
            name: 'synapse-mcp',
            version,
            tools: 15,
            foreignCwd: true,
            cleanShutdown: true,
        }),
        stderr: '',
    }));
    const options = { source, staging, expected: manifest, packages, run };

    return { root, source, staging, installed, manifest, corpus, run, options };
}

async function changeManifest(context, change) {
    const updated = structuredClone(context.manifest);

    change(updated);
    await writeFile(path.join(context.installed, 'package.json'), JSON.stringify(updated));
}

async function changeCorpus(context, change) {
    const updated = structuredClone(context.corpus);

    change(updated);

    for (const root of [context.source, context.installed])
        await writeFile(path.join(root, 'dist/data/corpus.json'), JSON.stringify(updated));
}

describe('installed MCP artifact verification', () => {
    it('checks a CLI-only payload and probes installed files from an empty foreign working directory', async () => {
        // Arrange
        const context = await fixture();

        context.run.mockImplementationOnce(async (command, args, cwd, timeout) => {
            expect(command).toBe(process.execPath);
            expect(cwd).toBe(path.join(context.staging, 'foreign-mcp-cwd'));
            expect(timeout).toBe(30_000);

            const settings = JSON.parse(args[1]);

            expect(settings.entry).toBe(path.join(context.installed, 'dist/main.js'));
            expect(settings.packageNames).toEqual(
                context.options.packages.map((pkg) => pkg.name).sort(),
            );
            expect(settings.tools).toHaveLength(15);

            return {
                stdout: JSON.stringify({
                    name: 'synapse-mcp',
                    version,
                    tools: 15,
                    foreignCwd: true,
                    cleanShutdown: true,
                }),
            };
        });

        // Act
        const result = await verifyMcpPackage(context.options);

        // Assert
        expect(result).toMatchObject({
            name: context.manifest.name,
            version,
            tools: 15,
            corpus: { packages: 9, guides: 4, patterns: 9 },
            sourceBytes: true,
            foreignCwd: true,
            cleanShutdown: true,
        });
        expect(context.run).toHaveBeenCalledTimes(1);
        await expect(
            readFile(path.join(context.staging, 'mcp-consumer.mjs')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects an installed manifest that turns the documentation CLI into an exported runtime library', async () => {
        // Arrange
        const context = await fixture();

        await changeManifest(context, (manifest) => {
            manifest.exports['.'] = './dist/main.js';
        });

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('CLI-only MCP manifest');
        expect(context.run).not.toHaveBeenCalled();
    });

    it('rejects a different published version before starting the SDK client', async () => {
        // Arrange
        const context = await fixture();

        await changeManifest(context, (manifest) => {
            manifest.version = '0.2.0';
        });

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('manifest or version');
        expect(context.run).not.toHaveBeenCalled();
    });

    it('accepts upgraded exact dependency pins selected by the source manifest', async () => {
        // Arrange
        const context = await fixture({ '@modelcontextprotocol/sdk': '1.32.2', zod: '4.6.7' });

        // Act
        const result = await verifyMcpPackage(context.options);

        // Assert
        expect(result.name).toBe(context.manifest.name);
        expect(context.run).toHaveBeenCalledTimes(1);
    });

    it.each([
        { '@modelcontextprotocol/sdk': '1.32.2', zod: '4.4.3' },
        { '@modelcontextprotocol/sdk': '1.32.1', zod: '4.6.7' },
    ])(
        'rejects archive dependency pins that differ from the source manifest: %j',
        async (dependencies) => {
            // Arrange
            const context = await fixture();

            await changeManifest(context, (manifest) => {
                manifest.dependencies = dependencies;
            });

            // Act / Assert
            await expect(verifyMcpPackage(context.options)).rejects.toThrow('pinned SDK and Zod');
            expect(context.run).not.toHaveBeenCalled();
        },
    );

    it.each([
        { '@modelcontextprotocol/sdk': '^1.32.2', zod: '4.6.7' },
        { '@modelcontextprotocol/sdk': '1.32.2', zod: '~4.6.7' },
    ])('rejects dependency ranges even when source and archive agree: %j', async (dependencies) => {
        // Arrange
        const context = await fixture(dependencies);

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('pinned SDK and Zod');
        expect(context.run).not.toHaveBeenCalled();
    });

    it.each([
        { '@modelcontextprotocol/sdk': 'workspace:^', zod: '4.4.3' },
        {
            '@modelcontextprotocol/sdk': '1.32.1',
            zod: '4.4.3',
            '@pixel-brewery/synapse-runtime': '0.1.0',
        },
    ])(
        'rejects workspace-only dependencies and runtime execution owners: %j',
        async (dependencies) => {
            // Arrange
            const context = await fixture();

            await changeManifest(context, (manifest) => {
                manifest.dependencies = dependencies;
            });

            // Act / Assert
            await expect(verifyMcpPackage(context.options)).rejects.toThrow('pinned SDK and Zod');
            expect(context.run).not.toHaveBeenCalled();
        },
    );

    it('rejects an installed corpus that differs from the freshly built package', async () => {
        // Arrange
        const context = await fixture();

        await writeFile(path.join(context.installed, 'dist/data/corpus.json'), '{}');

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow(
            'differs from its built source',
        );
        expect(context.run).not.toHaveBeenCalled();
    });

    it('rejects an archive that silently omitted part of the built CLI', async () => {
        // Arrange
        const context = await fixture();

        await rm(path.join(context.installed, 'dist/main.d.ts'));

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow(
            'complete built source payload',
        );
        expect(context.run).not.toHaveBeenCalled();
    });

    it('rejects an API index that dropped nested AiRuntime methods', async () => {
        // Arrange
        const context = await fixture();

        await changeCorpus(context, (corpus) => {
            corpus.packages.find((pkg) => pkg.name === 'synapse-runtime').apiContent =
                '# Runtime index';
        });

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('nested AiRuntime API');
        expect(context.run).not.toHaveBeenCalled();
    });

    it('rejects a corpus without the complete pattern family', async () => {
        // Arrange
        const context = await fixture();

        await changeCorpus(context, (corpus) => {
            corpus.patterns.pop();
        });

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('nine patterns');
        expect(context.run).not.toHaveBeenCalled();
    });

    it('rejects packed symlinks before reading content through a checkout fallback', async () => {
        // Arrange
        const context = await fixture();

        await rm(path.join(context.installed, 'dist/data'), { recursive: true });
        await symlink(
            path.join(context.source, 'dist/data'),
            path.join(context.installed, 'dist/data'),
            process.platform === 'win32' ? 'junction' : 'dir',
        );

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('only regular files');
        expect(context.run).not.toHaveBeenCalled();
    });

    it('propagates protocol failure and removes the temporary SDK probe', async () => {
        // Arrange
        const context = await fixture();
        const failure = new Error('The installed protocol probe failed.');

        context.run.mockRejectedValueOnce(failure);

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toBe(failure);
        await expect(
            readFile(path.join(context.staging, 'mcp-consumer.mjs')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('does not report success when the process did not confirm shutdown', async () => {
        // Arrange
        const context = await fixture();

        context.run.mockResolvedValueOnce({
            stdout: JSON.stringify({
                name: 'synapse-mcp',
                version,
                tools: 15,
                foreignCwd: true,
                cleanShutdown: false,
            }),
        });

        // Act / Assert
        await expect(verifyMcpPackage(context.options)).rejects.toThrow('required evidence');
    });
});
