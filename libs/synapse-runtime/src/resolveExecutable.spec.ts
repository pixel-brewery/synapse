// #region Imports

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveExecutable } from './resolveExecutable.js';

// #endregion

const directories: string[] = [];

afterEach(async () => {
    await Promise.all(
        directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe('resolveExecutable', () => {
    it('resolves a native executable from an explicit absolute path', () => {
        // Arrange / Act
        const resolved = resolveExecutable(process.execPath, {}, process.cwd());

        // Assert
        expect(resolved).toBe(process.execPath);
    });

    it.skipIf(process.platform === 'win32')(
        'uses only the selected PATH and rejects files without execute permission',
        async () => {
            // Arrange
            const directory = await mkdtemp(join(tmpdir(), 'synapse executable '));

            directories.push(directory);

            const executable = join(directory, 'synthetic-cli');

            await writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o600 });
            expect(() =>
                resolveExecutable('synthetic-cli', { PATH: directory }, directory),
            ).toThrow('unavailable');
            await chmod(executable, 0o700);

            // Act
            const resolved = resolveExecutable('synthetic-cli', { PATH: directory }, directory);

            // Assert
            expect(resolved).toBe(executable);
            expect(() => resolveExecutable('synthetic-cli', { PATH: '' }, directory)).toThrow(
                'unavailable',
            );
        },
    );

    it.runIf(process.platform === 'win32')(
        'honors case-insensitive PATH and per-profile PATHEXT rather than the host value',
        async () => {
            // Arrange
            const directory = await mkdtemp(join(tmpdir(), 'synapse executable '));

            directories.push(directory);

            const executable = join(directory, 'synthetic-cli.CMD');

            await writeFile(executable, '@echo off\r\nexit /b 0\r\n');

            // Act
            const resolved = resolveExecutable(
                'synthetic-cli',
                { Path: directory, PathExt: '.CMD' },
                directory,
            );

            // Assert
            expect(resolved).toBe(executable);
            expect(() =>
                resolveExecutable('synthetic-cli', { Path: directory, PathExt: '.EXE' }, directory),
            ).toThrow('unavailable');
        },
    );
});
