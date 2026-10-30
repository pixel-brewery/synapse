// #region Imports

import { AiError } from '@pixel-brewery/synapse-core';
import { accessSync, constants, statSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';

// #endregion

/**
 * Resolves a CLI against its explicit environment instead of ambient Windows PATHEXT.
 *
 * @param command - Native executable, command shim or CLI name.
 * @param environment - Profile-owned PATH and optional PATHEXT, matched case-insensitively on Windows.
 * @param workingDirectory - Base for explicit relative paths and relative PATH entries.
 * @returns An existing absolute executable path.
 * @throws An AiError when resolution fails or search budgets are exceeded.
 *
 * @internal
 */
export function resolveExecutable(
    command: string,
    environment: Readonly<Record<string, string>>,
    workingDirectory: string,
): string {
    const windows = process.platform === 'win32';
    const value = (key: string): string | undefined =>
        windows
            ? Object.entries(environment).find(([name]) => name.toUpperCase() === key)?.[1]
            : environment[key];
    const direct =
        isAbsolute(command) || command.includes('/') || (windows && command.includes('\\'));
    const directories = direct
        ? ['']
        : (value('PATH') ?? '').split(windows ? ';' : ':').filter(Boolean);
    const extensions =
        !windows || extname(command)
            ? ['']
            : (value('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
                  .split(';')
                  .filter((extension) => /^\.[A-Za-z0-9]+$/u.test(extension));

    if (directories.length > 256 || extensions.length > 32)
        throw new AiError(
            'configuration',
            'The executable search exceeded its configured path budget.',
        );

    for (const directory of directories) {
        for (const extension of extensions) {
            const candidate = resolve(
                workingDirectory,
                direct ? command + extension : join(directory, command + extension),
            );

            try {
                if (!statSync(candidate).isFile()) continue;

                accessSync(candidate, windows ? constants.F_OK : constants.X_OK);

                return candidate;
            } catch {
                /* Continue only within the caller's explicit search paths. */
            }
        }
    }

    throw new AiError(
        'configuration',
        'The configured CLI executable is unavailable in this profile environment.',
    );
}
