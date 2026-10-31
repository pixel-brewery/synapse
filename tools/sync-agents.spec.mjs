// #region Imports

import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { syncAgents } from './sync-agents.mjs';

// #endregion

const owned = [];

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'synapse-agents-'));

    owned.push(root);

    const skill = join(root, '.agents/skills/synapse-architect');
    const base = join(root, '.agents/skills/architecture');

    await mkdir(join(skill, 'references'), { recursive: true });
    await mkdir(join(base, 'references/common'), { recursive: true });
    await mkdir(join(root, '.vscode'));
    await writeFile(join(root, 'AGENTS.md'), '# Shared rules\n');
    await writeFile(
        join(root, '.agents/config.json'),
        JSON.stringify({
            skill: 'synapse-architect',
            baseSkill: 'architecture',
            mcpRegistry: '.vscode/mcp.json',
            skillMirrors: ['.claude/skills', '.opencode/skills'],
        }),
    );
    await writeFile(
        join(root, '.vscode/mcp.json'),
        JSON.stringify({
            servers: { nx: { type: 'stdio', command: 'yarn', args: ['nx', 'mcp'] } },
        }),
    );
    await writeFile(
        join(skill, 'SKILL.md'),
        '---\nname: synapse-architect\ndescription: Architecture\nmetadata:\n  inherits: architecture\n---\n[Base](../architecture/SKILL.md)\n[Project](references/project.md)\n',
    );
    await writeFile(join(skill, 'references/project.md'), '# Project contract\n');
    await writeFile(
        join(base, 'SKILL.md'),
        '---\nname: architecture\ndescription: Shared foundations\n---\n[Workflow](references/common/workflow.md)\n',
    );
    await writeFile(join(base, 'references/common/workflow.md'), '# Shared workflow\n');

    return { root, skill, base };
}

afterEach(async () => {
    await Promise.all(owned.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('AI client projections', () => {
    it('generates all clients from one source and detects later mirror drift', async () => {
        // Arrange
        const { root } = await fixture();

        await syncAgents({ root, write: true });
        await writeFile(
            join(root, '.claude/skills/synapse-architect/references/project.md'),
            'Altered rules',
        );

        // Act
        const result = await syncAgents({ root });

        // Assert
        expect(result.differences).toEqual([
            join('.claude', 'skills', 'synapse-architect', 'references', 'project.md'),
        ]);
        expect(
            JSON.parse(await readFile(join(root, 'opencode.json'), 'utf8')).instructions,
        ).toContain('.agents/skills/synapse-architect/SKILL.md');
    });

    it('rejects a broken canonical reference before producing clients', async () => {
        // Arrange
        const { root, skill } = await fixture();

        await writeFile(join(skill, 'SKILL.md'), '[Missing](references/missing.md)');

        // Act / Assert
        await expect(syncAgents({ root, write: true })).rejects.toThrow(
            'Broken canonical references',
        );
    });

    it('mirrors the base and preserves derived links across both client skill trees', async () => {
        // Arrange
        const { root, base } = await fixture();

        // Act
        await syncAgents({ root, write: true });

        const result = await syncAgents({ root });

        // Assert
        expect(result.differences).toEqual([]);

        for (const mirror of ['.claude/skills', '.opencode/skills']) {
            expect(await readFile(join(root, mirror, 'architecture/SKILL.md'), 'utf8')).toBe(
                await readFile(join(base, 'SKILL.md'), 'utf8'),
            );
            expect(
                await readFile(join(root, mirror, 'synapse-architect/SKILL.md'), 'utf8'),
            ).toContain('[Base](../architecture/SKILL.md)');
        }
    });

    it('rejects missing inherited guidance before producing client projections', async () => {
        // Arrange
        const { root, base } = await fixture();

        await rm(join(base, 'references/common/workflow.md'));

        // Act / Assert
        await expect(syncAgents({ root, write: true })).rejects.toThrow(
            'Broken canonical references',
        );
    });

    it('never overwrites canonical files through a client mirror symlink', async () => {
        // Arrange
        const { root, skill } = await fixture();

        await mkdir(join(root, '.claude/skills'), { recursive: true });
        await symlink(skill, join(root, '.claude/skills/synapse-architect'), 'dir');

        const original = await readFile(join(skill, 'SKILL.md'), 'utf8');

        // Act
        const result = syncAgents({ root, write: true });

        // Assert
        await expect(result).rejects.toThrow('symlink');
        expect(await readFile(join(skill, 'SKILL.md'), 'utf8')).toBe(original);
    });
});
