// #region Imports

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { inspectPackage } from './inspectPackage.mjs';
import { verifyMcpPackage } from './verifyMcpPackage.mjs';

// #endregion

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Verify real npm artifacts, public imports/declarations, inert imports and consumer bundle exclusion.
 */
export async function verify({ root = repository } = {}) {
    const staging = await realpath(await mkdtemp(path.join(tmpdir(), 'synapse-package-consumer-')));
    const report = {
        packages: [],
        types: false,
        inertImports: false,
        bundles: [],
        meetingExample: false,
        mcp: null,
    };

    try {
        const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
        const packages = [];

        for (const entry of await readdir(path.join(root, 'libs'), { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.startsWith('synapse-')) continue;

            const metadata = JSON.parse(
                await readFile(path.join(root, 'libs', entry.name, 'package.json'), 'utf8'),
            );

            if (!metadata.private) packages.push({ ...metadata, slug: entry.name });
        }

        packages.sort((left, right) => left.name.localeCompare(right.name));

        if (packages.length !== 9 || new Set(packages.map((pkg) => pkg.version)).size !== 1)
            throw new Error('The nine public Synapse packages must share one version.');

        let mcp;

        try {
            mcp = JSON.parse(await readFile(path.join(root, 'tools/mcp/package.json'), 'utf8'));
        } catch (cause) {
            if (cause.code !== 'ENOENT') throw cause;
        }

        if (
            mcp !== undefined &&
            (!mcp ||
                mcp.private ||
                mcp.name !== '@pixel-brewery/synapse-mcp' ||
                mcp.version !== packages[0].version)
        )
            throw new Error('The public MCP tool must share the Synapse library version.');

        const archive = path.join(staging, 'artifacts');

        await mkdir(archive);

        const dependencies = {};
        const resolutions = {};

        for (const pkg of packages) {
            const target = path.join(archive, `${pkg.slug}-${pkg.version}.tgz`);

            await run('yarn', ['workspace', pkg.name, 'pack', '--out', target], root);

            const local = `file:./artifacts/${path.basename(target)}`;

            dependencies[pkg.name] = local;
            resolutions[pkg.name] = local;
        }

        if (mcp) {
            const target = path.join(archive, `synapse-mcp-${mcp.version}.tgz`);

            await run('yarn', ['workspace', mcp.name, 'pack', '--out', target], root);

            const local = `file:./artifacts/${path.basename(target)}`;

            dependencies[mcp.name] = local;
            resolutions[mcp.name] = local;
        }

        await writeFile(
            path.join(staging, 'package.json'),
            JSON.stringify(
                {
                    name: 'synapse-packed-consumer',
                    private: true,
                    type: 'module',
                    packageManager: manifest.packageManager,
                    dependencies,
                    resolutions,
                    devDependencies: {
                        '@types/node': manifest.devDependencies['@types/node'],
                        ...(mcp && {
                            '@modelcontextprotocol/sdk':
                                mcp.dependencies['@modelcontextprotocol/sdk'],
                        }),
                    },
                },
                null,
                2,
            ),
        );
        await writeFile(
            path.join(staging, '.yarnrc.yml'),
            'nodeLinker: node-modules\nenableGlobalCache: true\nenableScripts: false\nenableTelemetry: false\nnpmRegistryServer: "https://registry.npmjs.org"\n',
        );
        await run('yarn', ['install'], staging, 180_000);

        const imports = [];

        for (const pkg of packages) {
            const directory = path.join(staging, 'node_modules', ...pkg.name.split('/'));
            const actual = await realpath(directory);

            if (!actual.startsWith(`${staging}${path.sep}`))
                throw new Error(
                    'A consumer resolved a workspace link instead of an installed artifact.',
                );

            const inspected = await inspectPackage(directory, pkg);

            imports.push(...inspected.imports);
            report.packages.push({
                name: pkg.name,
                version: pkg.version,
                emittedModules: inspected.emittedModules,
                exports: inspected.imports,
            });
        }

        if (mcp)
            report.mcp = await verifyMcpPackage({
                source: path.join(root, 'tools/mcp'),
                staging,
                expected: mcp,
                packages,
                run,
            });

        await writeFile(
            path.join(staging, 'consumer.ts'),
            imports
                .map(
                    (specifier, index) =>
                        `import * as api${index} from ${JSON.stringify(specifier)};\nexport const surface${index}: typeof api${index} = api${index};`,
                )
                .join('\n'),
        );
        await writeFile(
            path.join(staging, 'tsconfig.json'),
            JSON.stringify(
                {
                    compilerOptions: {
                        target: 'ES2023',
                        lib: ['ES2023', 'DOM'],
                        module: 'NodeNext',
                        moduleResolution: 'NodeNext',
                        strict: true,
                        skipLibCheck: false,
                        noEmit: true,
                        types: ['node'],
                    },
                    files: ['consumer.ts'],
                },
                null,
                2,
            ),
        );
        await run(
            process.execPath,
            [
                path.join(root, 'node_modules/typescript/bin/tsc'),
                '--project',
                path.join(staging, 'tsconfig.json'),
            ],
            staging,
        );
        report.types = true;
        await cp(
            path.join(root, 'tools/packaging/importProbe.mjs'),
            path.join(staging, 'importProbe.mjs'),
        );
        await run(process.execPath, ['importProbe.mjs', JSON.stringify(imports)], staging);
        report.inertImports = true;

        const codexEntry = path.join(staging, 'codex-only.mjs');

        await writeFile(
            codexEntry,
            "export { CodexDriver } from '@pixel-brewery/synapse-provider-codex';\nexport { NodeProcessRunner } from '@pixel-brewery/synapse-runtime';\n",
        );

        const forbidden = [
            'synapse-provider-claude',
            'synapse-provider-opencode',
            'synapse-provider-acp',
            '@agentclientprotocol/sdk',
            '@anthropic-ai/sdk',
            '@opencode-ai/sdk',
        ];
        const bundled = await build({
            absWorkingDir: staging,
            entryPoints: [codexEntry],
            platform: 'node',
            target: 'node24',
            format: 'esm',
            bundle: true,
            treeShaking: true,
            write: false,
            metafile: true,
        });
        const contributors = Object.values(bundled.metafile.outputs).flatMap((output) =>
            Object.entries(output.inputs)
                .filter(([, value]) => value.bytesInOutput > 0)
                .map(([name]) => name),
        );

        assertExclusion(contributors, forbidden, 'esbuild');

        if (!contributors.some((name) => name.includes('synapse-provider-codex')))
            throw new Error('The esbuild consumer did not retain the selected driver.');

        report.bundles.push({
            tool: 'esbuild',
            selectedProvider: 'codex',
            excludedProviders: forbidden,
            contributingModules: contributors.length,
        });

        const bundle = await rollup({
            input: codexEntry,
            plugins: [nodeResolve({ preferBuiltins: true }), json(), commonjs()],
            treeshake: true,
            onwarn: (warning) => {
                if (warning.code !== 'CIRCULAR_DEPENDENCY')
                    throw new Error(`Rollup warning: ${warning.message}`);
            },
        });

        try {
            const generated = await bundle.generate({ format: 'esm' });
            const modules = generated.output.flatMap((chunk) =>
                chunk.type === 'chunk'
                    ? Object.entries(chunk.modules)
                          .filter(([, value]) => value.renderedLength > 0)
                          .map(([name]) => name)
                    : [],
            );

            assertExclusion(modules, forbidden, 'Rollup');

            if (!modules.some((name) => name.includes('synapse-provider-codex')))
                throw new Error('The Rollup consumer did not retain the selected driver.');

            report.bundles.push({
                tool: 'rollup',
                selectedProvider: 'codex',
                excludedProviders: forbidden,
                contributingModules: modules.length,
            });
        } finally {
            await bundle.close();
        }

        const coreEntry = path.join(staging, 'core-only.mjs');

        await writeFile(coreEntry, "export * from '@pixel-brewery/synapse-core';\n");
        await build({
            absWorkingDir: staging,
            entryPoints: [coreEntry],
            platform: 'browser',
            target: 'es2023',
            format: 'esm',
            bundle: true,
            write: false,
        });

        const example = path.join(staging, 'meeting-notes');

        await cp(path.join(root, 'apps/meeting-notes/dist'), example, { recursive: true });

        const execution = await run(
            process.execPath,
            [
                path.join(example, 'main.js'),
                '--simulate',
                '--profile-root',
                path.join(staging, 'profiles'),
            ],
            staging,
        );
        const notes = JSON.parse(execution.stdout);

        if (
            typeof notes.summary !== 'string' ||
            !Array.isArray(notes.decisions) ||
            !Array.isArray(notes.tasks) ||
            !execution.stderr.includes('no AI inference')
        )
            throw new Error('The independent packed-artifact meeting example failed.');

        report.meetingExample = true;

        const artifacts = path.join(root, 'artifacts', 'packages');

        await mkdir(artifacts, { recursive: true });

        for (const file of await readdir(archive))
            await cp(path.join(archive, file), path.join(artifacts, file));

        await writeFile(
            path.join(root, 'artifacts', 'packaging-report.json'),
            JSON.stringify(report, null, 2) + '\n',
        );

        return report;
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

function assertExclusion(modules, forbidden, tool) {
    for (const name of forbidden)
        if (modules.some((module) => module.replaceAll('\\', '/').includes(name)))
            throw new Error(`${tool} retained unrelated provider implementation: ${name}`);
}

async function run(command, args, cwd, timeout = 60_000) {
    if (command === 'yarn') {
        args = [require.resolve('@yarnpkg/cli-dist/bin/yarn.js'), ...args];
        command = process.execPath;
    }

    try {
        return await execute(command, args, {
            cwd,
            timeout,
            maxBuffer: 4 * 1024 * 1024,
            env: {
                ...process.env,
                NODE_DISABLE_COMPILE_CACHE: '1',
                YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
            },
            windowsHide: true,
        });
    } catch (cause) {
        throw new Error(
            `${path.basename(command)} ${args.slice(0, 2).join(' ')} failed:\n${cause.stdout ?? ''}\n${cause.stderr ?? cause.message}`,
            { cause },
        );
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const result = await verify();

        process.stdout.write(
            `Packed artifacts passed: ${result.packages.length} libraries${result.mcp ? ' and the installed MCP CLI' : ''}, NodeNext declarations, inert imports, esbuild/Rollup exclusion and independent meeting text.\n`,
        );
    } catch (cause) {
        process.stderr.write(`${cause.message}\n`);
        process.exitCode = 1;
    }
}
