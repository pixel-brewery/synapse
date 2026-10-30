// #region Imports

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPublishedPackages } from './verifyPublishedPackages.mjs';

// #endregion

const boundaries = vi.hoisted(() => ({
    open: vi.fn(),
    realpath: vi.fn(),
    graph: vi.fn(),
    execute: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    open: boundaries.open,
    realpath: boundaries.realpath,
}));
vi.mock('@nx/devkit', () => ({ createProjectGraphAsync: boundaries.graph }));
vi.mock('node:child_process', () => {
    const execFile = vi.fn();

    execFile[Symbol.for('nodejs.util.promisify.custom')] = boundaries.execute;

    return { execFile };
});

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = 'git+https://github.com/pixel-brewery/synapse.git';
const version = '1.2.3';
const projects = [
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
let manifests;
let registryMetadata;
let visibilityMetadata;
let fetchMock;
let output;

function directory(project) {
    return project === 'synapse-mcp' ? 'tools/mcp' : `libs/${project}`;
}

function printed() {
    return output.mock.calls.map(([value]) => value).join('');
}

beforeEach(() => {
    vi.clearAllMocks();

    for (const name of ['NODE_AUTH_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) vi.stubEnv(name, '');

    manifests = new Map(
        projects.map((project) => [
            project,
            {
                name: `@pixel-brewery/${project}`,
                version,
                publishConfig: { registry: 'https://npm.pkg.github.com', access: 'public' },
                repository: { type: 'git', url: repository },
            },
        ]),
    );
    registryMetadata = (project) => ({
        versions: {
            [version]: { name: `@pixel-brewery/${project}`, version, repository },
        },
        'dist-tags': { latest: version },
    });
    visibilityMetadata = (project) => ({
        name: project,
        package_type: 'npm',
        owner: { login: 'pixel-brewery' },
        visibility: 'public',
    });
    boundaries.realpath.mockImplementation(async (file) => resolve(file));
    boundaries.graph.mockResolvedValue({
        nodes: Object.fromEntries(
            projects.map((project) => [project, { data: { root: directory(project) } }]),
        ),
    });
    boundaries.open.mockImplementation(async (file) => {
        const project = projects.find(
            (candidate) => file === join(root, directory(candidate), 'package.json'),
        );
        const value =
            file === join(root, 'nx.json')
                ? { release: { groups: { synapse: { projectsRelationship: 'fixed', projects } } } }
                : manifests.get(project);

        if (!value) throw new Error('Unexpected controlled metadata path.');

        const bytes = Buffer.from(JSON.stringify(value));
        let position = 0;

        return {
            read: vi.fn(async (buffer, offset, length) => {
                const chunk = bytes.subarray(position, position + length);

                buffer.set(chunk, offset);
                position += chunk.length;

                return { bytesRead: chunk.length };
            }),
            close: vi.fn(async () => undefined),
        };
    });
    boundaries.execute.mockResolvedValue({ stdout: 'synthetic-cli-token\n', stderr: '' });
    fetchMock = vi.fn(async (url) => {
        const endpoint = new URL(url);
        const project = decodeURIComponent(endpoint.pathname).split('/').at(-1);

        if (!projects.includes(project)) throw new Error('Unexpected controlled endpoint.');

        return new Response(
            JSON.stringify(
                endpoint.hostname === 'npm.pkg.github.com'
                    ? registryMetadata(project)
                    : visibilityMetadata(project),
            ),
            { headers: { 'content-type': 'application/json' } },
        );
    });
    vi.stubGlobal('fetch', fetchMock);
    output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('published package verification', () => {
    it.each([
        'git+https://github.com/pixel-brewery/synapse.git',
        'https://github.com/pixel-brewery/synapse',
        'ssh://git@github.com/pixel-brewery/synapse.git',
        'git@github.com:pixel-brewery/synapse.git',
    ])(
        'accepts the organization source identity for local and registry metadata: %s',
        async (url) => {
            // Arrange
            vi.stubEnv('NODE_AUTH_TOKEN', 'synthetic-node-token');

            for (const manifest of manifests.values()) manifest.repository.url = url;

            const original = registryMetadata;

            registryMetadata = (project) => {
                const metadata = original(project);

                metadata.versions[version].repository = { type: 'git', url };

                return metadata;
            };

            // Act
            await verifyPublishedPackages();

            // Assert
            expect(fetchMock).toHaveBeenCalledTimes(20);
            expect(boundaries.execute).not.toHaveBeenCalled();
            expect(printed()).toContain(`Verified all 10 public Synapse packages at ${version}`);
            expect(
                fetchMock.mock.calls.map(([endpoint]) => new URL(endpoint).hostname).sort(),
            ).toEqual([
                ...Array(10).fill('api.github.com'),
                ...Array(10).fill('npm.pkg.github.com'),
            ]);

            for (const [, options] of fetchMock.mock.calls)
                expect(options).toMatchObject({
                    redirect: 'error',
                    headers: { Authorization: 'Bearer synthetic-node-token' },
                });
        },
    );

    it.each([
        'https://github.com/former-owner/synapse.git',
        'https://github.com.evil.invalid/pixel-brewery/synapse.git',
        'https://github.com/pixel-brewery/synapse-lookalike.git',
        'https://synthetic-user:synthetic-private-value@github.com/pixel-brewery/synapse.git',
        'https://synthetic-user@github.com/pixel-brewery/synapse.git',
        'https://github.com:444/pixel-brewery/synapse.git',
        'https://github.com/pixel-brewery/synapse.git?token=synthetic-private-value',
        'https://github.com/pixel-brewery/synapse.git#unexpected',
    ])(
        'rejects foreign or credentialed registry source URLs without echoing them: %s',
        async (url) => {
            // Arrange
            const original = registryMetadata;

            registryMetadata = (project) => {
                const metadata = original(project);

                metadata.versions[version].repository = url;

                return metadata;
            };

            // Act
            const result = verifyPublishedPackages();

            // Assert
            await expect(result).rejects.toThrow('matching pixel-brewery/synapse source URL');
            expect(printed()).toContain('repository=mismatch');
            expect(printed()).not.toContain(url);
            expect(printed()).not.toContain('synthetic-private-value');
        },
    );

    it('rejects an old local source before retrieving credentials or requesting registry data', async () => {
        // Arrange
        manifests.get('synapse-core').repository.url =
            'https://github.com/former-owner/synapse.git';

        // Act
        const result = verifyPublishedPackages();

        // Assert
        await expect(result).rejects.toThrow('inconsistent publication metadata');
        expect(boundaries.execute).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        {
            values: [' synthetic-node-token ', 'synthetic-gh-token', 'synthetic-github-token'],
            selected: 'synthetic-node-token',
        },
        {
            values: [' ', ' synthetic-gh-token ', 'synthetic-github-token'],
            selected: 'synthetic-gh-token',
        },
        {
            values: ['', ' ', ' synthetic-github-token '],
            selected: 'synthetic-github-token',
        },
    ])(
        'preserves the existing environment credential precedence: $selected',
        async ({ values, selected }) => {
            // Arrange
            ['NODE_AUTH_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].forEach((name, index) =>
                vi.stubEnv(name, values[index]),
            );

            // Act
            await verifyPublishedPackages();

            // Assert
            expect(boundaries.execute).not.toHaveBeenCalled();
            expect(
                fetchMock.mock.calls.every(
                    ([, options]) => options.headers.Authorization === `Bearer ${selected}`,
                ),
            ).toBe(true);
            expect(printed()).not.toContain(selected);
        },
    );

    it('uses the active GitHub CLI account without selecting or changing an account', async () => {
        // Arrange
        boundaries.execute.mockResolvedValue({ stdout: ' synthetic-cli-token\n', stderr: '' });

        // Act
        await verifyPublishedPackages();

        // Assert
        expect(boundaries.execute).toHaveBeenCalledExactlyOnceWith(
            'gh',
            ['auth', 'token', '--hostname', 'github.com'],
            expect.objectContaining({ timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 }),
        );
        expect(
            fetchMock.mock.calls.every(
                ([, options]) => options.headers.Authorization === 'Bearer synthetic-cli-token',
            ),
        ).toBe(true);
        expect(printed()).not.toContain('synthetic-cli-token');
    });

    it('sanitizes unavailable CLI authentication without making network requests', async () => {
        // Arrange
        const sensitive = 'synthetic-private-value';

        boundaries.execute.mockRejectedValue(new Error(`Controlled CLI output: ${sensitive}`));

        // Act
        const result = verifyPublishedPackages();

        // Assert
        await expect(result).rejects.toThrow('use the active GitHub CLI account');
        await expect(result).rejects.not.toThrow(sensitive);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(printed()).not.toContain(sensitive);
    });

    it('does not expose failed request diagnostics or credentials in verification output', async () => {
        // Arrange
        const sensitive = 'synthetic-request-token';

        vi.stubEnv('NODE_AUTH_TOKEN', sensitive);
        fetchMock.mockRejectedValue(new Error(`Controlled transport error: ${sensitive}`));

        // Act
        const result = verifyPublishedPackages();

        // Assert
        await expect(result).rejects.toThrow('Published package verification failed');
        await expect(result).rejects.not.toThrow(sensitive);
        expect(printed()).toContain('request or JSON validation failed');
        expect(printed()).not.toContain(sensitive);
    });

    it.each(['private', 'foreign-owner', 'different-latest', 'different-version'])(
        'retains strict registry version and organization ACL validation: %s',
        async (failure) => {
            // Arrange
            const originalRegistry = registryMetadata;
            const originalVisibility = visibilityMetadata;

            registryMetadata = (project) => {
                const metadata = originalRegistry(project);

                if (failure === 'different-latest') metadata['dist-tags'].latest = '1.2.4';

                if (failure === 'different-version') metadata.versions[version].version = '1.2.4';

                return metadata;
            };
            visibilityMetadata = (project) => ({
                ...originalVisibility(project),
                ...(failure === 'private' ? { visibility: 'private' } : {}),
                ...(failure === 'foreign-owner' ? { owner: { login: 'foreign-owner' } } : {}),
            });

            // Act
            const result = verifyPublishedPackages();

            // Assert
            await expect(result).rejects.toThrow('Published package verification failed');
            expect(printed()).not.toContain('Verified all');
        },
    );
});
