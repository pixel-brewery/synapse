// #region Imports

import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// #endregion

const packageName = '@pixel-brewery/synapse-mcp';
const patternIds = [
    'query-pattern',
    'repository-pattern',
    'mapping-pattern',
    'module-pattern',
    'error-handling-pattern',
    'config-pattern',
    'guard-pattern',
    'dto-pattern',
    'testing-pattern',
];
const documentationTools = [
    'list-packages',
    'get-package-doc',
    'search-docs',
    'list-guides',
    'get-guide',
    'search-guides',
    ...patternIds.map((name) => `get-${name}`),
];

/**
 * Verifies an installed CLI-only archive and exercises its stdio protocol using the consumer's SDK.
 *
 * @param options - Owned temporary consumer, expected package metadata, built source and process seam.
 * @returns Artifact identity, corpus counts and confirmed protocol/shutdown evidence.
 * @throws An Error for workspace links, stale or incomplete payloads, invalid metadata or protocol failure.
 *
 * @internal
 */
export async function verifyMcpPackage({ source, staging, expected, packages, run }) {
    const directory = path.join(staging, 'node_modules', ...packageName.split('/'));
    const installed = await realpath(directory);
    const consumer = await realpath(staging);

    if (!inside(consumer, installed))
        throw new Error(
            'The MCP consumer resolved a workspace link instead of an installed artifact.',
        );

    const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));

    inspectManifest(manifest, expected);

    const emitted = await files(installed);
    const relative = emitted.map((file) =>
        path.relative(installed, file).split(path.sep).join('/'),
    );

    if (
        relative.some(
            (file) =>
                !['package.json', 'README.md', 'LICENSE'].includes(file) &&
                !file.startsWith('dist/'),
        ) ||
        relative.some((file) => /(?:\.spec\.|\.cjs$|\.tsbuildinfo$)/u.test(file))
    )
        throw new Error(
            'The MCP archive contains files outside its CLI payload or build/test state.',
        );

    for (const required of ['README.md', 'LICENSE', 'dist/main.js', 'dist/data/corpus.json'])
        if (!relative.includes(required)) throw new Error(`The MCP archive lacks ${required}.`);

    const sourceOutput = (await files(path.join(source, 'dist')))
        .filter((file) => !file.endsWith('.tsbuildinfo'))
        .map(
            (file) =>
                `dist/${path.relative(path.join(source, 'dist'), file).split(path.sep).join('/')}`,
        )
        .sort();
    const installedOutput = relative.filter((file) => file.startsWith('dist/')).sort();

    if (JSON.stringify(sourceOutput) !== JSON.stringify(installedOutput))
        throw new Error(
            'The installed MCP archive does not contain the complete built source payload.',
        );

    for (const file of ['README.md', 'LICENSE', ...installedOutput]) {
        const [actual, original] = await Promise.all([
            readFile(path.join(installed, file)),
            readFile(path.join(source, file)),
        ]);

        if (!actual.equals(original))
            throw new Error(`The installed MCP file differs from its built source: ${file}.`);
    }

    if (
        !(await readFile(path.join(installed, 'dist/main.js'), 'utf8')).startsWith(
            '#!/usr/bin/env node',
        )
    )
        throw new Error('The MCP command lacks its executable Node.js entry point.');

    const corpus = JSON.parse(
        await readFile(path.join(installed, 'dist/data/corpus.json'), 'utf8'),
    );

    inspectCorpus(corpus, packages);

    const foreign = path.join(staging, 'foreign-mcp-cwd');
    const probe = path.join(staging, 'mcp-consumer.mjs');
    const settings = {
        entry: path.join(installed, 'dist/main.js'),
        version: manifest.version,
        tools: documentationTools,
        packageNames: packages.map((pkg) => pkg.name).sort(),
        guideNames: corpus.guides.map((guide) => guide.name).sort(),
        patterns: patternIds,
    };

    await mkdir(foreign);
    await writeFile(
        probe,
        [
            "import { Client } from '@modelcontextprotocol/sdk/client/index.js';",
            "import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';",
            "import metadata from '@pixel-brewery/synapse-mcp/package.json' with { type: 'json' };",
            `await (${probeServer.toString()})(Client, StdioClientTransport, metadata, JSON.parse(process.argv[2]));`,
        ].join('\n') + '\n',
    );

    let result;

    try {
        const execution = await run(
            process.execPath,
            [probe, JSON.stringify(settings)],
            foreign,
            30_000,
        );

        result = JSON.parse(execution.stdout);

        if (
            result.name !== 'synapse-mcp' ||
            result.version !== manifest.version ||
            result.tools !== documentationTools.length ||
            result.cleanShutdown !== true ||
            result.foreignCwd !== true
        )
            throw new Error(
                'The installed MCP protocol probe did not confirm its required evidence.',
            );
    } finally {
        await rm(probe, { force: true });
        await rm(foreign, { recursive: true, force: true });
    }

    return {
        name: manifest.name,
        version: manifest.version,
        tools: result.tools,
        corpus: {
            packages: corpus.packages.length,
            guides: corpus.guides.length,
            patterns: corpus.patterns.length,
        },
        sourceBytes: true,
        foreignCwd: true,
        cleanShutdown: true,
    };
}

function inspectManifest(manifest, expected) {
    const bin = typeof manifest.bin === 'string' ? { 'synapse-mcp': manifest.bin } : manifest.bin;

    if (
        manifest.name !== packageName ||
        manifest.name !== expected.name ||
        manifest.version !== expected.version ||
        manifest.type !== 'module' ||
        manifest.sideEffects !== false ||
        manifest.license !== 'MIT' ||
        manifest.private ||
        !bin ||
        Object.keys(bin).join() !== 'synapse-mcp' ||
        !['./dist/main.js', 'dist/main.js'].includes(bin['synapse-mcp']) ||
        Object.keys(manifest.exports ?? {}).join() !== './package.json' ||
        manifest.exports['./package.json'] !== './package.json'
    )
        throw new Error('Invalid published CLI-only MCP manifest or version.');

    const dependencies = {
        ...manifest.dependencies,
        ...manifest.peerDependencies,
        ...manifest.optionalDependencies,
    };
    const dependencyNames = ['@modelcontextprotocol/sdk', 'zod'];
    const expectedDependencies = expected.dependencies ?? {};

    if (
        Object.keys(dependencies).sort().join() !== dependencyNames.join() ||
        dependencyNames.some(
            (name) =>
                typeof expectedDependencies[name] !== 'string' ||
                !/^\d+\.\d+\.\d+$/u.test(expectedDependencies[name]) ||
                dependencies[name] !== expectedDependencies[name],
        )
    )
        throw new Error('The MCP artifact must depend only on the pinned SDK and Zod packages.');
}

function inspectCorpus(corpus, packages) {
    const expected = packages.map((pkg) => `${pkg.name}@${pkg.version}`).sort();
    const actual = corpus.packages?.map((pkg) => `${pkg.packageName}@${pkg.version}`).sort();
    const runtime = corpus.packages?.find((pkg) => pkg.name === 'synapse-runtime');

    if (
        corpus.schemaVersion !== 1 ||
        expected.length !== 9 ||
        JSON.stringify(actual) !== JSON.stringify(expected) ||
        corpus.packages.some((pkg) => !pkg.overview?.trim() || !pkg.apiContent?.trim()) ||
        !runtime?.apiContent?.includes('Class: AiRuntime') ||
        !runtime.apiContent.includes('### run()') ||
        !runtime.apiContent.includes('### dispose()')
    )
        throw new Error(
            'The MCP corpus must contain all nine libraries and the nested AiRuntime API.',
        );

    if (
        !Array.isArray(corpus.guides) ||
        new Set(corpus.guides.map((guide) => guide.name)).size !== corpus.guides.length ||
        corpus.guides.some((guide) => !guide.content?.trim()) ||
        !['consumers', 'cli-compatibility', 'native-verification', 'api-documentation'].every(
            (name) => corpus.guides.some((guide) => guide.name === name),
        ) ||
        !Array.isArray(corpus.patterns) ||
        JSON.stringify(corpus.patterns.map((pattern) => pattern.name).sort()) !==
            JSON.stringify([...patternIds].sort()) ||
        corpus.patterns.some((pattern) => !pattern.content?.trim())
    )
        throw new Error('The MCP corpus is missing required authored guides or its nine patterns.');
}

async function files(directory) {
    const output = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        const metadata = await lstat(file);

        if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile()))
            throw new Error('The MCP package must contain only regular files and directories.');

        if (metadata.isDirectory()) output.push(...(await files(file)));
        else output.push(file);
    }

    return output;
}

function inside(root, target) {
    const relative = path.relative(root, target);

    return (
        relative !== '' &&
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
    );
}

/**
 * Runs only after serialization into the isolated installed consumer; SDK imports resolve there.
 */
async function probeServer(Client, StdioClientTransport, metadata, settings) {
    function ensure(value, message) {
        if (!value) throw new Error(message);
    }

    function content(result) {
        ensure(result.isError !== true, 'The installed documentation tool reported an error.');
        ensure(
            Array.isArray(result.content) &&
                result.content.length > 0 &&
                result.content.every((item) => item.type === 'text'),
            'MCP documentation responses must contain text only.',
        );

        const text = result.content.map((item) => item.text).join('\n');

        ensure(text.trim().length > 0, 'The installed documentation response was empty.');

        return text;
    }

    ensure(
        metadata.name === '@pixel-brewery/synapse-mcp' && metadata.version === settings.version,
        'The consumer could not import the advertised package metadata.',
    );

    let rootBlocked = false;

    try {
        await import(metadata.name);
    } catch (cause) {
        if (cause.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw cause;

        rootBlocked = true;
    }

    ensure(rootBlocked, 'The CLI-only MCP package unexpectedly exports a runtime library.');

    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [settings.entry],
        cwd: process.cwd(),
        stderr: 'pipe',
    });
    const client = new Client({ name: 'synapse-packed-artifact-check', version: settings.version });
    const requests = { signal: AbortSignal.timeout(20_000), timeout: 3_000 };
    let protocolErrors = 0;
    let failure;
    let pid;

    transport.stderr?.on('data', () => {});
    client.onerror = () => {
        protocolErrors += 1;
    };

    const call = (name, args = {}) =>
        client.callTool({ name, arguments: args }, undefined, requests);

    try {
        await client.connect(transport, requests);
        pid = transport.pid;

        const identity = client.getServerVersion();

        ensure(
            identity?.name === 'synapse-mcp' && identity.version === settings.version,
            'The installed MCP server reported different metadata.',
        );

        const capabilities = client.getServerCapabilities();

        ensure(
            capabilities?.tools && !capabilities.resources && !capabilities.prompts,
            'The MCP server advertised capabilities beyond documentation tools.',
        );

        const discovered = await client.listTools({}, requests);
        const toolNames = discovered.tools.map((tool) => tool.name).sort();

        ensure(
            !discovered.nextCursor &&
                JSON.stringify(toolNames) === JSON.stringify([...settings.tools].sort()),
            'The installed MCP server did not expose exactly its fifteen documentation tools.',
        );

        const packages = JSON.parse(content(await call('list-packages')));

        ensure(
            JSON.stringify(packages.map((pkg) => pkg.package).sort()) ===
                JSON.stringify(settings.packageNames),
            'MCP package discovery differs from the installed library family.',
        );

        const runtime = content(await call('get-package-doc', { packageName: 'synapse-runtime' }));

        ensure(
            runtime.includes('Class: AiRuntime') &&
                runtime.includes('### run()') &&
                runtime.includes('### dispose()'),
            'The installed package documentation omitted nested class/member API pages.',
        );

        const search = content(await call('search-docs', { query: 'cleanupIncomplete' }));

        ensure(
            search.includes('cleanupIncomplete') && search.includes('API Reference'),
            'MCP documentation search omitted generated API content.',
        );

        const guides = JSON.parse(content(await call('list-guides')));

        ensure(
            JSON.stringify(guides.map((guide) => guide.name).sort()) ===
                JSON.stringify(settings.guideNames),
            'MCP guide discovery differs from the packaged corpus.',
        );
        content(await call('get-guide', { guideName: 'consumers' }));

        const guideSearch = content(await call('search-guides', { query: 'profile' }));

        ensure(
            guideSearch.toLowerCase().includes('profile'),
            'MCP guide search did not return authored profile guidance.',
        );

        for (const pattern of settings.patterns) content(await call(`get-${pattern}`));

        const tailored = content(
            await call('get-query-pattern', {
                modelName: 'PackedMeeting',
                fields: ['id', 'title'],
            }),
        );

        ensure(
            tailored.includes('PackedMeeting'),
            'The MCP query pattern ignored explicit example parameters.',
        );

        const unknown = await call('get-package-doc', { packageName: '../unavailable-package' });
        const invalid = await call('get-package-doc', { packageName: 42 });

        ensure(
            unknown.isError === true && invalid.isError === true,
            'MCP package lookup did not reject unknown identities or invalid arguments.',
        );
        ensure(protocolErrors === 0, 'The MCP transport reported a protocol failure.');
    } catch (cause) {
        failure = cause;
    }

    try {
        await client.close();
        await transport.close();

        if (pid !== null && pid !== undefined) {
            let exited = false;

            for (let attempt = 0; attempt < 100; attempt += 1) {
                try {
                    process.kill(pid, 0);
                } catch (cause) {
                    if (cause.code !== 'ESRCH') throw cause;

                    exited = true;

                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            ensure(exited, 'The installed MCP process remained alive after SDK shutdown.');
        }
    } catch (cause) {
        if (failure)
            throw new AggregateError(
                [failure, cause],
                'The MCP protocol probe and process cleanup failed.',
            );

        throw cause;
    }

    if (failure) throw failure;

    process.stdout.write(
        JSON.stringify({
            name: 'synapse-mcp',
            version: settings.version,
            tools: settings.tools.length,
            foreignCwd: true,
            cleanShutdown: true,
        }) + '\n',
    );
}
