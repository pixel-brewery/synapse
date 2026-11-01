// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMergedRelease } from './requestMergedRelease.mjs';

// #endregion

const { executeGitHub } = vi.hoisted(() => ({ executeGitHub: vi.fn() }));

vi.mock('node:child_process', () => ({ execFileSync: executeGitHub }));

const repository = 'pixel-brewery/synapse';
const repositoryId = 1439526639;
const repositoryPath = `repos/${repository}`;
const sourceSha = 'a'.repeat(40);
const changedSha = 'b'.repeat(40);
const workflowId = 303;
const workflowEndpoint = `${repositoryPath}/actions/workflows/${workflowId}`;
const mainPath = `${repositoryPath}/branches/main`;
const context = { eventName: 'workflow_run', repository, repositoryId, sourceSha };

function controlled() {
    const identity = { id: repositoryId, full_name: repository };
    const records = {
        repository: { ...identity, default_branch: 'main', private: false, fork: false },
        main: { name: 'main', commit: { sha: sourceSha } },
        workflow: {
            id: workflowId,
            path: '.github/workflows/release.yml',
            name: 'Continuous Package Release',
            state: 'active',
        },
        runs: { total_count: 0, workflow_runs: [] },
        run: {
            id: 404,
            workflow_id: workflowId,
            path: '.github/workflows/release.yml',
            head_sha: sourceSha,
            head_branch: 'main',
            event: 'workflow_dispatch',
            repository: identity,
            head_repository: identity,
            status: 'queued',
            conclusion: null,
        },
    };
    let mainReads = 0;
    const request = vi.fn((method, endpoint) => {
        if (records.failure?.method === method && records.failure?.endpoint === endpoint)
            throw new Error('Sensitive request output must not be exposed.');

        if (method === 'GET' && endpoint === `repositories/${repositoryId}`)
            return structuredClone(records.repository);

        if (method === 'GET' && endpoint === mainPath) {
            mainReads++;

            return structuredClone(
                mainReads > 1 ? (records.nextMain ?? records.main) : records.main,
            );
        }

        if (method === 'GET' && endpoint === `${repositoryPath}/actions/workflows/release.yml`)
            return structuredClone(records.workflow);

        if (
            method === 'GET' &&
            endpoint === `${workflowEndpoint}/runs?head_sha=${sourceSha}&per_page=100`
        )
            return structuredClone(records.runs);

        if (method === 'POST' && endpoint === `${workflowEndpoint}/dispatches`) {
            if (records.acceptThenFail) {
                records.runs = { total_count: 1, workflow_runs: [records.run] };

                throw new Error('Response was lost after the request was accepted.');
            }

            return undefined;
        }

        throw new Error('Unexpected test request.');
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

describe('Merged source release request', () => {
    it('requests one patch release bound to the exact successful merge source', async () => {
        // Arrange
        const dependencies = controlled();

        // Act
        const result = await requestMergedRelease(
            { ...context, repositoryId: String(repositoryId) },
            dependencies,
        );

        // Assert
        expect(result).toEqual({ status: 'requested', sourceSha });
        expect(writes(dependencies.request)).toEqual([
            [
                'POST',
                `${workflowEndpoint}/dispatches`,
                { ref: 'main', inputs: { specifier: 'patch', source_sha: sourceSha } },
            ],
        ]);
        expect(dependencies.request.mock.calls.at(-2)).toEqual(['GET', mainPath, undefined]);
    });

    it.each([
        { eventName: 'pull_request' },
        { repository: 'foreign/project' },
        { repositoryId: 1 },
        { sourceSha: '' },
        { sourceSha: 'not-a-revision' },
    ])('rejects unsupported request context before reading or writing: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        // Act
        const result = requestMergedRelease({ ...context, ...override }, dependencies);

        // Assert
        await expect(result).rejects.toThrow('Release request failed');
        expect(dependencies.request).not.toHaveBeenCalled();
    });

    it.each([
        { id: 1 },
        { full_name: 'foreign/project' },
        { private: true },
        { fork: true },
        { default_branch: 'dev' },
    ])('rejects changed immutable repository metadata: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.repository, override);

        // Act
        const result = requestMergedRelease(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('Release request failed');
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each([
        { id: 0 },
        { name: 'Other release' },
        { path: '.github/workflows/release.yml.lookalike' },
        { state: 'disabled_manually' },
    ])('requires the exact active release workflow: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.workflow, override);

        // Act
        const result = requestMergedRelease(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('Release request failed');
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each(['before-inspection', 'before-dispatch'])(
        'does not release a superseded merge source: %s',
        async (phase) => {
            // Arrange
            const dependencies = controlled();
            const moved = { name: 'main', commit: { sha: changedSha } };

            if (phase === 'before-inspection') dependencies.records.main = moved;
            else dependencies.records.nextMain = moved;

            // Act
            const result = await requestMergedRelease(context, dependencies);

            // Assert
            expect(result).toEqual({ status: 'superseded', sourceSha });
            expect(writes(dependencies.request)).toEqual([]);
        },
    );

    it.each(['queued', 'success', 'failure', 'cancelled'])(
        'retains an existing release attempt rather than creating another candidate: %s',
        async (outcome) => {
            // Arrange
            const dependencies = controlled();

            dependencies.records.run.status = outcome === 'queued' ? 'queued' : 'completed';
            dependencies.records.run.conclusion = outcome === 'queued' ? null : outcome;
            dependencies.records.runs = {
                total_count: 1,
                workflow_runs: [dependencies.records.run],
            };

            // Act
            const result = await requestMergedRelease(context, dependencies);

            // Assert
            expect(result).toEqual({ status: 'already-requested', sourceSha, runId: 404 });
            expect(writes(dependencies.request)).toEqual([]);
        },
    );

    it.each([
        { total_count: -1, workflow_runs: [] },
        { total_count: 0, workflow_runs: null },
        { total_count: 1, workflow_runs: [] },
    ])('fails closed for an incomplete workflow-run listing: %j', async (runs) => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.runs = runs;

        // Act
        const result = requestMergedRelease(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('Release request failed');
        expect(writes(dependencies.request)).toEqual([]);
    });

    it.each([
        { id: 0 },
        { head_sha: changedSha },
        { workflow_id: 304 },
        { event: 'pull_request' },
        { head_branch: 'dev' },
        { repository: {} },
        { head_repository: {} },
    ])('rejects foreign or malformed existing release identities: %j', async (override) => {
        // Arrange
        const dependencies = controlled();

        Object.assign(dependencies.records.run, override);
        dependencies.records.runs = { total_count: 1, workflow_runs: [dependencies.records.run] };

        // Act
        const result = requestMergedRelease(context, dependencies);

        // Assert
        await expect(result).rejects.toThrow('Release request failed');
        expect(writes(dependencies.request)).toEqual([]);
    });

    it('recovers an ambiguous dispatch response by finding the original accepted run', async () => {
        // Arrange
        const dependencies = controlled();

        dependencies.records.acceptThenFail = true;
        await expect(requestMergedRelease(context, dependencies)).rejects.toThrow(
            'Release request failed',
        );

        // Act
        const result = await requestMergedRelease(context, dependencies);

        // Assert
        expect(result).toEqual({ status: 'already-requested', sourceSha, runId: 404 });
        expect(writes(dependencies.request)).toHaveLength(1);
    });

    it('uses bounded native-token API execution and accepts an empty dispatch response', async () => {
        // Arrange
        const dependencies = controlled();

        vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
        executeGitHub.mockImplementation((_command, arguments_, options) => {
            const method = arguments_[arguments_.indexOf('--method') + 1];
            const endpoint = arguments_.find(
                (argument) => argument.startsWith('repos/') || argument.startsWith('repositories/'),
            );
            const result = dependencies.request(
                method,
                endpoint,
                options.input === undefined ? undefined : JSON.parse(options.input),
            );

            return result === undefined ? '' : JSON.stringify(result);
        });

        // Act
        const result = await requestMergedRelease(context);

        // Assert
        expect(result.status).toBe('requested');

        for (const [command, arguments_, options] of executeGitHub.mock.calls) {
            expect(command).toBe('gh');
            expect(arguments_).not.toContain('synthetic-workflow-token');
            expect(arguments_).not.toContain('auth');
            expect(options).toEqual(
                expect.objectContaining({
                    env: expect.objectContaining({
                        GH_TOKEN: 'synthetic-workflow-token',
                        GH_PROMPT_DISABLED: '1',
                    }),
                    timeout: 15_000,
                    maxBuffer: 4 * 1024 * 1024,
                    stdio: ['pipe', 'pipe', 'pipe'],
                }),
            );
        }
    });

    it('never falls back to stored credentials or a secondary token', async () => {
        // Arrange
        vi.stubEnv('GH_TOKEN', '');
        vi.stubEnv('GITHUB_TOKEN', 'synthetic-secondary-token');

        // Act
        const result = requestMergedRelease(context);

        // Assert
        await expect(result).rejects.toThrow('Release request failed');
        expect(executeGitHub).not.toHaveBeenCalled();
    });

    it.each(['command-failure', 'invalid-json'])(
        'sanitizes native API failures: %s',
        async (kind) => {
            // Arrange
            vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
            executeGitHub.mockImplementation(() => {
                if (kind === 'command-failure')
                    throw new Error('Sensitive synthetic-workflow-token');

                return 'Sensitive invalid response synthetic-workflow-token';
            });

            // Act
            const result = requestMergedRelease(context);

            // Assert
            await expect(result).rejects.toThrow('Release request failed');
            await expect(result).rejects.not.toThrow('synthetic-workflow-token');
        },
    );
});
