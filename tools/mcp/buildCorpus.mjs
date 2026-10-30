// #region Imports

import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// #endregion

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const maximumCorpusBytes = 8 * 1024 * 1024;
const requiredPatterns = [
    'query-pattern',
    'repository-pattern',
    'mapping-pattern',
    'module-pattern',
    'error-handling-pattern',
    'config-pattern',
    'guard-pattern',
    'dto-pattern',
    'testing-pattern',
];

/**
 * Builds a self-contained deterministic MCP payload from canonical authored and generated documentation.
 *
 * @param options - Explicit repository/output locations and optional check-only mode.
 * @returns Package, guide and pattern counts after validating the complete payload.
 * @throws An Error for stale API metadata, unsafe paths, missing documents or exceeded budgets.
 * @remarks No provider code is imported or executed. The TypeDoc index is the authority for API inventory; its nested Markdown pages are bundled recursively. Importing this module performs no filesystem access or generation.
 *
 * @internal
 */
export async function buildCorpus({ root = repository, output, check = false } = {}) {
    const source = await realpath(resolve(root));
    const budget = { root: source, bytes: 0 };
    const read = (file, maximum, trim) => readText(file, maximum, trim, budget);
    const docs = join(source, '.docs');
    const index = JSON.parse(await read(join(docs, 'api', 'api-index.json'), 4 * 1024 * 1024));

    if (
        index.schemaVersion !== 1 ||
        !Array.isArray(index.packages) ||
        index.packages.length !== 9 ||
        !Array.isArray(index.entries) ||
        index.entries.length > 100_000
    )
        throw new Error(
            'The current version-one TypeDoc API index for nine libraries is required.',
        );

    const manifests = new Map();

    for (const entry of await entries(join(source, 'libs'))) {
        if (!entry.isDirectory() || !/^synapse-[a-z0-9-]+$/u.test(entry.name)) continue;

        const metadata = JSON.parse(await read(join(source, 'libs', entry.name, 'package.json')));

        if (!metadata.private) manifests.set(metadata.name, { ...metadata, slug: entry.name });
    }

    if (
        [...manifests.keys()].sort().join('\0') !==
        index.packages
            .map((pkg) => pkg.name)
            .sort()
            .join('\0')
    )
        throw new Error('The TypeDoc package index does not match the current public libraries.');

    const packages = [];

    for (const pkg of [...index.packages].sort((left, right) => compare(left.name, right.name))) {
        const metadata = manifests.get(pkg.name);

        if (
            !metadata ||
            metadata.name !== `@pixel-brewery/${metadata.slug}` ||
            typeof metadata.version !== 'string' ||
            !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/u.test(metadata.version) ||
            (metadata.description !== undefined &&
                (typeof metadata.description !== 'string' ||
                    Buffer.byteLength(metadata.description) > 4096)) ||
            pkg.version !== metadata.version ||
            !Array.isArray(pkg.entryPoints) ||
            pkg.entryPoints.length === 0 ||
            pkg.entryPoints.length > 64
        )
            throw new Error('The TypeDoc package identity or version is stale.');

        const pages = new Map();

        for (const entry of pkg.entryPoints) {
            const apiPath = relativeDocument(entry.api);

            if (!apiPath.startsWith(`packages/${metadata.slug}/`) || !apiPath.endsWith('.md'))
                throw new Error('The TypeDoc entry point references another package.');

            const directory = dirname(inside(docs, apiPath));

            for (const file of await markdown(directory)) {
                const name = relative(docs, file).split(sep).join('/');

                pages.set(name, await read(file));
            }

            if (!pages.has(apiPath))
                throw new Error('The generated API entry-point Markdown is missing.');
        }

        for (const symbol of index.entries.filter((entry) => entry.packageName === metadata.name)) {
            const link = relativeDocument(symbol.link.split('#')[0]);

            if (!pages.has(link))
                throw new Error('The TypeDoc symbol index references missing nested API Markdown.');
        }

        const overview = await read(join(source, 'libs', metadata.slug, 'README.md'));

        packages.push({
            name: metadata.slug,
            packageName: metadata.name,
            version: metadata.version,
            title: title(overview, metadata.slug),
            description: metadata.description ?? description(overview),
            overview,
            apiContent: [...pages.entries()]
                .sort(([left], [right]) => compare(left, right))
                .map(([name, content]) => `<!-- Source: .docs/${name} -->\n\n${content}`)
                .join('\n\n---\n\n'),
            tags: Array.isArray(metadata.keywords)
                ? [
                      ...new Set(metadata.keywords.filter((value) => typeof value === 'string')),
                  ].sort()
                : [],
        });
    }

    const guides = [
        ...(await documents(join(docs, 'guides'), read)),
        ...(await documents(join(docs, 'architecture'), read, 'architecture-', 1000)),
    ];
    const patterns = await documents(join(docs, 'patterns'), read);

    if (
        guides.length === 0 ||
        guides.length > 256 ||
        new Set(guides.map((entry) => entry.name)).size !== guides.length
    )
        throw new Error('The authored guides exceed their identity or collection budgets.');

    if (
        patterns
            .map((entry) => entry.name)
            .sort()
            .join('\0') !== [...requiredPatterns].sort().join('\0')
    )
        throw new Error('All nine Synapse pattern documents are required.');

    const corpus = { schemaVersion: 1, packages, guides, patterns };
    const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
    const sourcePaths = new Set(
        [source, resolve(root)].flatMap((value) => [value, value.split(sep).join('/')]),
    );

    if (
        Buffer.byteLength(serialized) > maximumCorpusBytes ||
        [...sourcePaths].some(
            (value) =>
                serialized.includes(value) ||
                serialized.includes(JSON.stringify(value).slice(1, -1)),
        )
    )
        throw new Error('The documentation corpus exceeds its budget or exposes a checkout path.');

    const destination = resolve(
        output ?? join(source, 'tools', 'mcp', 'dist', 'data', 'corpus.json'),
    );

    if (check) {
        if ((await readText(destination, maximumCorpusBytes, false)) !== serialized)
            throw new Error('The packaged documentation corpus is stale. Rebuild the MCP package.');
    } else {
        await mkdir(dirname(destination), { recursive: true });

        const temporary = `${destination}.${randomUUID()}.tmp`;

        try {
            const handle = await open(temporary, 'wx', 0o644);

            try {
                await handle.writeFile(serialized, 'utf8');
            } finally {
                await handle.close();
            }

            await rename(temporary, destination);
        } finally {
            await rm(temporary, { force: true });
        }
    }

    return { packages: packages.length, guides: guides.length, patterns: patterns.length };
}

async function documents(directory, read, prefix = '', firstOrder = 0) {
    const result = [];

    for (const file of await markdown(directory)) {
        const local = relative(directory, file).split(sep).join('/');
        const name = `${prefix}${local.slice(0, -3).replaceAll('/', '-')}`;
        const content = await read(file);

        if (!/^[a-z][a-z0-9-]{0,127}$/u.test(name))
            throw new Error('Documentation names must be bounded lowercase identifiers.');

        result.push({
            name,
            title: title(content, name),
            description: description(content),
            content,
            order: firstOrder + result.length,
        });
    }

    if (new Set(result.map((entry) => entry.name)).size !== result.length)
        throw new Error('Documentation file names produce duplicate knowledge identities.');

    return result;
}

async function markdown(directory, depth = 0, budget = { entries: 0 }) {
    if (depth > 12) throw new Error('Documentation nesting exceeds its traversal budget.');

    const files = [];

    for (const entry of await entries(directory)) {
        if (++budget.entries > 4096)
            throw new Error('Documentation entries exceed their traversal budget.');

        if (entry.isSymbolicLink()) throw new Error('Documentation trees cannot contain symlinks.');

        const file = join(directory, entry.name);

        if (entry.isDirectory()) files.push(...(await markdown(file, depth + 1, budget)));
        else if (entry.isFile() && entry.name.endsWith('.md')) files.push(file);
    }

    return files.sort(compare);
}

async function entries(directory) {
    const metadata = await lstat(directory);

    if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error('Documentation requires a real source directory.');

    const result = await readdir(directory, { withFileTypes: true });

    if (result.length > 4096)
        throw new Error('A documentation directory exceeds its entry budget.');

    return result.sort((left, right) => compare(left.name, right.name));
}

async function readText(file, maximum = 256 * 1024, trim = true, budget) {
    if (budget) inside(budget.root, await realpath(file));

    const metadata = await lstat(file);

    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maximum)
        throw new Error('Documentation sources must be bounded regular files.');

    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));

    try {
        const opened = await handle.stat();

        if (!opened.isFile() || opened.dev !== metadata.dev || opened.ino !== metadata.ino)
            throw new Error('A documentation source changed while being opened.');

        const bytes = new Uint8Array(maximum + 1);
        let length = 0;

        while (length < bytes.length) {
            const result = await handle.read(bytes, length, bytes.length - length, null);

            if (!result.bytesRead) break;

            length += result.bytesRead;
        }

        if (length > maximum) throw new Error('A documentation source exceeds its byte budget.');

        if (budget) {
            budget.bytes += length;

            if (budget.bytes > 16 * 1024 * 1024)
                throw new Error('Documentation sources exceed their combined read budget.');
        }

        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));

        if (content.includes('\0')) throw new Error('Documentation text cannot contain NUL bytes.');

        return trim ? content.trim() : content;
    } finally {
        await handle.close();
    }
}

function relativeDocument(value) {
    if (
        typeof value !== 'string' ||
        !value ||
        isAbsolute(value) ||
        value.includes('\\') ||
        value.includes('\0') ||
        value.split('/').some((part) => !part || part === '.' || part === '..')
    )
        throw new Error('Generated documentation references must remain repository-relative.');

    return value;
}

function inside(root, value) {
    const destination = resolve(root, value);
    const local = relative(root, destination);

    if (local.startsWith(`..${sep}`) || local === '..' || isAbsolute(local))
        throw new Error('A documentation reference escapes its owner.');

    return destination;
}

function title(content, fallback) {
    const value = /^#\s+(.+)$/mu.exec(content)?.[1]?.trim() ?? fallback;

    if (Buffer.byteLength(value) > 1024)
        throw new Error('A documentation title exceeds its budget.');

    return value;
}

function description(content) {
    return (
        content
            .split(/\r?\n\s*\r?\n/u)
            .find((part) => part.trim() && !/^(?:#|```|~~~|[|>])/u.test(part.trim()))
            ?.replaceAll('\n', ' ')
            .slice(0, 1000) ?? ''
    );
}

function compare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

if (
    process.argv[1] &&
    isAbsolute(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    try {
        if (process.argv.slice(2).some((argument) => argument !== '--check'))
            throw new Error('Only --check is supported by the corpus builder.');

        const result = await buildCorpus({ check: process.argv.includes('--check') });

        process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch {
        process.stderr.write('MCP documentation corpus generation failed.\n');
        process.exitCode = 1;
    }
}
