// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeDependabotPullRequest } from './mergeDependabotPullRequest.mjs';

// #endregion

const { executeGitHub } = vi.hoisted(() => ({ executeGitHub: vi.fn() }));

vi.mock('node:child_process', () => ({ execFileSync: executeGitHub }));

const repositoryPath = 'repos/pixel-brewery/synapse';
const mainSha = 'a'.repeat(40);
const headSha = 'b'.repeat(40);
const mergeSha = 'c'.repeat(40);
const changedSha = 'd'.repeat(40);
const context = {
    eventName: 'workflow_run',
    repository: 'pixel-brewery/synapse',
    runId: 202,
    runAttempt: 2,
};
const jobsPath = `${repositoryPath}/actions/runs/202/attempts/2/jobs?per_page=100&page=`;
const pullRequestPath = `${repositoryPath}/pulls/7`;
const runPath = `${repositoryPath}/actions/runs/202`;
const mainPath = `${repositoryPath}/branches/main`;

function controlled() {
    const repository = { id: 17, full_name: 'pixel-brewery/synapse' };
    const jobs = ['ubuntu-latest', 'macos-latest', 'windows-latest'].map((os, index) => ({
        id: index + 1,
        run_id: 202,
        name: `verify (${os})`,
        status: 'completed',
        conclusion: 'success',
    }));
    const records = {
        workflow: { id: 101, name: 'Verify', path: '.github/workflows/ci.yml' },
        run: {
            id: 202,
            run_attempt: 2,
            event: 'pull_request',
            status: 'completed',
            conclusion: 'success',
            workflow_id: 101,
            name: 'Verify',
            path: '.github/workflows/ci.yml',
            repository,
            head_repository: repository,
            head_sha: headSha,
            pull_requests: [{ number: 7 }],
        },
        pullRequest: {
            number: 7,
            state: 'open',
            draft: false,
            merged: false,
            user: { login: 'dependabot[bot]', type: 'Bot' },
            head: { sha: headSha, repo: repository },
            base: { ref: 'main', sha: mainSha, repo: repository },
        },
        main: { name: 'main', commit: { sha: mainSha } },
        comparison: { behind_by: 0, merge_base_commit: { sha: mainSha } },
        jobs,
        jobPages: [{ total_count: jobs.length, jobs }],
        merge: { merged: true, sha: mergeSha },
    };
    const reads = new Map();
    const request = vi.fn((method, endpoint) => {
        if (records.failure?.method === method && records.failure?.endpoint === endpoint)
            throw new Error('Sensitive upstream output must not reach the caller.');

        if (method === 'PUT' && endpoint === `${pullRequestPath}/merge`)
            return structuredClone(records.merge);

        if (method !== 'GET') throw new Error('Unexpected test request.');

        const count = (reads.get(endpoint) ?? 0) + 1;

        reads.set(endpoint, count);

        if (endpoint === `${repositoryPath}/actions/workflows/ci.yml`)
            return structuredClone(records.workflow);

        if (endpoint === runPath)
            return structuredClone(count > 1 ? (records.nextRun ?? records.run) : records.run);

        if (endpoint === pullRequestPath)
            return structuredClone(
                count > 1 ? (records.nextPullRequest ?? records.pullRequest) : records.pullRequest,
            );

        if (endpoint === mainPath)
            return structuredClone(count > 1 ? (records.nextMain ?? records.main) : records.main);

        if (endpoint === `${repositoryPath}/compare/${mainSha}...${headSha}`)
            return structuredClone(records.comparison);

        if (endpoint.startsWith(jobsPath))
            return structuredClone(records.jobPages[Number(endpoint.slice(jobsPath.length)) - 1]);

        throw new Error('Unexpected test endpoint.');
    });

    return { records, request };
}

function writes(request) {
    return request.mock.calls.filter(([method]) => method !== 'GET');
}

afterEach(() => {
    executeGitHub.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('Dependabot pull request merge', () => {
    it.each([
        'Bump vitest from 4.0.0 to 5.0.0',
        'Bump typescript-eslint from 8.0.0 to 8.1.0',
        'Bump a dependency from 1.0.0 to 1.0.1',
    ])('merges an eligible update once at its tested SHA: %s', async (title) => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.pullRequest.title = title;

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'merged', pullRequestNumber: 7, sha: mergeSha });
        expect(writes(dependencies.request)).toEqual([
            ['PUT', `${pullRequestPath}/merge`, { sha: headSha, merge_method: 'squash' }],
        ]);
        expect(dependencies.request.mock.calls.slice(-4)).toEqual([
            ['GET', pullRequestPath, undefined],
            ['GET', runPath, undefined],
            ['GET', mainPath, undefined],
            ['PUT', `${pullRequestPath}/merge`, { sha: headSha, merge_method: 'squash' }],
        ]);
        expect(dependencies.request).toHaveBeenCalledWith('GET', `${jobsPath}1`, undefined);
    });

    it('accepts the documented workflow path with a ref suffix while retaining canonical workflow identity', async () => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.run.path = '.github/workflows/ci.yml@refs/pull/7/merge';

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result.status).toBe('merged');
        expect(writes(dependencies.request)).toHaveLength(1);
    });

    it.each([
        { eventName: 'pull_request' },
        { eventName: 'workflow_dispatch' },
        { repository: 'untrusted/synapse' },
        { repository: 'pixel-brewery/synapse-lookalike' },
        { runId: undefined },
        { runId: '202/traversal' },
        { runId: Number.MAX_SAFE_INTEGER + 1 },
        { runAttempt: 0 },
        { runAttempt: '2.5' },
    ])('rejects unsupported trigger metadata before any API request: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        // Act
        const result = await mergeDependabotPullRequest({ ...context, ...override }, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'unsupported-context' });
        expect(dependencies.request).not.toHaveBeenCalled();
    });

    it.each([
        { id: undefined },
        { name: 'Other workflow' },
        { path: '.github/workflows/ci.yml.lookalike' },
    ])('rejects a different canonical workflow: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.workflow, override);

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'unexpected-workflow' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each([
        { id: 203 },
        { run_attempt: 1 },
        { run_attempt: 3 },
        { event: 'push' },
        { status: 'in_progress' },
        { conclusion: 'failure' },
        { conclusion: 'skipped' },
        { workflow_id: 102 },
        { name: 'Other workflow' },
        { path: '.github/workflows/other.yml' },
        { path: '.github/workflows/ci.yml.lookalike@main' },
        { path: '.github/workflows/ci.yml@' },
        { repository: { full_name: 'untrusted/synapse' } },
        { head_repository: { full_name: 'untrusted/synapse' } },
        { head_repository: null },
        { head_sha: 'untrusted/branch' },
    ])('rejects an ineligible or superseded workflow run: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.run, override);

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'ineligible-workflow-run' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each([[undefined], [[]], [[{ number: 7 }, { number: 8 }]], [[{ number: 0 }]], [[null]]])(
        'requires exactly one valid associated pull request: %j',
        async (pullRequests) => {
            // Arrange
            const dependencies = controlled();

            dependencies.records.run.pull_requests = pullRequests;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            expect(result).toEqual({ status: 'skipped', reason: 'ambiguous-pull-request' });
            expect(writes(dependencies.request)).toEqual([]);
        },
    );

    it.each([
        { number: 8 },
        { state: 'closed' },
        { draft: true },
        { merged: true },
        { user: { login: 'contributor', type: 'User' } },
        { user: { login: 'dependabot', type: 'Bot' } },
        { user: { login: 'dependabot[bot]', type: 'User' } },
        { head: { sha: headSha, repo: { full_name: 'untrusted/synapse' } } },
        { head: { sha: changedSha, repo: { full_name: 'pixel-brewery/synapse' } } },
        { base: { ref: 'main', sha: mainSha, repo: { full_name: 'untrusted/synapse' } } },
        {
            base: {
                ref: 'other',
                sha: mainSha,
                repo: { full_name: 'pixel-brewery/synapse' },
            },
        },
        {
            base: {
                ref: 'main',
                sha: 'unknown',
                repo: { full_name: 'pixel-brewery/synapse' },
            },
        },
    ])(
        'rejects a pull request outside the Dependabot identity and tested-head gates: %j',
        async (override) => {
            // Arrange
            const dependencies = controlled();

            Object.assign(dependencies.records.pullRequest, override);

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            expect(result).toEqual({ status: 'skipped', reason: 'ineligible-pull-request' });
            expect(writes(dependencies.request)).toEqual([]);
        },
    );

    it.each([
        { status: 'in_progress' },
        { conclusion: 'failure' },
        { conclusion: 'skipped' },
        { conclusion: 'neutral' },
        { conclusion: 'cancelled' },
        { name: 'untrusted job' },
        { run_id: 203 },
        { run_attempt: 1 },
        { id: 2 },
    ])('requires each current-attempt matrix job to succeed exactly once: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.jobs[0], override);

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'incomplete-verification' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each(['missing', 'duplicate', 'extra'])('rejects %s matrix coverage', async (kind) => {
        // Arrange
        const dependencies = controlled();
        const jobs = dependencies.records.jobs;

        if (kind === 'missing') jobs.pop();
        else if (kind === 'duplicate') jobs[2] = { ...jobs[0], id: 4 };
        else jobs.push({ ...jobs[0], id: 4, name: 'extra job' });

        dependencies.records.jobPages[0].total_count = jobs.length;

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'incomplete-verification' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it('reads every job page from the triggering attempt before merging', async () => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.jobPages = [
            { total_count: 3, jobs: dependencies.records.jobs.slice(0, 1) },
            { total_count: 3, jobs: dependencies.records.jobs.slice(1) },
        ];

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result.status).toBe('merged');
        expect(
            dependencies.request.mock.calls.filter(([, endpoint]) => endpoint.includes('/jobs?')),
        ).toEqual([
            ['GET', `${jobsPath}1`, undefined],
            ['GET', `${jobsPath}2`, undefined],
        ]);
    });

    it.each(['count-changed', 'empty-page', 'too-many', 'invalid-shape'])(
        'fails closed when job pagination is incomplete or inconsistent: %s',
        async (kind) => {
            // Arrange
            const dependencies = controlled();
            const jobs = dependencies.records.jobs;

            dependencies.records.jobPages = [
                { total_count: 3, jobs: jobs.slice(0, 1) },
                { total_count: kind === 'count-changed' ? 4 : 3, jobs: jobs.slice(1) },
            ];

            if (kind === 'empty-page') dependencies.records.jobPages[1].jobs = [];
            else if (kind === 'too-many') dependencies.records.jobPages[0].total_count = 1_001;
            else if (kind === 'invalid-shape') dependencies.records.jobPages[0].jobs = null;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            expect(result).toEqual({ status: 'skipped', reason: 'incomplete-verification' });
            expect(writes(dependencies.request)).toEqual([]);
        },
    );

    it.each([
        { behind_by: 1 },
        { merge_base_commit: { sha: changedSha } },
        { merge_base_commit: null },
    ])('requires current main to be an ancestor of the tested head: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.comparison, override);

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'branch-not-current' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it('rejects malformed main metadata without constructing an untrusted compare endpoint', async () => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.main.commit.sha = 'untrusted/branch';

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'invalid-main' });
        expect(
            dependencies.request.mock.calls.some(([, endpoint]) => endpoint.includes('/compare/')),
        ).toBe(false);
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each(['head', 'base', 'author', 'closed'])(
        'rejects a changed pull request before the final write: %s',
        async (kind) => {
            // Arrange
            const dependencies = controlled();
            const next = structuredClone(dependencies.records.pullRequest);

            if (kind === 'head') next.head.sha = changedSha;
            else if (kind === 'base') next.base.sha = changedSha;
            else if (kind === 'author') next.user = { login: 'contributor', type: 'User' };
            else next.state = 'closed';

            dependencies.records.nextPullRequest = next;

            // Act
            const result = await mergeDependabotPullRequest(context, dependencies);

            // Assert
            expect(result).toEqual({ status: 'skipped', reason: 'pull-request-changed' });
            expect(writes(dependencies.request)).toEqual([]);
        },
    );

    it.each([
        { run_attempt: 3 },
        { status: 'in_progress' },
        { conclusion: 'failure' },
        { head_sha: changedSha },
        { pull_requests: [{ number: 8 }] },
    ])('rejects a retried or changed run immediately before merging: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.nextRun = { ...dependencies.records.run, ...override };

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'workflow-run-changed' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it('rejects main moving after the ancestry check', async () => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.nextMain = { commit: { sha: changedSha } };

        // Act
        const result = await mergeDependabotPullRequest(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'skipped', reason: 'main-changed' });
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each([
        ['GET', `${jobsPath}1`],
        ['PUT', `${pullRequestPath}/merge`],
    ])(
        'stops on a rejected API request without leaking its diagnostic or retrying: %s',
        async (method, endpoint) => {
            // Arrange
            const dependencies = controlled();

            dependencies.records.failure = { method, endpoint };

            // Act
            const result = mergeDependabotPullRequest(context, dependencies);

            // Assert
            await expect(result).rejects.toThrow(
                'Dependabot merge stopped after a GitHub API request failed;',
            );
            await expect(result).rejects.not.toThrow('Sensitive upstream output');
            expect(
                dependencies.request.mock.calls.filter(
                    ([calledMethod, calledEndpoint]) =>
                        calledMethod === method && calledEndpoint === endpoint,
                ),
            ).toHaveLength(1);
            expect(writes(dependencies.request)).toHaveLength(method === 'PUT' ? 1 : 0);
        },
    );

    it('requires an explicit merge confirmation without retrying or exposing the API message', async () => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.merge = {
            merged: false,
            message: 'Sensitive merge diagnostic must not reach the caller.',
        };

        // Act
        const result = mergeDependabotPullRequest(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('GitHub did not confirm');
        await expect(result).rejects.not.toThrow('Sensitive merge diagnostic');
        expect(writes(dependencies.request)).toHaveLength(1);
    });
});

describe('Dependabot GitHub CLI boundary', () => {
    it('uses only the supplied job token and bounded direct GitHub API calls', async () => {
        // Arrange
        const dependencies = controlled();

        vi.stubEnv('GH_TOKEN', 'test-workflow-job-token');
        executeGitHub.mockImplementation((_command, arguments_, options) => {
            const method = arguments_[arguments_.indexOf('--method') + 1];
            const endpoint = arguments_.find((argument) => argument.startsWith('repos/'));
            const body = options.input === undefined ? undefined : JSON.parse(options.input);

            return JSON.stringify(dependencies.request(method, endpoint, body));
        });

        // Act
        const result = await mergeDependabotPullRequest({
            ...context,
            runId: String(context.runId),
            runAttempt: String(context.runAttempt),
        });

        // Assert
        expect(result.status).toBe('merged');
        expect(writes(dependencies.request)).toEqual([
            ['PUT', `${pullRequestPath}/merge`, { sha: headSha, merge_method: 'squash' }],
        ]);

        for (const [command, arguments_, options] of executeGitHub.mock.calls) {
            expect(command).toBe('gh');
            expect(arguments_.slice(0, 3)).toEqual(['api', '--hostname', 'github.com']);
            expect(arguments_).not.toContain('auth');
            expect(arguments_).not.toContain('test-workflow-job-token');
            expect(options).toEqual(
                expect.objectContaining({
                    env: expect.objectContaining({ GH_TOKEN: 'test-workflow-job-token' }),
                    timeout: 15_000,
                    maxBuffer: 4 * 1024 * 1024,
                    stdio: ['pipe', 'pipe', 'pipe'],
                }),
            );
        }
    });

    it('does not fall back to stored credentials or another token when the job token is absent', async () => {
        // Arrange
        vi.stubEnv('GH_TOKEN', '');
        vi.stubEnv('GITHUB_TOKEN', 'test-secondary-token');

        // Act
        const result = mergeDependabotPullRequest(context);

        // Assert
        await expect(result).rejects.toThrow('GitHub API request failed');
        expect(executeGitHub).not.toHaveBeenCalled();
    });

    it.each(['command-failure', 'invalid-json'])(
        'sanitizes subprocess and JSON failures: %s',
        async (kind) => {
            // Arrange
            vi.stubEnv('GH_TOKEN', 'test-workflow-job-token');
            executeGitHub.mockImplementation(() => {
                if (kind === 'command-failure')
                    throw new Error('Sensitive CLI output test-workflow-job-token');

                return 'Sensitive invalid response test-workflow-job-token';
            });

            // Act
            const result = mergeDependabotPullRequest(context);

            // Assert
            await expect(result).rejects.toThrow('GitHub API request failed');
            await expect(result).rejects.not.toThrow('test-workflow-job-token');
            expect(executeGitHub).toHaveBeenCalledTimes(1);
        },
    );
});
