// #region Imports

import { execFileSync, spawnSync } from 'node:child_process';
import {
    createWriteStream,
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { findPrivateReferences } from './findPrivateReferences.mjs';

// #endregion

const privateFixture = String.fromCodePoint(102, 108, 97, 109, 111, 120);
const checker = fileURLToPath(new URL('./findPrivateReferences.mjs', import.meta.url));
const roots = [];
const chunkBytes = 64 * 1024;

function repository() {
    const root = mkdtempSync(join(tmpdir(), 'public-content-'));

    roots.push(root);
    execFileSync('git', ['init', '--quiet', root]);

    return root;
}

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Public repository content', () => {
    it('checks tracked and new source while respecting ignored local data', async () => {
        // Arrange
        const root = repository();

        writeFileSync(resolve(root, '.gitignore'), 'local-data/\n');
        writeFileSync(resolve(root, 'tracked.md'), 'Public example.');
        execFileSync('git', ['add', '.'], { cwd: root });
        mkdirSync(resolve(root, 'local-data'));
        writeFileSync(resolve(root, 'local-data/private.txt'), privateFixture);
        writeFileSync(resolve(root, 'new.md'), 'Another public example.');

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual([]);
    });

    it('rejects mixed-case private references in tracked and new content', async () => {
        // Arrange
        const root = repository();

        writeFileSync(resolve(root, 'tracked.md'), 'Public example.');
        execFileSync('git', ['add', '.'], { cwd: root });
        writeFileSync(resolve(root, 'tracked.md'), privateFixture.toUpperCase());
        writeFileSync(resolve(root, 'new.md'), `${privateFixture}365`);

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations.sort()).toEqual(['new.md', 'tracked.md']);
    });

    it('rejects private identifiers in paths even with neutral content', async () => {
        // Arrange
        const root = repository();
        const filename = `${privateFixture.toUpperCase()}-reference.md`;

        writeFileSync(resolve(root, filename), 'Neutral content.');

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual([filename]);
    });

    it('checks dangling symlink targets without following them', async ({ skip }) => {
        // Arrange
        const root = repository();

        try {
            symlinkSync(`${privateFixture.toUpperCase()}-outside`, resolve(root, 'reference'));
        } catch (error) {
            if (process.platform === 'win32' && error.code === 'EPERM') {
                skip();

                return;
            }

            throw error;
        }

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual(['reference']);
    });

    it('rejects private identifiers inside decoded vendor payloads', async () => {
        // Arrange
        const root = repository();

        writeFileSync(
            resolve(root, 'vendor.tgz'),
            gzipSync(`package/example.js\0${privateFixture}`),
        );

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual(['vendor.tgz']);
    });

    it('rejects private identifiers in UTF-16 content', async () => {
        // Arrange
        const root = repository();

        writeFileSync(
            resolve(root, 'fixture.txt'),
            Buffer.from(privateFixture.toUpperCase(), 'utf16le'),
        );

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual(['fixture.txt']);
    });

    it('detects UTF-8 and unaligned UTF-16 identifiers across raw and expanded chunk boundaries', async () => {
        // Arrange
        const root = repository();

        for (const encoding of ['utf8', 'utf16le']) {
            const content = Buffer.concat([
                Buffer.alloc(chunkBytes - 3, 95),
                Buffer.from(privateFixture.toUpperCase(), encoding),
                Buffer.alloc(15, 95),
            ]);

            writeFileSync(resolve(root, `${encoding}.bin`), content);
            writeFileSync(resolve(root, `${encoding}.tgz`), gzipSync(content));
        }

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations.sort()).toEqual(['utf16le.bin', 'utf16le.tgz', 'utf8.bin', 'utf8.tgz']);
    });

    it('scans clean archives expanded beyond 128 MiB using bounded stream chunks', async () => {
        // Arrange
        const root = repository();
        const chunk = Buffer.alloc(chunkBytes, 95);

        async function* largeContents() {
            for (let index = 0; index < 2050; index++) yield chunk;
        }

        await pipeline(
            Readable.from(largeContents()),
            createGzip({ level: 1 }),
            createWriteStream(resolve(root, 'large.tgz')),
        );

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual([]);
    }, 30_000);

    it('fails closed when a compressed file cannot be fully decoded', async () => {
        // Arrange
        const root = repository();

        writeFileSync(resolve(root, 'broken.tgz'), Buffer.from([0x1f, 0x8b, 0x08]));

        // Act
        const inspection = findPrivateReferences(root);

        // Assert
        await expect(inspection).rejects.toMatchObject({ code: 'Z_BUF_ERROR' });
    });

    it('checks force-tracked ignored content', async () => {
        // Arrange
        const root = repository();

        writeFileSync(resolve(root, '.gitignore'), 'fixture.txt\n');
        writeFileSync(resolve(root, 'fixture.txt'), privateFixture);
        execFileSync('git', ['add', '--force', 'fixture.txt'], { cwd: root });

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual(['fixture.txt']);
    });

    it('tolerates deleted tracked files', async () => {
        // Arrange
        const root = repository();

        writeFileSync(resolve(root, 'fixture.txt'), privateFixture);
        execFileSync('git', ['add', '.'], { cwd: root });
        rmSync(resolve(root, 'fixture.txt'));

        // Act
        const violations = await findPrivateReferences(root);

        // Assert
        expect(violations).toEqual([]);
    });

    it('CLI exits unsuccessfully without echoing private content', () => {
        // Arrange
        const root = repository();

        writeFileSync(resolve(root, `${privateFixture.toUpperCase()}-fixture.md`), privateFixture);

        // Act
        const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });

        // Assert
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('[private]-fixture.md');
        expect(result.stderr.toLowerCase().includes(privateFixture)).toBe(false);
    });
});
