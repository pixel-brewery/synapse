// #region Imports

import {
    mkdtemp,
    readdir,
    readFile,
    writeFile,
    mkdir,
    rm,
    cp,
    lstat,
    realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { Application, ReflectionKind, resetReflectionID, TSConfigReader } from 'typedoc';
import { MarkdownPageEvent, MarkdownRendererEvent, MemberRouter } from 'typedoc-plugin-markdown';

// #endregion

const documentedKinds = [
    'Class',
    'Interface',
    'TypeAlias',
    'Function',
    'Variable',
    'Enum',
    'EnumMember',
    'Property',
    'Method',
    'Accessor',
    'Constructor',
];

/**
 * Generates or checks portable documentation for every explicit public package export.
 *
 * @param options - Repository root and whether to update or compare generated artifacts.
 * @returns The number of documented packages, entry points and public exports.
 * @throws When an entry point, TypeScript contract, TSDoc link or generated artifact is invalid.
 * @remarks Authored documentation is preserved. No provider is imported or executed.
 *
 * @public
 */
export async function generate({ root, mode = 'write' }) {
    if (!['write', 'check'].includes(mode)) {
        throw new Error(`Unsupported API documentation mode: ${mode}`);
    }

    const repository = await realpath(path.resolve(root));
    const staging = await realpath(await mkdtemp(path.join(tmpdir(), 'synapse-api-docs-')));

    try {
        const packages = await discoverPackages(repository);

        if (packages.length === 0) {
            throw new Error('No public Synapse packages were found under libs/.');
        }

        const registry = await discoverPublicSymbols(repository, staging, packages);
        const index = {
            schemaVersion: 1,
            linkBase: '.docs/',
            packages: [],
            entries: [],
        };

        for (const pkg of packages) {
            const packageIndex = { name: pkg.name, version: pkg.version, entryPoints: [] };

            for (const entry of pkg.entries) {
                const generated = await generateEntry(repository, staging, pkg, entry, registry);

                packageIndex.entryPoints.push(generated.entryPoint);
                index.entries.push(...generated.entries);
            }

            index.packages.push(packageIndex);
        }

        index.entries.sort((left, right) => compare(left.id, right.id));
        await writeJson(path.join(staging, 'api', 'api-index.json'), index);
        await validateGeneratedLinks(staging);

        const expected = await readTree(staging);

        for (const [file, content] of expected) {
            for (const directory of [repository, staging]) {
                if (
                    content.toString('utf8').includes(directory) ||
                    content.toString('utf8').includes(directory.replaceAll(path.sep, '/'))
                ) {
                    throw new Error(
                        `Generated documentation exposes an absolute generation path: ${file}`,
                    );
                }
            }
        }

        const actual = await readGenerated(repository);
        const differences = compareTrees(expected, actual);

        if (mode === 'check' && differences.length > 0) {
            throw new Error(
                `Generated API documentation is stale. Run yarn docs.\n${differences.join('\n')}`,
            );
        }

        if (mode === 'write') {
            await replaceGenerated(repository, staging);
        }

        return {
            packages: index.packages.length,
            entryPoints: index.packages.reduce((sum, pkg) => sum + pkg.entryPoints.length, 0),
            exports: index.packages.reduce(
                (sum, pkg) =>
                    sum + pkg.entryPoints.reduce((count, entry) => count + entry.exports.length, 0),
                0,
            ),
        };
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

async function discoverPackages(root) {
    const packages = [];

    for (const directory of (await readdir(path.join(root, 'libs'), { withFileTypes: true })).sort(
        (left, right) => compare(left.name, right.name),
    )) {
        if (!directory.isDirectory() || !directory.name.startsWith('synapse-')) continue;

        const packageRoot = path.join(root, 'libs', directory.name);
        const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));

        if (manifest.private === true) continue;

        if (manifest.name !== `@pixel-brewery/${directory.name}`) {
            throw new Error(`Package name does not match its library owner: ${directory.name}`);
        }

        const tsconfig = path.join(packageRoot, 'tsconfig.lib.json');
        const configuration = readConfiguration(tsconfig);
        const exports = manifest.exports;

        if (
            !exports ||
            typeof exports !== 'object' ||
            !Object.keys(exports).some((key) => key === '.')
        ) {
            throw new Error(`${manifest.name} must declare an explicit root export.`);
        }

        const entries = [];

        for (const [subpath, conditions] of Object.entries(exports).sort(([a], [b]) =>
            compare(a, b),
        )) {
            if (subpath === './package.json') continue;

            if (subpath !== '.' && !/^\.\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(subpath)) {
                throw new Error(
                    `API documentation requires a literal public export: ${manifest.name}${subpath}`,
                );
            }

            const targets = collectTargets(conditions);
            const types = targets.find((target) => target.endsWith('.d.ts'));
            const runtime = targets.find((target) => target.endsWith('.js'));

            if (!types || !runtime || targets.some((target) => !target.startsWith('./'))) {
                throw new Error(
                    `Public export lacks ESM/declaration targets: ${manifest.name}${subpath}`,
                );
            }

            const source = sourceForTarget(packageRoot, configuration.options, types, '.d.ts');
            const runtimeSource = sourceForTarget(
                packageRoot,
                configuration.options,
                runtime,
                '.js',
            );

            if (source !== runtimeSource || !(await exists(source))) {
                throw new Error(
                    `Public export has no matching source entry point: ${manifest.name}${subpath}`,
                );
            }

            entries.push({ subpath, source });
        }

        packages.push({
            root: packageRoot,
            name: manifest.name,
            version: manifest.version,
            slug: directory.name,
            tsconfig,
            configuration,
            entries,
        });
    }

    return packages;
}

function readConfiguration(file) {
    const read = ts.readConfigFile(file, ts.sys.readFile);

    if (read.error) throw new Error(formatDiagnostics([read.error]));

    const result = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file));

    if (result.errors.length > 0) throw new Error(formatDiagnostics(result.errors));

    if (!result.options.rootDir || !result.options.outDir) {
        throw new Error(`${file} must define rootDir and outDir for public export discovery.`);
    }

    return result;
}

function collectTargets(value) {
    if (typeof value === 'string') return [value];

    if (value && typeof value === 'object') return Object.values(value).flatMap(collectTargets);

    throw new Error('Public export conditions must contain explicit target paths.');
}

function sourceForTarget(packageRoot, options, target, extension) {
    const output = path.resolve(packageRoot, target);
    const relative = path.relative(options.outDir, output);

    if (relative.startsWith('..') || path.isAbsolute(relative) || !relative.endsWith(extension)) {
        throw new Error(`Public export is outside the configured output directory: ${target}`);
    }

    return path.join(options.rootDir, `${relative.slice(0, -extension.length)}.ts`);
}

function entryPaths(pkg, entry) {
    const suffix = entry.subpath === '.' ? [] : ['subpaths', ...entry.subpath.slice(2).split('/')];
    const apiRelative = path.join('packages', pkg.slug, 'api', ...suffix);
    const reflectionRelative = path.join('api', pkg.slug, ...suffix, 'reflection.json');
    const importPath = `${pkg.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`;

    return { apiRelative, reflectionRelative, importPath };
}

async function convertEntry(root, staging, pkg, entry, registry) {
    const { apiRelative, importPath } = entryPaths(pkg, entry);
    const expectedExports = exportedNames(pkg, entry);

    resetReflectionID();

    const app = await Application.bootstrapWithPlugins(
        {
            entryPoints: [entry.source.replaceAll(path.sep, '/')],
            entryPointStrategy: 'resolve',
            tsconfig: pkg.tsconfig,
            name: importPath,
            basePath: root,
            outputs: [{ name: 'markdown', path: path.join(staging, apiRelative) }],
            plugin: ['typedoc-plugin-markdown'],
            router: 'member',
            entryFileName: 'index',
            readme: 'none',
            projectDocuments: [],
            hideGenerator: true,
            hidePageHeader: true,
            hideBreadcrumbs: true,
            useCodeBlocks: false,
            disableSources: true,
            disableGit: true,
            includeVersion: false,
            excludePrivate: true,
            excludeProtected: false,
            excludeInternal: true,
            excludeExternals: true,
            excludeNotDocumented: false,
            skipErrorChecking: false,
            requiredToBeDocumented: documentedKinds,
            validation: {
                notDocumented: true,
                notExported: true,
                invalidLink: true,
                invalidPath: true,
                rewrittenLink: true,
                unusedMergeModuleWith: true,
            },
            treatWarningsAsErrors: true,
            treatValidationWarningsAsErrors: true,
            sort: ['alphabetical'],
            logLevel: 'Warn',
        },
        [new TSConfigReader()],
    );

    assertClean(app, importPath, 'configuration');

    const unresolved = new Set();

    if (registry) {
        app.converter.addUnknownSymbolResolver((reference, _owner, _part, symbolId) => {
            const target = symbolId
                ? registry.symbols.get(symbolKey(registry.packages, symbolId))
                : registry.imports.get(importReferenceKey(reference));

            if (target) return linkToken(target);

            if (symbolId && registry.packages.has(symbolId.packageName)) {
                unresolved.add(
                    `${symbolId.packageName}/${symbolId.packagePath}#${symbolId.qualifiedName}`,
                );
            }

            return undefined;
        });
    }

    const project = await app.convert();

    if (!project) throw new Error(`TypeDoc conversion failed: ${importPath}`);

    assertClean(app, importPath, 'conversion');

    if (unresolved.size > 0) {
        throw new Error(
            `Public API references undocumented family symbols in ${importPath}: ${[...unresolved].sort(compare).join(', ')}`,
        );
    }

    if (registry) {
        app.validate(project);
        assertClean(app, importPath, 'validation');
    }

    const actualExports = (project.children ?? []).map((child) => child.name).sort(compare);

    if (JSON.stringify(expectedExports) !== JSON.stringify(actualExports)) {
        throw new Error(
            `API reflection coverage differs from public exports for ${importPath}: ` +
                `expected [${expectedExports.join(', ')}], documented [${actualExports.join(', ')}].`,
        );
    }

    return { app, project, expectedExports };
}

async function discoverPublicSymbols(root, staging, packages) {
    const registry = {
        packages: new Map(packages.map((pkg) => [pkg.name, pkg])),
        symbols: new Map(),
        imports: new Map(),
        targets: new Set(),
    };

    for (const pkg of packages) {
        for (const entry of pkg.entries) {
            const { app, project } = await convertEntry(root, staging, pkg, entry);
            const router = new MemberRouter(app);

            router.buildPages(project);

            const { apiRelative, importPath } = entryPaths(pkg, entry);
            const serialized = app.serializer.projectToObject(
                project,
                root.replaceAll(path.sep, '/'),
            );

            for (const child of Object.values(project.reflections)) {
                if (
                    !child.kindOf(ReflectionKind.SomeExport | ReflectionKind.ClassMember) ||
                    !router.hasUrl(child)
                )
                    continue;

                const target = path.posix.join(
                    apiRelative.replaceAll(path.sep, '/'),
                    router.getFullUrl(child),
                );

                registry.targets.add(target);
                registry.imports.set(`${importPath}#${qualifiedName(child, project)}`, target);

                const symbol = serialized.symbolIdMap?.[child.id];

                if (symbol?.packageName === pkg.name) {
                    const key = symbolKey(registry.packages, symbol);

                    // Entries are root-first. Re-exports of the same symbol share its canonical owner;
                    // different source files with identical names retain distinct identities.
                    if (!registry.symbols.has(key)) registry.symbols.set(key, target);
                }
            }
        }
    }

    return registry;
}

function symbolKey(packages, symbol) {
    const pkg = packages.get(symbol.packageName);
    let source = symbol.packagePath.replaceAll('\\', '/');

    if (pkg) {
        const resolved = path.resolve(pkg.root, source);
        const outputRelative = path.relative(pkg.configuration.options.outDir, resolved);
        const inOutput = !outputRelative.startsWith('..') && !path.isAbsolute(outputRelative);
        const normalized = inOutput
            ? path.join(pkg.configuration.options.rootDir, outputRelative)
            : resolved;

        source = path.relative(pkg.root, normalized).replaceAll(path.sep, '/');
    }

    return `${symbol.packageName}/${source.replace(/\.d\.(?:m|c)?ts$/, '.ts')}#${symbol.qualifiedName}`;
}

function importReferenceKey(reference) {
    const name = reference.symbolReference?.path?.map((part) => part.path).join('.');

    return reference.moduleSource && name ? `${reference.moduleSource}#${name}` : undefined;
}

function linkToken(target) {
    return `synapse-api:${encodeURIComponent(target).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

function resolveToken(token, registry) {
    const target = decodeURIComponent(token.slice('synapse-api:'.length));

    if (!registry.targets.has(target)) throw new Error(`Unknown generated API link: ${target}`);

    return target;
}

async function materializeLinks(directory, apiRelative, registry) {
    for (const [file, bytes] of await readTree(directory)) {
        if (!file.endsWith('.md')) continue;

        const document = path.posix.join(apiRelative.replaceAll(path.sep, '/'), file);
        const content = bytes
            .toString('utf8')
            .replace(/\]\((synapse-api:[^\s)]+)\)/g, (_match, token) => {
                const [target, fragment] = resolveToken(token, registry).split('#');
                const relative = path.posix.relative(path.posix.dirname(document), target);

                return `](${relative}${fragment ? `#${fragment}` : ''})`;
            });

        if (content.includes('](synapse-api:'))
            throw new Error(`Unresolved generated API link in ${document}`);

        await writeFile(path.join(directory, file), content);
    }
}

function materializeJsonLinks(value, registry) {
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
        if (
            (key === 'externalUrl' || key === 'target') &&
            typeof child === 'string' &&
            child.startsWith('synapse-api:')
        ) {
            value[key] = resolveToken(child, registry);
        } else {
            materializeJsonLinks(child, registry);
        }
    }
}

async function validateGeneratedLinks(staging) {
    const files = await readTree(staging);

    for (const [file, bytes] of files) {
        if (!file.endsWith('.md')) continue;

        const prose = bytes.toString('utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');

        for (const [, href] of prose.matchAll(/\]\(([^\s)]+)\)/g)) {
            if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;

            const pathname = decodeURIComponent(href.split('#')[0]);

            if (!pathname) continue;

            const target = path.posix.normalize(
                path.posix.join(path.posix.dirname(file), pathname),
            );

            if (!files.has(target))
                throw new Error(`Generated Markdown link has no target: ${file} -> ${href}`);
        }
    }
}

async function generateEntry(root, staging, pkg, entry, registry) {
    const { apiRelative, reflectionRelative, importPath } = entryPaths(pkg, entry);
    const apiDirectory = path.join(staging, apiRelative);
    const { app, project, expectedExports } = await convertEntry(
        root,
        staging,
        pkg,
        entry,
        registry,
    );

    appendNestedDocumentation(app, project);

    let renderedRouter;

    app.renderer.on(MarkdownRendererEvent.END, () => {
        renderedRouter = app.renderer.router;
    });
    await app.generateOutputs(project);
    assertClean(app, importPath, 'rendering');

    if (!(await exists(path.join(apiDirectory, 'index.md')))) {
        throw new Error(`TypeDoc did not render the public entry point index: ${importPath}`);
    }

    await materializeLinks(apiDirectory, apiRelative, registry);

    const reflection = app.serializer.projectToObject(project, root.replaceAll(path.sep, '/'));

    materializeJsonLinks(reflection, registry);
    await writeJson(path.join(staging, reflectionRelative), reflection);

    const entries = [];

    for (const child of Object.values(project.reflections)) {
        if (!child.kindOf(ReflectionKind.SomeExport | ReflectionKind.ClassMember)) continue;

        if (child.kindOf(ReflectionKind.Project | ReflectionKind.Constructor)) continue;

        if (!renderedRouter?.hasUrl(child) && hasAnonymousTypeAncestor(child)) continue;

        const url = renderedRouter?.hasUrl(child) ? renderedRouter.getFullUrl(child) : undefined;

        if (!url) throw new Error(`Public API has no rendered URL: ${importPath}#${child.name}`);

        const name = qualifiedName(child, project);

        entries.push({
            id: `${importPath}#${name}`,
            packageName: pkg.name,
            importPath,
            name,
            kind: ReflectionKind.singularString(child.kind),
            summary: summary(child),
            link: path.posix.join(apiRelative.replaceAll(path.sep, '/'), url),
            reflectionId: child.id,
        });
    }

    return {
        entryPoint: {
            importPath,
            api: `${apiRelative.replaceAll(path.sep, '/')}/index.md`,
            reflection: reflectionRelative.replaceAll(path.sep, '/'),
            exports: expectedExports,
        },
        entries,
    };
}

function appendNestedDocumentation(app, project) {
    app.renderer.on(MarkdownPageEvent.END, (page) => {
        const router = app.renderer.router;
        const nested = Object.values(project.reflections).filter((reflection) => {
            if (
                !reflection.kindOf(ReflectionKind.Property | ReflectionKind.Method) ||
                !reflection.comment ||
                router.hasUrl(reflection)
            )
                return false;

            if (!hasAnonymousTypeAncestor(reflection)) return false;

            let owner = reflection.parent;

            while (owner && !router.hasUrl(owner)) owner = owner.parent;

            return owner && router.getFullUrl(owner).split('#')[0] === page.url;
        });

        if (nested.length === 0) return;

        const context = app.renderer.theme.getRenderContext(page);
        const sections = nested.map((reflection) => {
            const documentation = context.partials.comment(reflection.comment, {
                headingLevel: 4,
                showReturns: true,
            });

            return `### \`${nestedName(reflection, project).replaceAll('`', '\\`')}\`\n\n${documentation.trim()}`;
        });

        page.contents = `${page.contents.trimEnd()}\n\n## Nested type members\n\n${sections.join('\n\n')}\n`;
    });
}

function nestedName(reflection, project) {
    const parts = [];

    for (let current = reflection; current && current !== project; current = current.parent) {
        if (current.kindOf(ReflectionKind.TypeLiteral)) {
            const discriminator = current.children?.find((child) => child.type?.type === 'literal');

            if (discriminator)
                parts.unshift(
                    `[${discriminator.name}=${JSON.stringify(discriminator.type.value)}]`,
                );
        } else if (!current.kindOf(ReflectionKind.SomeSignature)) {
            parts.unshift(current.name);
        }
    }

    return parts.join('.').replaceAll('.[', '[');
}

function hasAnonymousTypeAncestor(reflection) {
    for (
        let current = reflection.parent;
        current && !current.isProject();
        current = current.parent
    ) {
        if (current.kindOf(ReflectionKind.TypeLiteral | ReflectionKind.SomeSignature)) return true;
    }

    return false;
}

function exportedNames(pkg, entry) {
    const program = ts.createProgram(pkg.configuration.fileNames, pkg.configuration.options);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    if (diagnostics.length > 0) throw new Error(formatDiagnostics(diagnostics));

    const source = program.getSourceFile(entry.source);

    if (!source)
        throw new Error(
            `Source entry point is absent from its TypeScript project: ${entry.source}`,
        );

    const checker = program.getTypeChecker();
    const symbol = checker.getSymbolAtLocation(source);

    if (!symbol) throw new Error(`Public entry point must be an ESM module: ${entry.source}`);

    return checker
        .getExportsOfModule(symbol)
        .map((item) => item.name)
        .sort(compare);
}

function qualifiedName(reflection, project) {
    const names = [];

    for (let current = reflection; current && current !== project; current = current.parent) {
        names.unshift(current.name);
    }

    return names.join('.');
}

function summary(reflection) {
    const comment =
        reflection.comment ??
        reflection.signatures?.find((signature) => signature.comment)?.comment;

    return (comment?.summary ?? [])
        .map((part) => part.text)
        .join('')
        .trim();
}

function assertClean(app, importPath, phase) {
    if (app.logger.errorCount || app.logger.warningCount || app.logger.validationWarningCount) {
        throw new Error(
            `TypeDoc ${phase} failed for ${importPath}: ${app.logger.errorCount} errors, ` +
                `${app.logger.warningCount} warnings, ${app.logger.validationWarningCount} validation warnings.`,
        );
    }
}

async function readGenerated(root) {
    const result = new Map();
    const docs = path.join(root, '.docs');

    for (const directory of await generatedDirectories(docs)) {
        for (const [relative, content] of await readTree(directory)) {
            result.set(
                path.relative(docs, path.join(directory, relative)).replaceAll(path.sep, '/'),
                content,
            );
        }
    }

    return result;
}

async function generatedDirectories(docs) {
    await assertNoSymlinks(docs);

    const result = [];
    const api = path.join(docs, 'api');

    await assertNoSymlinks(api);

    if (await exists(api)) result.push(api);

    const packages = path.join(docs, 'packages');

    await assertNoSymlinks(packages);

    if (await exists(packages)) {
        for (const entry of await readdir(packages, { withFileTypes: true })) {
            const directory = path.join(packages, entry.name, 'api');

            await assertNoSymlinks(directory);

            if (await exists(directory)) result.push(directory);
        }
    }

    return result;
}

async function replaceGenerated(root, staging) {
    const docs = path.join(root, '.docs');

    for (const directory of await generatedDirectories(docs)) {
        await rm(directory, { recursive: true });
    }

    for (const directory of await generatedDirectories(staging)) {
        const destination = path.join(docs, path.relative(staging, directory));

        await assertNoSymlinks(destination);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(directory, destination, { recursive: true });
    }
}

async function assertNoSymlinks(file) {
    for (
        let current = path.resolve(file);
        current !== path.dirname(current);
        current = path.dirname(current)
    ) {
        try {
            if ((await lstat(current)).isSymbolicLink()) {
                throw new Error(`Documentation output cannot traverse a symbolic link: ${current}`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
}

async function readTree(directory) {
    const result = new Map();

    if (!(await exists(directory))) return result;

    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
        compare(a.name, b.name),
    )) {
        const file = path.join(directory, entry.name);

        if (entry.isSymbolicLink())
            throw new Error(`Generated documentation contains a symbolic link: ${file}`);

        if (entry.isDirectory()) {
            for (const [name, content] of await readTree(file)) {
                result.set(`${entry.name}/${name}`, content);
            }
        } else if (entry.isFile()) {
            result.set(entry.name, await readFile(file));
        }
    }

    return result;
}

function compareTrees(expected, actual) {
    const differences = [];

    for (const file of [...new Set([...expected.keys(), ...actual.keys()])].sort(compare)) {
        if (!expected.has(file)) differences.push(`Unexpected: ${file}`);
        else if (!actual.has(file)) differences.push(`Missing: ${file}`);
        else if (!expected.get(file).equals(actual.get(file))) differences.push(`Changed: ${file}`);
    }

    return differences;
}

async function writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function exists(file) {
    try {
        await lstat(file);

        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;

        throw error;
    }
}

function formatDiagnostics(diagnostics) {
    return ts.formatDiagnostics(diagnostics, {
        getCurrentDirectory: () => process.cwd(),
        getCanonicalFileName: (file) => file,
        getNewLine: () => '\n',
    });
}

function compare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const mode = process.argv.includes('--check') ? 'check' : 'write';
    const root = fileURLToPath(new URL('../../', import.meta.url));

    generate({ root, mode }).then(
        (result) =>
            console.log(
                `API documentation ${mode}: ${result.packages} packages, ${result.entryPoints} entry points, ${result.exports} exports.`,
            ),
        (error) => {
            console.error(error.message);
            process.exitCode = 1;
        },
    );
}
