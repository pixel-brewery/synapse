// #region Imports

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// #endregion

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Usage: node tools/releaseLocal.mjs [patch|minor|major] [--dry-run]';
const stableVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

/**
 * Prepares, verifies and publishes a local release through the existing Nx and package owners.
 *
 * @param arguments_ - An optional semantic increment and one optional --dry-run flag.
 * @param dependencies - Internal command, client, configuration and output boundaries for account-free tests.
 * @returns The prepared family version and whether the run only inspected local tags and invoked the native Nx preview.
 * @throws An Error on invalid arguments, an unsafe checkout or any incomplete release step.
 * @remarks Real execution requires clean main containing current origin/main; committed local changes may be ahead of it. Without a stable vSemVer tag, Nx performs a first release using the existing manifest version and requested increment. Git changes are committed and tagged once after verification, then pushed atomically before existing publication and verification commands. Failures retain the prepared state for inspection; this runner never rolls back, rebases, retries or changes credentials. Dry runs inspect local tags, invoke Nx's native preview and print the remaining plan without fetching or publishing.
 *
 * @internal
 */
export async function releaseLocal(arguments_, dependencies = {}) {
    const options = parseOptions(arguments_);
    const execute = dependencies.execute ?? executeCommand;
    const git = (arguments_) => execute('git', arguments_).trim();
    const yarn = (arguments_) => execute('yarn', arguments_, { inherit: true });
    let base;
    let remoteBase;

    if (!options.dryRun) {
        if (git(['branch', '--show-current']) !== 'main')
            throw new Error('Local releases require the main branch.');

        if (git(['status', '--porcelain']))
            throw new Error('Local releases require a clean checkout, including untracked files.');

        if (
            git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']) !==
            'origin/main'
        )
            throw new Error('Local main must track origin/main.');

        git(['fetch', 'origin', 'main', '--tags']);
        base = git(['rev-parse', 'HEAD']);
        remoteBase = git(['rev-parse', 'origin/main']);

        if (git(['merge-base', 'HEAD', 'origin/main']) !== remoteBase)
            throw new Error(
                'Local main must include current origin/main before preparing a release.',
            );
    }

    const firstRelease = !git(['tag', '--list', 'v[0-9]*'])
        .split(/\r?\n/u)
        .some((tag) => tag.startsWith('v') && stableVersionPattern.test(tag.slice(1)));
    const createClient = dependencies.createClient ?? defaultClient;
    const client = await createClient({
        git: { commit: false, tag: false, push: false, stageChanges: false },
        ...(firstRelease ? { version: { currentVersionResolver: 'disk' } } : {}),
        changelog: {
            workspaceChangelog: { createRelease: false },
            projectChangelogs: false,
        },
    });
    const result = await client.release({
        specifier: options.specifier,
        dryRun: options.dryRun,
        firstRelease,
        groups: ['synapse'],
        yes: true,
        skipPublish: true,
    });
    const version = result?.workspaceVersion;

    if (typeof version !== 'string' || !stableVersionPattern.test(version))
        throw new Error('Nx did not prepare one stable Synapse family version.');

    if (options.dryRun) {
        const write = dependencies.write ?? ((text) => process.stdout.write(text));

        write(
            `Dry run only. After preparing ${version}, a real local release would generate API documentation, format CHANGELOG.md, run verify and packaging:verify, commit and tag the verified files, push main and the tag atomically, then run release:publish and release:verify. None of those steps ran.\n`,
        );

        return { version, dryRun: true };
    }

    const tag = `v${version}`;

    if (git(['tag', '--list', tag]))
        throw new Error('The prepared release tag already exists; inspect it before retrying.');

    yarn(['docs']);
    yarn(['prettier', '--write', 'CHANGELOG.md']);
    yarn(['verify']);
    yarn(['packaging:verify']);

    if (git(['branch', '--show-current']) !== 'main' || git(['rev-parse', 'HEAD']) !== base)
        throw new Error(
            'The checkout changed during release verification; inspect the prepared files.',
        );

    const changed = new Set([
        ...git(['diff', '--name-only', '-z', '--no-renames', 'HEAD']).split('\0'),
        ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
    ]);

    changed.delete('');

    if (!changed.size || [...changed].some((file) => !releaseFile(file)))
        throw new Error(
            'Release checks left unexpected files; only release-owned changes may be committed.',
        );

    const configuration = dependencies.readConfiguration
        ? dependencies.readConfiguration()
        : JSON.parse(readFileSync(new URL('../nx.json', import.meta.url), 'utf8'));
    const template = configuration.release?.git?.commitMessage;

    if (
        typeof template !== 'string' ||
        !template.includes('{version}') ||
        !template.includes('[skip ci]')
    )
        throw new Error(
            'The configured release commit message must include {version} and [skip ci].',
        );

    git(['add', '--', ...changed]);
    git(['commit', '-m', template.replaceAll('{version}', version)]);
    git(['tag', '--annotate', tag, '--message', tag]);

    if (git(['status', '--porcelain']))
        throw new Error(
            'The prepared release is not clean after committing; inspect it before pushing.',
        );

    git(['fetch', 'origin', 'main', '--tags']);

    if (git(['rev-parse', 'origin/main']) !== remoteBase)
        throw new Error(
            'Origin main moved during release verification; the prepared release was not pushed.',
        );

    if (git(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]))
        throw new Error(
            'The release tag already exists remotely; resume its publication without another bump.',
        );

    git(['push', '--atomic', 'origin', 'HEAD:refs/heads/main', `refs/tags/${tag}`]);
    yarn(['release:publish']);
    yarn(['release:verify']);

    return { version, dryRun: false };
}

function parseOptions(arguments_) {
    let specifier;
    let dryRun = false;

    for (const argument of arguments_) {
        if (argument === '--dry-run' && !dryRun) dryRun = true;
        else if (['patch', 'minor', 'major'].includes(argument) && specifier === undefined)
            specifier = argument;
        else throw new Error(usage);
    }

    return { specifier: specifier ?? 'patch', dryRun };
}

async function defaultClient(configuration) {
    const { ReleaseClient } = await import('nx/release');

    return new ReleaseClient(configuration);
}

function releaseFile(file) {
    return (
        ['yarn.lock', 'CHANGELOG.md', 'tools/mcp/package.json'].includes(file) ||
        /^(?:libs|apps)\/[^/]+\/package\.json$/u.test(file) ||
        /^\.docs\/(?:api\/|packages\/[^/]+\/api\/)/u.test(file)
    );
}

function executeCommand(command, arguments_, options = {}) {
    const executable = command === 'yarn' ? process.execPath : command;
    const yarnEntrypoint =
        process.env.npm_config_user_agent?.startsWith('yarn/') && process.env.npm_execpath
            ? process.env.npm_execpath
            : fileURLToPath(import.meta.resolve('@yarnpkg/cli-dist/bin/yarn.js'));
    const argumentsToRun = command === 'yarn' ? [yarnEntrypoint, ...arguments_] : arguments_;
    const result = spawnSync(executable, argumentsToRun, {
        cwd: workspaceRoot,
        encoding: 'utf8',
        env: { ...process.env, NX_DAEMON: 'false' },
        stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
        ...(command === 'git' ? { timeout: 60_000 } : {}),
    });

    if (result.error || result.signal || result.status !== 0)
        throw new Error(
            `${command} ${arguments_[0]} failed. Release stopped; inspect its current state before retrying.`,
        );

    return result.stdout ?? '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        await releaseLocal(process.argv.slice(2));
    } catch (cause) {
        process.stderr.write(
            `${cause instanceof Error ? cause.message : 'Local release failed.'}\n`,
        );
        process.exitCode = 1;
    }
}
