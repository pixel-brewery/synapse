// #region Imports

import type { IAiInstance } from '@pixel-brewery/synapse-core';
import { AiError } from '@pixel-brewery/synapse-core';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

// #endregion

/**
 * Captures an allowlisted host environment and prepares one explicit isolated profile.
 *
 * @param instance - Selected application/account instance, including explicit optional secrets.
 * @param extras - Driver-owned environment values such as its native credential/config paths.
 * @returns Environment for this profile; HOME, USERPROFILE and temporary paths remain isolated.
 * @throws An AiError when profile locations are invalid or cannot be prepared.
 * @remarks No credentials are discovered or imported from the user's global CLI configuration.
 *
 * @public
 */
export async function createProfileEnvironment(
    instance: IAiInstance,
    extras: Readonly<Record<string, string>> = {},
): Promise<Readonly<Record<string, string>>> {
    const paths = instance.profile.paths;

    for (const path of Object.values(paths)) {
        if (typeof path !== 'string' || !isAbsolute(path))
            throw new AiError(
                'configuration',
                'Profile paths must be explicit absolute directories.',
            );
    }

    try {
        await Promise.all(
            [...new Set(Object.values(paths))].map((path) =>
                mkdir(path, { recursive: true, mode: 0o700 }),
            ),
        );
    } catch (cause) {
        throw new AiError('host', 'The isolated CLI profile could not be prepared.', { cause });
    }

    const environment: Record<string, string> = {};
    const allowed = new Set([
        'PATH',
        'PATHEXT',
        'SYSTEMROOT',
        'WINDIR',
        'COMSPEC',
        'LANG',
        'LC_ALL',
        'LC_CTYPE',
        'TZ',
        'SHELL',
        'TERM',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'ALL_PROXY',
        'NO_PROXY',
        'SSL_CERT_FILE',
        'SSL_CERT_DIR',
        'NODE_EXTRA_CA_CERTS',
    ]);

    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && allowed.has(key.toUpperCase()))
            environment[key.toUpperCase()] = value;
    }

    const hostPath = environment['PATH'] ?? '';

    if (process.platform !== 'win32') {
        environment['PATH'] = [
            ...new Set(
                [
                    ...hostPath.split(delimiter),
                    '/opt/homebrew/bin',
                    '/usr/local/bin',
                    '/usr/bin',
                    '/bin',
                    join(homedir(), '.local/bin'),
                    join(homedir(), '.bun/bin'),
                ].filter(Boolean),
            ),
        ].join(delimiter);
    }

    const isolated: Record<string, string> = {
        ...environment,
        ...instance.environment,
        ...extras,
        HOME: paths.home,
        USERPROFILE: paths.home,
        TMPDIR: paths.temporary,
        TMP: paths.temporary,
        TEMP: paths.temporary,
    };

    return process.platform === 'win32'
        ? Object.fromEntries(
              Object.entries(isolated).map(([key, value]) => [key.toUpperCase(), value]),
          )
        : isolated;
}
