// #region Imports

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import { MeetingNotesExample } from './MeetingNotesExample.js';

// #endregion

const owned: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
describe('MeetingNotesExample', () => {
    it('does not present success when owned teardown fails', async () => {
        // Arrange
        const root = await mkdtemp(join(tmpdir(), 'synapse-meeting-cleanup-'));

        owned.push(root);

        const output: string[] = [];

        vi.spyOn(NodeProcessRunner.prototype, 'dispose').mockRejectedValueOnce(
            new Error('Synthetic shutdown failure.'),
        );

        const example = new MeetingNotesExample({
            output: (value) => {
                output.push(value);
            },
            diagnostic: () => undefined,
            input: async () => '',
        });

        // Act
        const result = example.run(
            ['--simulate', '--profile-root', root],
            new AbortController().signal,
        );

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'host' });
        expect(output).toEqual([]);
    });

    it('runs explicitly simulated text through real runtime schema validation without a repository', async () => {
        // Arrange
        const profileRoot = await mkdtemp(join(tmpdir(), 'synapse-meeting-consumer-'));

        owned.push(profileRoot);

        const output: string[] = [];
        const diagnostic: string[] = [];
        const example = new MeetingNotesExample({
            output: (value) => {
                output.push(value);
            },
            diagnostic: (value) => {
                diagnostic.push(value);
            },
            input: async () => {
                throw new Error('No authentication is expected.');
            },
        });

        // Act
        await example.run(
            ['--simulate', '--profile-root', profileRoot],
            new AbortController().signal,
        );

        // Assert
        const notes: unknown = JSON.parse(output[0] ?? 'null');

        expect(notes).toMatchObject({
            summary: expect.any(String),
            decisions: [expect.any(String)],
            tasks: expect.arrayContaining([expect.objectContaining({ owner: 'Mira' })]),
        });
        expect(diagnostic).toContainEqual(expect.stringContaining('no AI inference'));
    });
    it('refuses to silently select simulation or a provider', async () => {
        // Arrange
        const example = new MeetingNotesExample({
            output: () => undefined,
            diagnostic: () => undefined,
            input: async () => '',
        });

        // Act
        const result = example.run([], new AbortController().signal);

        // Assert
        await expect(result).rejects.toMatchObject({ code: 'configuration' });
    });
});
