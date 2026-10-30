// #region Imports

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// #endregion

const root = fileURLToPath(new URL('../', import.meta.url));
const registry = 'https://npm.pkg.github.com';

function git(arguments_) {
    return execFileSync('git', arguments_, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
    }).trim();
}

function publish() {
    const manifest = JSON.parse(
        readFileSync(new URL('../libs/synapse-core/package.json', import.meta.url), 'utf8'),
    );
    const tag = `v${manifest.version}`;

    if (git(['rev-parse', `${tag}^{commit}`]) !== git(['rev-parse', 'HEAD']))
        throw new Error('Check out the prepared release tag before publishing.');

    if (git(['status', '--porcelain', '--untracked-files=no']))
        throw new Error('The prepared release must have no tracked changes.');

    const token =
        process.env.NODE_AUTH_TOKEN ||
        process.env.GH_TOKEN ||
        process.env.GITHUB_TOKEN ||
        execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 15_000,
        }).trim();

    if (!token) throw new Error('GitHub Packages authentication is required.');

    const outcome = spawnSync(
        process.execPath,
        [
            fileURLToPath(import.meta.resolve('nx/bin/nx.js')),
            'release',
            'publish',
            `--registry=${registry}`,
            '--nxBail',
            '--parallel=1',
        ],
        {
            cwd: root,
            env: { ...process.env, NODE_AUTH_TOKEN: token },
            stdio: 'inherit',
        },
    );

    if (outcome.error || outcome.signal || outcome.status !== 0)
        throw new Error('GitHub Packages publication failed; retry from the same prepared tag.');
}

try {
    publish();
} catch (cause) {
    process.stderr.write(
        `${cause instanceof Error && !('stderr' in cause) ? cause.message : 'Cannot read the prepared release or GitHub authentication.'}\n`,
    );
    process.exitCode = 1;
}
