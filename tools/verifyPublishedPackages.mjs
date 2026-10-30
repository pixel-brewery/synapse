// #region Imports

import { execFile } from 'node:child_process';
import { open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

// #endregion

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'https://npm.pkg.github.com';
const organization = 'pixel-brewery';
const sourceRepository = `${organization}/synapse`;
const execute = promisify(execFile);
const versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u;
const expectedProjects = [
    'synapse-auth',
    'synapse-core',
    'synapse-mcp',
    'synapse-provider-acp',
    'synapse-provider-claude',
    'synapse-provider-codex',
    'synapse-provider-opencode',
    'synapse-routing',
    'synapse-runtime',
    'synapse-testing',
];

/**
 * Verifies every member of the actual fixed release group against GitHub Packages and organization metadata.
 *
 * @returns Completion after all ten packages expose the local family version, matching latest tag and public organization visibility; any exposed registry repository URL must match the expected source.
 * @throws An Error with safe diagnostics when configuration, authentication, registry metadata or visibility cannot be verified.
 * @remarks This explicitly invoked read-only check never installs, publishes or changes package visibility. Tokens come from existing environment credentials or the existing GitHub CLI account and remain in memory. GitHub REST repository association is deliberately independent of the npm manifest's source URL. A registry-hidden repository URL is reported as not-exposed; proving the source URL inside an installed archive requires a separate check.
 *
 * @internal
 */
export async function verifyPublishedPackages() {
    const packages = await releasePackages();
    let token = await authentication();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const results = [];

    try {
        // Two packages at a time bound the four parallel registry/REST response streams.
        for (let index = 0; index < packages.length; index += 2) {
            if (controller.signal.aborted)
                throw new Error(
                    'Published package verification exceeded its two-minute network budget.',
                );

            results.push(
                ...(await Promise.all(
                    packages
                        .slice(index, index + 2)
                        .map((pkg) => verifyPackage(pkg, token, controller.signal)),
                )),
            );
        }
    } finally {
        clearTimeout(timer);
        controller.abort();
        token = '';
    }

    for (const result of results)
        process.stdout.write(
            `${result.name}@${result.version}: version=${result.published ? 'present' : 'missing'}, latest=${result.latest}, visibility=${result.visibility}, repository=${result.repository}${result.failure ? `, ${result.failure}` : ''}\n`,
        );

    const failed = results.filter((result) => !result.ok);

    if (failed.length)
        throw new Error(
            `Published package verification failed for ${failed.length} of ${packages.length} packages. Expected the exact local version, matching latest tag, public visibility and a matching ${sourceRepository} source URL whenever the registry exposes it.`,
        );

    process.stdout.write(
        `Verified all ${packages.length} public Synapse packages at ${packages[0].version} on GitHub Packages.\n`,
    );
}

async function releasePackages() {
    const root = await realpath(workspaceRoot);
    let previousDirectory;
    const previousDaemon = process.env.NX_DAEMON;
    const previousCachedGraph = process.env.NX_FORCE_REUSE_CACHED_GRAPH;

    try {
        const configuration = await readJson(join(root, 'nx.json'));
        const group = configuration?.release?.groups?.synapse;

        if (
            group?.projectsRelationship !== 'fixed' ||
            !Array.isArray(group.projects) ||
            group.projects.some((name) => typeof name !== 'string') ||
            [...group.projects].sort().join('\0') !== expectedProjects.join('\0')
        )
            throw new Error(
                'The synapse release group must contain exactly the ten fixed family projects.',
            );

        previousDirectory = process.cwd();
        process.chdir(root);
        process.env.NX_DAEMON = 'false';
        process.env.NX_FORCE_REUSE_CACHED_GRAPH = 'false';

        const { createProjectGraphAsync } = await import('@nx/devkit');
        const graph = await createProjectGraphAsync({ exitOnError: false });
        const packages = [];

        for (const project of expectedProjects) {
            const directory = graph.nodes[project]?.data.root;

            if (typeof directory !== 'string')
                throw new Error(`Release project ${project} is missing from the Nx graph.`);

            const projectRoot = await realpath(resolve(root, directory));
            const local = relative(root, projectRoot);

            if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
                throw new Error(
                    `Release project ${project} must have its own workspace directory.`,
                );

            const manifestPath = await realpath(join(projectRoot, 'package.json'));
            const manifestLocation = relative(root, manifestPath);

            if (
                manifestLocation === '..' ||
                manifestLocation.startsWith(`..${sep}`) ||
                isAbsolute(manifestLocation)
            )
                throw new Error(`Release project ${project} has an external manifest.`);

            const manifest = await readJson(manifestPath);

            if (
                manifest?.private === true ||
                manifest?.name !== `@${organization}/${project}` ||
                typeof manifest.version !== 'string' ||
                manifest.version.length > 128 ||
                !versionPattern.test(manifest.version) ||
                manifest.publishConfig?.registry !== registry ||
                manifest.publishConfig?.access !== 'public' ||
                !expectedRepository(manifest.repository)
            )
                throw new Error(
                    `Release project ${project} has inconsistent publication metadata.`,
                );

            packages.push({ name: manifest.name, project, version: manifest.version });
        }

        if (new Set(packages.map((pkg) => pkg.version)).size !== 1)
            throw new Error('The fixed Synapse family contains different local versions.');

        return packages;
    } catch (cause) {
        const safe =
            cause instanceof Error &&
            /^(?:The (?:synapse release group|fixed Synapse family)|Release project synapse-)/u.test(
                cause.message,
            );

        throw new Error(
            safe ? cause.message : 'Cannot read the local Nx release group and package manifests.',
        );
    } finally {
        if (previousDirectory !== undefined) process.chdir(previousDirectory);

        if (previousDaemon === undefined) delete process.env.NX_DAEMON;
        else process.env.NX_DAEMON = previousDaemon;

        if (previousCachedGraph === undefined) delete process.env.NX_FORCE_REUSE_CACHED_GRAPH;
        else process.env.NX_FORCE_REUSE_CACHED_GRAPH = previousCachedGraph;
    }
}

async function authentication() {
    for (const name of ['NODE_AUTH_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) {
        const value = process.env[name]?.trim();

        if (value) return checkedToken(value);
    }

    try {
        const result = await execute('gh', ['auth', 'token', '--hostname', 'github.com'], {
            encoding: 'utf8',
            timeout: 5000,
            killSignal: 'SIGKILL',
            maxBuffer: 16 * 1024,
            windowsHide: true,
        });

        return checkedToken(result.stdout.trim());
    } catch {
        throw new Error(
            'Package authentication is unavailable. Supply an existing NODE_AUTH_TOKEN, GH_TOKEN or GITHUB_TOKEN with package-read access, or use the active GitHub CLI account.',
        );
    }
}

function checkedToken(value) {
    if (!/^[\x21-\x7e]{1,4096}$/u.test(value))
        throw new Error('The existing package authentication value is invalid.');

    return value;
}

async function verifyPackage(pkg, token, signal) {
    const [registryResult, visibilityResult] = await Promise.all([
        fetchJson(`${registry}/${pkg.name.replace('/', '%2f')}`, token, signal),
        fetchJson(
            `https://api.github.com/orgs/${organization}/packages/npm/${encodeURIComponent(pkg.project)}`,
            token,
            signal,
        ),
    ]);
    const metadata = registryResult.ok ? record(registryResult.value) : undefined;
    const versions = record(metadata?.versions);
    const version =
        versions && Object.hasOwn(versions, pkg.version)
            ? record(versions[pkg.version])
            : undefined;
    const latestValue = record(metadata?.['dist-tags'])?.latest;
    const latest =
        typeof latestValue === 'string' &&
        latestValue.length <= 128 &&
        versionPattern.test(latestValue)
            ? latestValue
            : 'missing';
    const published = version?.name === pkg.name && version?.version === pkg.version;
    const repositoryUrl =
        typeof version?.repository === 'string'
            ? version.repository
            : record(version?.repository)?.url;
    const repository =
        typeof repositoryUrl !== 'string'
            ? 'not-exposed'
            : expectedRepository(version.repository)
              ? 'expected'
              : 'mismatch';
    const visibilityMetadata = visibilityResult.ok ? record(visibilityResult.value) : undefined;
    const visibilityOwner = record(visibilityMetadata?.owner)?.login;
    const validVisibility =
        visibilityMetadata?.name === pkg.project &&
        visibilityMetadata?.package_type === 'npm' &&
        typeof visibilityOwner === 'string' &&
        visibilityOwner.toLowerCase() === organization;
    const visibility =
        validVisibility && ['public', 'private', 'internal'].includes(visibilityMetadata.visibility)
            ? visibilityMetadata.visibility
            : 'unknown';

    return {
        name: pkg.name,
        version: pkg.version,
        latest,
        published,
        repository,
        visibility,
        ok:
            published &&
            repository !== 'mismatch' &&
            latest === pkg.version &&
            visibility === 'public',
        failure: [
            ...(!registryResult.ok ? [`registry ${registryResult.failure}`] : []),
            ...(!visibilityResult.ok ? [`visibility ${visibilityResult.failure}`] : []),
        ].join('; '),
    };
}

async function fetchJson(url, token, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, 15_000);
    let reader;

    signal.addEventListener('abort', abort, { once: true });

    if (signal.aborted) abort();

    try {
        const rest = url.startsWith('https://api.github.com/');
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: rest ? 'application/vnd.github+json' : 'application/json',
                'User-Agent': 'Synapse-release-verification',
                ...(rest ? { 'X-GitHub-Api-Version': '2026-03-10' } : {}),
            },
            signal: controller.signal,
            redirect: 'error',
        });

        if (!response.ok) return { ok: false, failure: `HTTP ${response.status}` };

        if (!response.body || Number(response.headers.get('content-length')) > 4 * 1024 * 1024)
            return { ok: false, failure: 'response exceeds its byte budget or is empty' };

        reader = response.body.getReader();

        const chunks = [];
        let length = 0;

        while (true) {
            const chunk = await reader.read();

            if (chunk.done) break;

            length += chunk.value.byteLength;

            if (length > 4 * 1024 * 1024)
                return { ok: false, failure: 'response exceeds its byte budget' };

            chunks.push(chunk.value);
        }

        const text = new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.concat(chunks, length),
        );

        return { ok: true, value: JSON.parse(text) };
    } catch {
        return {
            ok: false,
            failure: controller.signal.aborted
                ? 'timed out or cancelled'
                : 'request or JSON validation failed',
        };
    } finally {
        clearTimeout(timer);
        controller.abort();
        reader?.releaseLock();
        signal.removeEventListener('abort', abort);
    }
}

function expectedRepository(value) {
    const source = typeof value === 'string' ? value : record(value)?.url;

    if (typeof source !== 'string') return false;

    try {
        const url = new URL(
            source.replace(/^git\+/u, '').replace(/^git@github\.com:/u, 'https://github.com/'),
        );

        return (
            ['https:', 'http:', 'ssh:'].includes(url.protocol) &&
            url.hostname.toLowerCase() === 'github.com' &&
            !url.port &&
            !url.password &&
            (!url.username || (url.protocol === 'ssh:' && url.username === 'git')) &&
            !url.search &&
            !url.hash &&
            url.pathname
                .replace(/\.git\/?$/u, '')
                .replace(/\/$/u, '')
                .toLowerCase() === `/${sourceRepository}`
        );
    } catch {
        return false;
    }
}

function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

async function readJson(file) {
    const handle = await open(file, 'r');

    try {
        const bytes = new Uint8Array(1024 * 1024 + 1);
        let length = 0;

        while (length < bytes.length) {
            const result = await handle.read(bytes, length, bytes.length - length, null);

            if (!result.bytesRead) break;

            length += result.bytesRead;
        }

        if (length > 1024 * 1024)
            throw new Error('Local release metadata exceeds its input budget.');

        return JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)),
        );
    } finally {
        await handle.close();
    }
}

if (
    process.argv[1] &&
    isAbsolute(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    try {
        if (process.argv.length !== 2)
            throw new Error(
                'Published verification accepts no positional or authentication arguments.',
            );

        await verifyPublishedPackages();
    } catch (cause) {
        process.stderr.write(
            `${cause instanceof Error ? cause.message : 'Published package verification failed.'}\n`,
        );
        process.exitCode = 1;
    }
}
