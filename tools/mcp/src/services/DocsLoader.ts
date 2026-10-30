// #region Imports

import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import type { IKnowledgeDocument } from '../interfaces/IKnowledgeDocument.js';
import type { IPackageKnowledge } from '../interfaces/IPackageKnowledge.js';

// #endregion

const maximumBytes = 8 * 1024 * 1024;
const packageIdentities = [
    'synapse-auth',
    'synapse-core',
    'synapse-provider-acp',
    'synapse-provider-claude',
    'synapse-provider-codex',
    'synapse-provider-opencode',
    'synapse-routing',
    'synapse-runtime',
    'synapse-testing',
];
const patternIdentities = [
    'config-pattern',
    'dto-pattern',
    'error-handling-pattern',
    'guard-pattern',
    'mapping-pattern',
    'module-pattern',
    'query-pattern',
    'repository-pattern',
    'testing-pattern',
];

/**
 * Loads one self-contained, bounded documentation payload explicitly from its packaged location.
 *
 * @remarks Construction and import are inert. There is no working-directory discovery, provider loading or checkout fallback. The first load, including failure, is cached so all tools observe one immutable corpus revision.
 *
 * @internal
 */
export class DocsLoader {
    // #region Fields

    private readonly _corpusPath: string | URL;
    private _loading: Promise<IKnowledgeCorpus> | undefined;

    // #endregion

    // #region Ctor

    /**
     * Captures an explicit file location without accessing it.
     *
     * @param corpusPath - Absolute file path or file URL; defaults to dist/data/corpus.json beside the compiled server.
     * @throws An Error for a relative path, non-file URL or URL containing search/fragment components.
     *
     * @internal
     */
    public constructor(corpusPath: string | URL = new URL('../data/corpus.json', import.meta.url)) {
        if (
            (typeof corpusPath === 'string' && !isAbsolute(corpusPath)) ||
            (corpusPath instanceof URL &&
                (corpusPath.protocol !== 'file:' || corpusPath.search || corpusPath.hash))
        )
            throw new Error('The knowledge corpus requires an explicit absolute file location.');

        this._corpusPath = corpusPath instanceof URL ? new URL(corpusPath.href) : corpusPath;
    }

    // #endregion

    // #region Methods

    /**
     * Reads and validates the packaged corpus once, within an eight-MiB input budget.
     *
     * @returns The same deeply immutable version-one corpus for every caller.
     * @throws An Error for unavailable, oversized, malformed or unsupported data; messages omit local filesystem paths.
     *
     * @internal
     */
    public load(): Promise<IKnowledgeCorpus> {
        this._loading ??= this.read();

        return this._loading;
    }

    private async read(): Promise<IKnowledgeCorpus> {
        try {
            const metadata = await lstat(this._corpusPath);

            if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maximumBytes)
                throw new Error('The knowledge corpus must be a bounded regular file.');

            const handle = await open(
                this._corpusPath,
                constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
            );

            try {
                const opened = await handle.stat();

                if (
                    !opened.isFile() ||
                    opened.dev !== metadata.dev ||
                    opened.ino !== metadata.ino ||
                    opened.size > maximumBytes
                )
                    throw new Error('The knowledge corpus changed while being opened.');

                const bytes = new Uint8Array(maximumBytes + 1);
                let length = 0;

                while (length < bytes.length) {
                    const result = await handle.read(bytes, length, bytes.length - length, null);

                    if (result.bytesRead === 0) break;

                    length += result.bytesRead;
                }

                if (length > maximumBytes)
                    throw new Error('The knowledge corpus exceeds its input budget.');

                const value: unknown = JSON.parse(
                    new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)),
                );

                return corpus(value);
            } finally {
                await handle.close();
            }
        } catch (cause) {
            throw new Error('The packaged knowledge corpus could not be loaded or validated.', {
                cause,
            });
        }
    }

    // #endregion
}

function corpus(value: unknown): IKnowledgeCorpus {
    const row = record(value, ['schemaVersion', 'packages', 'guides', 'patterns']);

    if (row['schemaVersion'] !== 1) throw new Error('Unsupported knowledge corpus schema version.');

    const packages = rows(row['packages'], 64).map(packageKnowledge);
    const guides = rows(row['guides'], 256).map(document);
    const patterns = rows(row['patterns'], 64).map(document);

    unique(packages.map((entry) => entry.name));
    unique(packages.map((entry) => entry.packageName));
    unique(guides.map((entry) => entry.name));
    unique(patterns.map((entry) => entry.name));

    if (
        packages
            .map((entry) => entry.name)
            .sort()
            .join('\0') !== packageIdentities.join('\0') ||
        patterns
            .map((entry) => entry.name)
            .sort()
            .join('\0') !== patternIdentities.join('\0')
    )
        throw new Error(
            'The version-one knowledge corpus requires all nine libraries and patterns.',
        );

    return Object.freeze({
        schemaVersion: 1,
        packages: Object.freeze(packages),
        guides: Object.freeze(guides),
        patterns: Object.freeze(patterns),
    });
}

function packageKnowledge(value: unknown): IPackageKnowledge {
    const row = record(value, [
        'name',
        'packageName',
        'version',
        'title',
        'description',
        'overview',
        'apiContent',
        'tags',
    ]);
    const name = identifier(row['name']);
    const packageName = text(row['packageName'], 256);
    const version = text(row['version'], 128);

    if (
        !name.startsWith('synapse-') ||
        packageName !== `@pixel-brewery/${name}` ||
        !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u.test(version)
    )
        throw new Error('Invalid knowledge package identity.');

    return Object.freeze({
        name,
        packageName,
        version,
        title: text(row['title'], 1024),
        description: text(row['description'], 4096),
        overview: text(row['overview'], 512 * 1024),
        apiContent: text(row['apiContent'], 4 * 1024 * 1024),
        tags: Object.freeze(rows(row['tags'], 64, false).map((tag) => text(tag, 128))),
    });
}

function document(value: unknown): IKnowledgeDocument {
    const row = record(value, ['name', 'title', 'description', 'content', 'order']);
    const order = row['order'];

    if (typeof order !== 'number' || !Number.isSafeInteger(order) || order < 0 || order > 100_000)
        throw new Error('Invalid knowledge document order.');

    return Object.freeze({
        name: identifier(row['name']),
        title: text(row['title'], 1024),
        description: text(row['description'], 4096),
        content: text(row['content'], 1024 * 1024),
        order,
    });
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('Invalid knowledge corpus record.');

    if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0'))
        throw new Error('Unknown or missing knowledge corpus properties.');

    return Object.fromEntries(Object.entries(value));
}

function text(value: unknown, maximum: number): string {
    if (
        typeof value !== 'string' ||
        value.includes('\0') ||
        Buffer.byteLength(value, 'utf8') > maximum
    )
        throw new Error('Invalid or oversized knowledge corpus text.');

    return value;
}

function identifier(value: unknown): string {
    const name = text(value, 128);

    if (!/^[a-z][a-z0-9-]{0,127}$/u.test(name))
        throw new Error('Invalid knowledge document identity.');

    return name;
}

function rows(value: unknown, maximum: number, required = true): unknown[] {
    if (!Array.isArray(value) || (required && value.length === 0) || value.length > maximum)
        throw new Error('Invalid or oversized knowledge corpus collection.');

    return value;
}

function unique(values: readonly string[]): void {
    if (new Set(values).size !== values.length)
        throw new Error('Duplicate knowledge corpus identity.');
}
