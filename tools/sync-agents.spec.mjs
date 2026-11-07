// #region Imports

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
    const base = join(root, '.agents/skills/architect');

    await mkdir(join(skill, 'references'), { recursive: true });
    await mkdir(join(base, 'references/common'), { recursive: true });
    await mkdir(join(root, '.vscode'));
    await writeFile(join(root, 'AGENTS.md'), '# Shared rules\n');
    await writeFile(
        join(root, '.agents/config.json'),
        JSON.stringify({
            skill: 'synapse-architect',
            baseSkill: 'architect',
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
        '---\nname: synapse-architect\ndescription: Architecture\nmetadata:\n  inherits: architect\n---\n[Base](../architect/SKILL.md)\n[Project](references/project.md)\n',
    );
    await writeFile(join(skill, 'references/project.md'), '# Project contract\n');
    await writeFile(
        join(base, 'SKILL.md'),
        '---\nname: architect\ndescription: Shared foundations\n---\n[Workflow](references/common/workflow.md)\n',
    );
    await writeFile(join(base, 'references/common/workflow.md'), '# Shared workflow\n');

    return { root, skill, base };
}

async function previousArchitectureImport(root, source = 'pixel-brewery/skills') {
    const directory = join(root, '.opencode/skills/architecture');
    const files = new Map([
        [
            'SKILL.md',
            '---\nname: architecture\ndescription: Previous shared foundation.\n---\n[Workflow](references/common/workflow.md)\n',
        ],
        ['references/common/workflow.md', '# Previously imported workflow\n'],
    ]);
    const hash = createHash('sha256');

    for (const name of [...files.keys()].sort((left, right) => left.localeCompare(right))) {
        await mkdir(join(directory, name, '..'), { recursive: true });
        await writeFile(join(directory, name), files.get(name));
        hash.update(name);
        hash.update(files.get(name));
    }

    await writeFile(
        join(root, 'skills-lock.json'),
        JSON.stringify({
            version: 1,
            skills: {
                architecture: {
                    source,
                    sourceType: 'github',
                    skillPath: 'skills/architecture/SKILL.md',
                    ref: 'a'.repeat(40),
                    computedHash: hash.digest('hex'),
                },
            },
        }),
    );
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['add', 'skills-lock.json'], { cwd: root });
    execFileSync(
        'git',
        [
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.invalid',
            '-c',
            'commit.gpgSign=false',
            '-c',
            `core.hooksPath=${join(root, '.git/no-hooks')}`,
            'commit',
            '--quiet',
            '-m',
            'Record previous skill import',
        ],
        { cwd: root },
    );
    await writeFile(
        join(root, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { architect: {} } }),
    );

    return directory;
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
            expect(await readFile(join(root, mirror, 'architect/SKILL.md'), 'utf8')).toBe(
                await readFile(join(base, 'SKILL.md'), 'utf8'),
            );
            expect(
                await readFile(join(root, mirror, 'synapse-architect/SKILL.md'), 'utf8'),
            ).toContain('[Base](../architect/SKILL.md)');
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

    it('reports the prior architecture mirror as drift without deleting it in check mode', async () => {
        const { root } = await fixture();

        await syncAgents({ root, write: true });

        const retired = await previousArchitectureImport(root);
        const original = await readFile(join(retired, 'SKILL.md'), 'utf8');

        const result = await syncAgents({ root });

        expect(result.differences).toEqual(['.opencode/skills/architecture']);
        expect(await readFile(join(retired, 'SKILL.md'), 'utf8')).toBe(original);
    });

    it('retires only the verified old architecture projection and leaves custom skills intact', async () => {
        const { root } = await fixture();
        const retired = await previousArchitectureImport(root);
        const custom = join(root, '.opencode/skills/custom/SKILL.md');

        await mkdir(join(custom, '..'), { recursive: true });
        await writeFile(custom, '# Custom skill\n');

        const result = await syncAgents({ root, write: true });

        expect(result.differences).toContain('.opencode/skills/architecture');
        await expect(readFile(join(retired, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await readFile(custom, 'utf8')).toBe('# Custom skill\n');
        expect((await syncAgents({ root })).differences).toEqual([]);
    });

    it('preserves custom additions to the old mirror and fails before writing projections', async () => {
        const { root } = await fixture();
        const retired = await previousArchitectureImport(root);
        const custom = join(retired, 'notes.md');

        await writeFile(custom, '# Keep this local customization\n');

        await expect(syncAgents({ root, write: true })).rejects.toThrow(
            'content differs from the prior pinned import',
        );

        expect(await readFile(custom, 'utf8')).toBe('# Keep this local customization\n');
        await expect(readFile(join(root, 'CLAUDE.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('preserves an architecture directory whose prior import cannot be proven', async () => {
        const { root } = await fixture();
        const custom = join(root, '.opencode/skills/architecture/SKILL.md');

        await mkdir(join(custom, '..'), { recursive: true });
        await writeFile(custom, '# Custom architecture guidance\n');

        await expect(syncAgents({ root, write: true })).rejects.toThrow(
            'no verifiable prior pinned import',
        );

        expect(await readFile(custom, 'utf8')).toBe('# Custom architecture guidance\n');
        await expect(readFile(join(root, 'CLAUDE.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('preserves a matching architecture skill imported from another source', async () => {
        const { root } = await fixture();
        const retired = await previousArchitectureImport(root, 'another/skills');
        const original = await readFile(join(retired, 'SKILL.md'), 'utf8');

        await expect(syncAgents({ root, write: true })).rejects.toThrow(
            'no verifiable prior pinned import',
        );

        expect(await readFile(join(retired, 'SKILL.md'), 'utf8')).toBe(original);
    });

    it('refuses a retired mirror symlink without following it into canonical guidance', async () => {
        const { root, base } = await fixture();

        await mkdir(join(root, '.opencode/skills'), { recursive: true });
        await symlink(base, join(root, '.opencode/skills/architecture'), 'dir');

        const original = await readFile(join(base, 'SKILL.md'), 'utf8');

        await expect(syncAgents({ root, write: true })).rejects.toThrow('symlink');

        expect(await readFile(join(base, 'SKILL.md'), 'utf8')).toBe(original);
    });
});
