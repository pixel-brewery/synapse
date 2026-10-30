// #region Imports

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origin = JSON.parse(await readFile(join(root, '.agents/architect-origin.json'), 'utf8'));
const skill = join(root, '.agents/skills/synapse-architect');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const failures = [];
const common = join(skill, 'references/common');
const actual = (await readdir(common)).filter((name) => name.endsWith('.md')).sort();

if (JSON.stringify(actual) !== JSON.stringify(Object.keys(origin.common).sort()))
    failures.push('Shared foundation file set changed.');

for (const [name, expected] of Object.entries(origin.common)) {
    if (digest(await readFile(join(common, name))) !== expected)
        failures.push(`Changed shared foundation: ${name}`);
}

const entry = await readFile(join(skill, 'SKILL.md'), 'utf8');
const block = entry.match(/<!-- architect-core:start -->[\s\S]*?<!-- architect-core:end -->/u)?.[0];

if (!block || digest(block) !== origin.sharedBlockSha256)
    failures.push('Shared architect workflow block changed.');

if (failures.length) {
    process.stderr.write(
        `${failures.join('\n')}\nReview upstream changes and intentionally update the origin record.\n`,
    );
    process.exitCode = 1;
} else
    process.stdout.write(
        `Archipel foundations retained (${actual.length} modules and shared workflow).\n`,
    );
