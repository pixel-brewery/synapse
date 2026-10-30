// #region Imports

import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// #endregion

const canonicalRepository = 'pixel-brewery/synapse';
const repositoryPath = `repos/${canonicalRepository}`;
const shaPattern = /^[0-9a-f]{40}$/u;
const maximumPages = 10;
const pageSize = 100;
const requestFailure =
    'Dependabot rebase stopped after a GitHub API request failed; inspect the workflow before retrying.';

/**
 * Requests rebases only for current, same-repository Dependabot pull requests behind canonical main.
 *
 * @param context - The exact canonical repository selected by the trusted workflow.
 * @param dependencies - An optional request(method, endpoint, body) parsed-JSON REST boundary for offline tests.
 * @returns The inspected main SHA, rebased pull-request numbers and fixed skip reasons; stops if main moves.
 * @throws An Error with safe diagnostics for unavailable, malformed or unbounded API data or an unconfirmed write.
 * @remarks Reads metadata only, never pull-request files or code. Pagination is limited to 1,000 pull requests and 1,000 comments per pull request. Current ownership, head and main are checked before each command. A machine comment marker deduplicates requests for the same main SHA; the workflow must serialize runs because GitHub provides no atomic conditional comment creation. No installation, login, credential lookup or automatic retry occurs.
 *
 * @internal
 */
export async function rebaseDependabotPullRequests(context, dependencies = {}) {
    if (context?.repository !== canonicalRepository)
        return { status: 'skipped', reason: 'unsupported-repository' };

    const boundary = dependencies.request ?? requestGitHub;
    const request = async (method, endpoint, body) => {
        try {
            return await boundary(method, endpoint, body);
        } catch {
            throw new Error(requestFailure);
        }
    };
    const mainPath = `${repositoryPath}/branches/main`;
    const main = await request('GET', mainPath);
    const mainSha = main?.commit?.sha;

    if (main?.name !== 'main' || !shaPattern.test(mainSha ?? ''))
        return { status: 'skipped', reason: 'invalid-main' };

    const pullRequests = await pages(request, `${repositoryPath}/pulls?state=open&base=main`);
    const result = { status: 'completed', mainSha, rebased: [], skipped: [] };
    const seen = new Set();
    const skip = (number, reason) => result.skipped.push({ number, reason });
    const marker = `<!-- synapse-dependabot-rebase:${mainSha} -->`;

    for (const listed of pullRequests) {
        const number = listed?.number;

        if (!Number.isSafeInteger(number) || number < 1 || seen.has(number)) continue;

        seen.add(number);

        if (!eligiblePullRequest(listed, number)) {
            skip(number, 'ineligible-pull-request');

            continue;
        }

        const pullRequestPath = `${repositoryPath}/pulls/${number}`;
        const pullRequest = await request('GET', pullRequestPath);

        if (!samePullRequest(pullRequest, listed)) {
            skip(number, 'pull-request-changed');

            continue;
        }

        const comparison = await request(
            'GET',
            `${repositoryPath}/compare/${mainSha}...${pullRequest.head.sha}`,
        );

        if (!Number.isSafeInteger(comparison?.behind_by) || comparison.behind_by < 0) {
            skip(number, 'unknown-comparison');

            continue;
        }

        if (!needsRebase(pullRequest, comparison)) {
            skip(number, 'up-to-date');

            continue;
        }

        const commentsPath = `${repositoryPath}/issues/${number}/comments`;
        const comments = await pages(request, commentsPath);

        if (
            comments.some(
                (comment) =>
                    comment?.user?.login === 'github-actions[bot]' &&
                    comment?.user?.type === 'Bot' &&
                    typeof comment.body === 'string' &&
                    comment.body.includes(marker),
            )
        ) {
            skip(number, 'already-requested');

            continue;
        }

        const currentMain = await request('GET', mainPath);

        if (currentMain?.name !== 'main' || currentMain?.commit?.sha !== mainSha)
            return { ...result, status: 'stopped', reason: 'main-changed' };

        const currentPullRequest = await request('GET', pullRequestPath);

        if (!samePullRequest(currentPullRequest, pullRequest)) {
            skip(number, 'pull-request-changed');

            continue;
        }

        if (!needsRebase(currentPullRequest, comparison)) {
            skip(number, 'up-to-date');

            continue;
        }

        const body = `@dependabot rebase\n\n${marker}`;
        const posted = await request('POST', commentsPath, { body });

        if (!Number.isSafeInteger(posted?.id) || posted.id < 1 || posted.body !== body)
            throw new Error(
                'GitHub did not confirm the Dependabot rebase command; inspect the pull request before retrying.',
            );

        result.rebased.push(number);
    }

    return result;
}

function eligiblePullRequest(value, number) {
    return (
        value?.number === number &&
        value?.state === 'open' &&
        value?.draft === false &&
        value?.merged !== true &&
        value?.user?.login === 'dependabot[bot]' &&
        value?.user?.type === 'Bot' &&
        value?.head?.repo?.full_name === canonicalRepository &&
        value?.base?.repo?.full_name === canonicalRepository &&
        value?.base?.ref === 'main' &&
        shaPattern.test(value?.head?.sha ?? '') &&
        shaPattern.test(value?.base?.sha ?? '')
    );
}

function samePullRequest(value, previous) {
    return (
        eligiblePullRequest(value, previous.number) &&
        value.head.sha === previous.head.sha &&
        value.base.sha === previous.base.sha
    );
}

function needsRebase(pullRequest, comparison) {
    return comparison.behind_by > 0 || pullRequest.mergeable_state === 'dirty';
}

async function pages(request, endpoint) {
    const results = [];
    const separator = endpoint.includes('?') ? '&' : '?';

    for (let page = 1; page <= maximumPages; page++) {
        const rows = await request(
            'GET',
            `${endpoint}${separator}per_page=${pageSize}&page=${page}`,
        );

        if (!Array.isArray(rows) || rows.length > pageSize)
            throw new Error('GitHub returned invalid Dependabot pagination data.');

        results.push(...rows);

        if (rows.length < pageSize) return results;
    }

    throw new Error('Dependabot metadata exceeded its pagination budget; no further work started.');
}

function requestGitHub(method, endpoint, body) {
    if (!process.env.GH_TOKEN) throw new Error(requestFailure);

    return new Promise((resolveRequest, reject) => {
        const child = execFile(
            'gh',
            [
                'api',
                '--hostname',
                'github.com',
                '--method',
                method,
                '--header',
                'Accept: application/vnd.github+json',
                '--header',
                'X-GitHub-Api-Version: 2022-11-28',
                endpoint,
                ...(body === undefined ? [] : ['--input', '-']),
            ],
            {
                encoding: 'utf8',
                env: { ...process.env, GH_PROMPT_DISABLED: '1' },
                maxBuffer: 1024 * 1024,
                timeout: 15_000,
                killSignal: 'SIGKILL',
                windowsHide: true,
            },
            (error, stdout) => {
                if (error) {
                    reject(new Error(requestFailure));

                    return;
                }

                try {
                    resolveRequest(JSON.parse(stdout));
                } catch {
                    reject(new Error(requestFailure));
                }
            },
        );

        child.stdin?.on('error', () => reject(new Error(requestFailure)));
        child.stdin?.end(body === undefined ? undefined : JSON.stringify(body));
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        if (process.argv.length !== 2)
            throw new Error('Dependabot rebase accepts only its main-branch workflow environment.');

        const eventName = process.env.GITHUB_EVENT_NAME;

        if (
            !['push', 'workflow_dispatch'].includes(eventName) ||
            process.env.GITHUB_REF !== 'refs/heads/main'
        )
            throw new Error('Dependabot rebase requires a push or dispatch on main.');

        const result = await rebaseDependabotPullRequests({
            repository: process.env.GITHUB_REPOSITORY,
        });

        process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch {
        process.stderr.write('Dependabot rebase could not complete; inspect the workflow run.\n');
        process.exitCode = 1;
    }
}
