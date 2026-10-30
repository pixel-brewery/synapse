// #region Imports

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// #endregion

const execute = promisify(execFile);
const owned = [];

afterEach(async () => {
    await Promise.all(owned.splice(0).map((file) => rm(file, { recursive: true, force: true })));
});

async function probe(source, extension = '.mjs') {
    const directory = await mkdtemp(path.join(tmpdir(), 'synapse-import-probe-'));

    owned.push(directory);

    const file = path.join(directory, `entry${extension}`);

    await writeFile(file, source);

    return execute(
        process.execPath,
        [
            path.resolve('tools/packaging/importProbe.mjs'),
            JSON.stringify([pathToFileURL(file).href]),
        ],
        { timeout: 5000 },
    );
}

describe('inert-import probe', () => {
    it('allows pure ESM and ordinary CommonJS dependency loading', async () => {
        // Arrange / Act
        const esm = await probe('export const answer = 42;');
        const commonjs = await probe('module.exports = {answer: 42};', '.cjs');

        // Assert
        expect(JSON.parse(esm.stdout).effects).toEqual([]);
        expect(JSON.parse(commonjs.stdout).effects).toEqual([]);
    });
    it.each([
        ["import fs from 'node:fs'; fs.readdirSync('.');", 'fs.readdirSync'],
        ['setTimeout(() => {}, 1);', 'global.setTimeout'],
        [
            "import {spawn} from 'node:child_process'; spawn(process.execPath, ['-e','']);",
            'child_process.spawn',
        ],
        ["import http from 'node:http'; http.get('http://127.0.0.1:1');", 'http.get'],
    ])('rejects import-time external behavior %s', async (source, effect) => {
        // Arrange / Act
        const result = probe(source);

        // Assert
        await expect(result).rejects.toMatchObject({
            stderr: expect.stringContaining(`Import-time effect rejected: ${effect}`),
        });
    });
});
