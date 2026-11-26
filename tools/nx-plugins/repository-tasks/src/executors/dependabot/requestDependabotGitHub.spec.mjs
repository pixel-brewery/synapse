// #region Imports

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';

// #endregion

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('node:child_process', () => ({ execFileSync: execute }));

afterEach(() => {
    execute.mockReset();
    vi.unstubAllEnvs();
});

describe('Dependency verification dispatch transport', () => {
    it('accepts the empty successful dispatch response using only the supplied workflow token', () => {
        // Arrange
        vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
        execute.mockReturnValue('');

        // Act
        const result = requestDependabotGitHub(
            'POST',
            'repos/pixel-brewery/synapse/actions/workflows/ci.yml/dispatches',
            {
                ref: 'dependabot/npm_and_yarn/frameworks',
                inputs: { expected_head_sha: 'a'.repeat(40) },
            },
        );

        // Assert
        expect(result).toBeUndefined();

        const [command, arguments_, options] = execute.mock.calls[0];

        expect(command).toBe('gh');
        expect(arguments_).not.toContain('synthetic-workflow-token');
        expect(arguments_).not.toContain('auth');
        expect(options.timeout).toBe(15_000);
        expect(options.env.GH_TOKEN).toBe('synthetic-workflow-token');
    });

    it('rejects an empty metadata response rather than treating it as a successful read', () => {
        // Arrange
        vi.stubEnv('GH_TOKEN', 'synthetic-workflow-token');
        execute.mockReturnValue('');

        // Act
        const read = () => requestDependabotGitHub('GET', 'repositories/1439526639');

        // Assert
        expect(read).toThrow();
    });
});
