// #region Imports

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #endregion

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
    'python3',
    [
        join(root, '.agents/skills/architecture/scripts/check_inheritance.py'),
        '--root',
        root,
        '--derived',
        'synapse-architect',
    ],
    { cwd: root, stdio: 'inherit' },
);

if (result.error)
    process.stderr.write(`Cannot validate the Architecture base: ${result.error.message}\n`);

process.exitCode = result.status ?? 1;
