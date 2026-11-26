// #region Imports

import { execFileSync } from 'node:child_process';

// #endregion

const requestFailure =
    'Dependabot GitHub API request failed; inspect the workflow and pull request.';

/**
 * Calls GitHub using the existing workflow token and bounded native execution.
 *
 * @param method - The trusted HTTP method.
 * @param endpoint - The repository-scoped REST endpoint.
 * @param body - Optional JSON sent through standard input.
 * @returns The parsed response, or undefined for a successful empty dispatch.
 * @throws An Error when authentication, execution or response parsing fails.
 *
 * @internal
 */
export function requestDependabotGitHub(method, endpoint, body) {
    if (!process.env.GH_TOKEN) throw new Error(requestFailure);

    const output = execFileSync(
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
            input: body === undefined ? undefined : JSON.stringify(body),
            maxBuffer: 4 * 1024 * 1024,
            timeout: 15_000,
            stdio: ['pipe', 'pipe', 'pipe'],
        },
    );

    if (method === 'POST' && endpoint.endsWith('/dispatches') && output.trim() === '')
        return undefined;

    return JSON.parse(output);
}
