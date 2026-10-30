// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { rebaseDependabotPullRequests } from './rebaseDependabotPullRequests.mjs';

// #endregion

const system = vi.hoisted(() => ({ execFile: vi.fn() }));

vi.mock('node:child_process', () => ({ execFile: system.execFile }));

const repository = 'pixel-brewery/synapse';
const root = `repos/${repository}`;
const mainSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const marker = `<!-- synapse-dependabot-rebase:${mainSha} -->`;
const context = { repository };

function pullRequest(number = 1, mutate = () => undefined) {
    const result = {
        number,
        state: 'open',
        draft: false,
        merged: false,
        mergeable_state: 'clean',
        user: { login: 'dependabot[bot]', type: 'Bot' },
        head: { sha: headSha, repo: { full_name: repository } },
        base: { ref: 'main', sha: mainSha, repo: { full_name: repository } },
    };

    mutate(result);

    return result;
}

function controlled(options = {}) {
    let mainReads = 0;
    const pullReads = new Map();
    const listed = options.listed ?? [pullRequest()];
    const request = vi.fn(async (method, endpoint, body) => {
        if (options.fail?.(method, endpoint)) throw new Error('synthetic-private-token');

        if (method === 'GET' && endpoint === `${root}/branches/main`) {
            mainReads++;

            return options.main?.(mainReads) ?? { name: 'main', commit: { sha: mainSha } };
        }

        if (method === 'GET' && endpoint.startsWith(`${root}/pulls?`)) {
            const page = Number(
                new URL(endpoint, 'https://api.github.com/').searchParams.get('page'),
            );

            return options.pullPages?.(page) ?? listed;
        }

        if (method === 'GET' && endpoint.startsWith(`${root}/compare/`))
            return options.comparison ?? { behind_by: 2 };

        if (method === 'GET' && endpoint.startsWith(`${root}/issues/`)) {
            const page = Number(
                new URL(endpoint, 'https://api.github.com/').searchParams.get('page'),
            );

            return options.commentPages?.(page) ?? [];
        }

        if (method === 'GET' && endpoint.startsWith(`${root}/pulls/`)) {
            const number = Number(endpoint.split('/').at(-1));
            const count = (pullReads.get(number) ?? 0) + 1;

            pullReads.set(number, count);

            return options.detail?.(number, count) ?? listed.find((item) => item.number === number);
        }

        if (method === 'POST') return options.posted ?? { id: 900, body: body.body };

        throw new Error('Unexpected controlled API request.');
    });

    return { request };
}

function writes(dependencies) {
    return dependencies.request.mock.calls.filter(([method]) => method !== 'GET');
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('Dependabot rebase requests', () => {
    it.each([undefined, {}, { repository: 'someone/synapse' }])(
        'ignores a missing or foreign repository before accessing GitHub: %s',
        async (input) => {
            // Arrange
            const dependencies = controlled();

            // Act
            const result = await rebaseDependabotPullRequests(input, dependencies);

            // Assert
            expect(result).toEqual({ status: 'skipped', reason: 'unsupported-repository' });
            expect(dependencies.request).not.toHaveBeenCalled();
        },
    );

    it.each([
        { name: 'other', commit: { sha: mainSha } },
        { name: 'main', commit: { sha: 'unknown' } },
        { name: 'main' },
    ])('does not process pull requests without canonical main metadata: %j', async (main) => {
        // Arrange
        const dependencies = controlled({ main: () => main });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'invalid-main' });
        expect(dependencies.request).toHaveBeenCalledTimes(1);
        expect(writes(dependencies)).toEqual([]);
    });

    it('requests a rebase for a behind Dependabot head after rereading main and PR ownership', async () => {
        // Arrange
        const dependencies = controlled();

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'completed', mainSha, rebased: [1], skipped: [] });
        expect(dependencies.request.mock.calls).toEqual([
            ['GET', `${root}/branches/main`, undefined],
            ['GET', `${root}/pulls?state=open&base=main&per_page=100&page=1`, undefined],
            ['GET', `${root}/pulls/1`, undefined],
            ['GET', `${root}/compare/${mainSha}...${headSha}`, undefined],
            ['GET', `${root}/issues/1/comments?per_page=100&page=1`, undefined],
            ['GET', `${root}/branches/main`, undefined],
            ['GET', `${root}/pulls/1`, undefined],
            ['POST', `${root}/issues/1/comments`, { body: `@dependabot rebase\n\n${marker}` }],
        ]);
    });

    it('requests a conflicting head even when the comparison reports no missing main commits', async () => {
        // Arrange
        const listed = [pullRequest(1, (value) => (value.mergeable_state = 'dirty'))];
        const dependencies = controlled({ listed, comparison: { behind_by: 0 } });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.rebased).toEqual([1]);
        expect(writes(dependencies)).toHaveLength(1);
    });

    it.each(['clean', 'unknown', undefined])(
        'leaves current heads alone when mergeability is %s',
        async (mergeableState) => {
            // Arrange
            const listed = [pullRequest(1, (value) => (value.mergeable_state = mergeableState))];
            const dependencies = controlled({ listed, comparison: { behind_by: 0 } });

            // Act
            const result = await rebaseDependabotPullRequests(context, dependencies);

            // Assert
            expect(result.skipped).toEqual([{ number: 1, reason: 'up-to-date' }]);
            expect(writes(dependencies)).toEqual([]);
            expect(dependencies.request).toHaveBeenCalledTimes(4);
        },
    );

    it.each([
        ['human author', (value) => (value.user.login = 'maintainer')],
        ['non-bot account', (value) => (value.user.type = 'User')],
        ['draft', (value) => (value.draft = true)],
        ['closed', (value) => (value.state = 'closed')],
        ['merged', (value) => (value.merged = true)],
        ['foreign head', (value) => (value.head.repo.full_name = 'outsider/synapse')],
        ['foreign base', (value) => (value.base.repo.full_name = 'outsider/synapse')],
        ['other base branch', (value) => (value.base.ref = 'release')],
        ['missing head identity', (value) => (value.head.sha = undefined)],
        ['missing base identity', (value) => (value.base.sha = undefined)],
    ])('ignores a listed %s without reading its comments or writing', async (_name, mutate) => {
        // Arrange
        const dependencies = controlled({ listed: [pullRequest(1, mutate)] });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.skipped).toEqual([{ number: 1, reason: 'ineligible-pull-request' }]);
        expect(dependencies.request).toHaveBeenCalledTimes(2);
        expect(writes(dependencies)).toEqual([]);
    });

    it.each([{ behind_by: -1 }, { behind_by: '2' }, {}, { behind_by: 0.5 }])(
        'does not write when comparison metadata is unknown: %j',
        async (comparison) => {
            // Arrange
            const dependencies = controlled({ comparison });

            // Act
            const result = await rebaseDependabotPullRequests(context, dependencies);

            // Assert
            expect(result.skipped).toEqual([{ number: 1, reason: 'unknown-comparison' }]);
            expect(writes(dependencies)).toEqual([]);
        },
    );

    it('skips a head already changed between enumeration and inspection', async () => {
        // Arrange
        const dependencies = controlled({
            detail: () => pullRequest(1, (value) => (value.head.sha = 'c'.repeat(40))),
        });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.skipped).toEqual([{ number: 1, reason: 'pull-request-changed' }]);
        expect(writes(dependencies)).toEqual([]);
        expect(dependencies.request).toHaveBeenCalledTimes(3);
    });

    it.each([
        ['new head', (value) => (value.head.sha = 'c'.repeat(40))],
        ['new base', (value) => (value.base.sha = 'c'.repeat(40))],
        ['closed', (value) => (value.state = 'closed')],
        ['draft', (value) => (value.draft = true)],
        ['foreign ownership', (value) => (value.head.repo.full_name = 'outsider/synapse')],
    ])('skips a PR whose final reread shows %s', async (_name, mutate) => {
        // Arrange
        const dependencies = controlled({
            detail: (number, count) => pullRequest(number, count === 2 ? mutate : undefined),
        });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.skipped).toEqual([{ number: 1, reason: 'pull-request-changed' }]);
        expect(writes(dependencies)).toEqual([]);
    });

    it('skips a conflict that resolves before the final PR reread', async () => {
        // Arrange
        const listed = [pullRequest(1, (value) => (value.mergeable_state = 'dirty'))];
        const dependencies = controlled({
            listed,
            comparison: { behind_by: 0 },
            detail: (number, count) =>
                pullRequest(
                    number,
                    (value) => (value.mergeable_state = count === 1 ? 'dirty' : 'clean'),
                ),
        });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.skipped).toEqual([{ number: 1, reason: 'up-to-date' }]);
        expect(writes(dependencies)).toEqual([]);
    });

    it('stops before a write when main advances so the next push can inspect the new base', async () => {
        // Arrange
        const dependencies = controlled({
            main: (count) => ({
                name: 'main',
                commit: { sha: count === 1 ? mainSha : 'c'.repeat(40) },
            }),
            listed: [pullRequest(1), pullRequest(2)],
        });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result).toEqual({
            status: 'stopped',
            reason: 'main-changed',
            mainSha,
            rebased: [],
            skipped: [],
        });
        expect(writes(dependencies)).toEqual([]);
        expect(
            dependencies.request.mock.calls.some(([, endpoint]) => endpoint === `${root}/pulls/2`),
        ).toBe(false);
    });

    it('deduplicates an existing GitHub Actions marker on a later comment page', async () => {
        // Arrange
        const dependencies = controlled({
            commentPages: (page) =>
                page === 1
                    ? Array.from({ length: 100 }, () => ({ body: 'Earlier comment.' }))
                    : [
                          {
                              body: `@dependabot rebase\n\n${marker}`,
                              user: { login: 'github-actions[bot]', type: 'Bot' },
                          },
                      ],
        });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.skipped).toEqual([{ number: 1, reason: 'already-requested' }]);
        expect(dependencies.request).toHaveBeenCalledWith(
            'GET',
            `${root}/issues/1/comments?per_page=100&page=2`,
            undefined,
        );
        expect(writes(dependencies)).toEqual([]);
    });

    it.each([
        { body: marker, user: { login: 'maintainer', type: 'User' } },
        { body: marker, user: { login: 'github-actions[bot]', type: 'User' } },
        {
            body: '<!-- synapse-dependabot-rebase:older-main -->',
            user: { login: 'github-actions[bot]', type: 'Bot' },
        },
    ])('does not let a foreign or obsolete marker suppress a rebase: %j', async (comment) => {
        // Arrange
        const dependencies = controlled({ commentPages: () => [comment] });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.rebased).toEqual([1]);
        expect(writes(dependencies)).toHaveLength(1);
    });

    it('processes a later PR page once even when the API repeats that PR', async () => {
        // Arrange
        const outsider = pullRequest(2, (value) => (value.user.login = 'maintainer'));
        const dependencies = controlled({
            listed: [pullRequest(101)],
            pullPages: (page) =>
                page === 1 ? Array(100).fill(outsider) : [pullRequest(101), pullRequest(101)],
        });

        // Act
        const result = await rebaseDependabotPullRequests(context, dependencies);

        // Assert
        expect(result.rebased).toEqual([101]);
        expect(dependencies.request).toHaveBeenCalledWith(
            'GET',
            `${root}/pulls?state=open&base=main&per_page=100&page=2`,
            undefined,
        );
        expect(writes(dependencies)).toHaveLength(1);
    });

    it.each(['pulls', 'comments'])(
        'fails closed on incomplete bounded %s pagination',
        async (resource) => {
            // Arrange
            const fullPage = Array(100).fill(
                resource === 'pulls' ? pullRequest() : { body: 'Earlier comment.' },
            );
            const dependencies = controlled(
                resource === 'pulls'
                    ? { pullPages: () => fullPage }
                    : { commentPages: () => fullPage },
            );

            // Act
            const result = rebaseDependabotPullRequests(context, dependencies);

            // Assert
            await expect(result).rejects.toThrow('pagination budget');
            expect(writes(dependencies)).toEqual([]);
        },
    );

    it.each(['pulls', 'comments'])('fails closed on malformed %s pagination', async (resource) => {
        // Arrange
        const invalidPage = { message: 'synthetic-private-value' };
        const dependencies = controlled(
            resource === 'pulls'
                ? { pullPages: () => invalidPage }
                : { commentPages: () => invalidPage },
        );

        // Act
        const result = rebaseDependabotPullRequests(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('invalid Dependabot pagination data');
        expect(writes(dependencies)).toEqual([]);
    });

    it.each(['branches/main', 'pulls?', 'pulls/1', 'compare/', 'issues/1/comments'])(
        'stops on an API failure at %s without exposing diagnostics or writing',
        async (failure) => {
            // Arrange
            const dependencies = controlled({
                fail: (_method, endpoint) => endpoint.includes(failure),
            });

            // Act
            const result = rebaseDependabotPullRequests(context, dependencies);

            // Assert
            await expect(result).rejects.toThrow('GitHub API request failed');
            await expect(result).rejects.not.toThrow('synthetic-private-token');
            expect(writes(dependencies)).toEqual([]);
        },
    );

    it('does not retry a command whose API request failed', async () => {
        // Arrange
        const dependencies = controlled({ fail: (method) => method === 'POST' });

        // Act
        const result = rebaseDependabotPullRequests(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('GitHub API request failed');
        expect(writes(dependencies)).toHaveLength(1);
    });

    it('reports an unconfirmed command without retrying the write', async () => {
        // Arrange
        const dependencies = controlled({ posted: { id: 900, body: 'different response' } });

        // Act
        const result = rebaseDependabotPullRequests(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('did not confirm');
        expect(writes(dependencies)).toHaveLength(1);
    });

    it('requires an existing GH_TOKEN without discovering or printing credentials', async () => {
        // Arrange
        vi.stubEnv('GH_TOKEN', '');

        // Act
        const result = rebaseDependabotPullRequests(context);

        // Assert
        await expect(result).rejects.toThrow('GitHub API request failed');
        expect(system.execFile).not.toHaveBeenCalled();
    });

    it('uses only bounded GitHub CLI API requests with JSON stdin and no token arguments', async () => {
        // Arrange
        vi.stubEnv('GH_TOKEN', 'synthetic-private-token');

        const dependencies = controlled();
        const input = vi.fn();

        system.execFile.mockImplementation((_command, arguments_, _options, callback) => {
            const endpoint = arguments_.find((argument) => argument.startsWith(`${root}/`));
            const method = arguments_[arguments_.indexOf('--method') + 1];

            return {
                stdin: {
                    on: vi.fn(),
                    end: (body) => {
                        input(body);
                        void dependencies
                            .request(method, endpoint, body ? JSON.parse(body) : undefined)
                            .then((value) => callback(null, JSON.stringify(value)));
                    },
                },
            };
        });

        // Act
        const result = await rebaseDependabotPullRequests(context);

        // Assert
        expect(result.rebased).toEqual([1]);
        expect(input).toHaveBeenCalledWith(
            JSON.stringify({ body: `@dependabot rebase\n\n${marker}` }),
        );

        for (const [command, arguments_, options] of system.execFile.mock.calls) {
            expect(command).toBe('gh');
            expect(arguments_.slice(0, 3)).toEqual(['api', '--hostname', 'github.com']);
            expect(arguments_.join(' ')).not.toContain('synthetic-private-token');
            expect(options).toMatchObject({
                timeout: 15_000,
                maxBuffer: 1024 * 1024,
                env: { GH_TOKEN: 'synthetic-private-token', GH_PROMPT_DISABLED: '1' },
            });
        }
    });
});
