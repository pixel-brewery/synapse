// #region Imports

import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

// #endregion

/**
 * Inspect the installed contents of a real packed package, independent of workspace aliases.
 */
export async function inspectPackage(directory, expected) {
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));

    if (
        manifest.name !== expected.name ||
        manifest.version !== expected.version ||
        manifest.type !== 'module' ||
        manifest.sideEffects !== false ||
        manifest.license !== 'MIT'
    )
        throw new Error(`Invalid published manifest: ${expected.name}`);

    if (!manifest.exports?.['.']) throw new Error(`No explicit root export: ${expected.name}`);

    const dependencies = {
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
    };

    if (
        Object.values(dependencies).some((value) => /^(?:workspace|link|portal|file):/u.test(value))
    )
        throw new Error(
            `Workspace-local dependency escaped into packed artifact: ${expected.name}`,
        );

    const providerDependencies = Object.keys(dependencies).filter((name) =>
        name.startsWith('@pixel-brewery/synapse-provider-'),
    );

    if (providerDependencies.some((name) => name !== manifest.name))
        throw new Error(`Concrete provider dependency escaped its owner: ${manifest.name}`);

    const root = await realpath(directory);
    const outputDirectory = await realpath(path.join(root, 'dist'));

    if (!inside(root, outputDirectory))
        throw new Error(`Published output escapes its package: ${manifest.name}`);

    const imports = [];

    for (const [subpath, target] of Object.entries(manifest.exports)) {
        if (subpath === './package.json') continue;

        if (subpath.includes('*'))
            throw new Error(`Unverified wildcard export: ${expected.name}${subpath}`);

        if (
            !target ||
            typeof target !== 'object' ||
            !target.types ||
            !target.import ||
            Object.hasOwn(target, 'require')
        )
            throw new Error(
                `Export needs explicit ESM/types conditions: ${expected.name}${subpath}`,
            );

        for (const [kind, file] of [
            ['import', target.import],
            ['types', target.types],
        ]) {
            if (
                typeof file !== 'string' ||
                !file.startsWith('./dist/') ||
                !file.endsWith(kind === 'types' ? '.d.ts' : '.js')
            )
                throw new Error(`Invalid exported target: ${expected.name}${subpath}`);

            const resolved = await realpath(path.resolve(directory, file));

            if (!inside(outputDirectory, resolved) || !(await lstat(resolved)).isFile())
                throw new Error(`Export escapes its packed package: ${expected.name}${subpath}`);
        }

        imports.push(`${manifest.name}${subpath === '.' ? '' : subpath.slice(1)}`);
    }

    for (const required of ['README.md', 'LICENSE'])
        if (!(await lstat(path.join(root, required))).isFile())
            throw new Error(`Packed package lacks ${required}: ${manifest.name}`);

    const emitted = await files(path.join(root, 'dist'));

    if (
        !emitted.some((file) => file.endsWith('.js')) ||
        !emitted.some((file) => file.endsWith('.d.ts'))
    )
        throw new Error(`Missing native ESM/declaration modules: ${manifest.name}`);

    if (emitted.some((file) => /(?:\.spec\.|\.cjs$|\.tsbuildinfo$)/u.test(file)))
        throw new Error(
            `Packed artifact contains tests, CommonJS or compiler state: ${manifest.name}`,
        );

    for (const file of emitted.filter((name) => name.endsWith('.js'))) {
        const value = await readFile(file, 'utf8');

        if (/\brequire\s*\(/u.test(value) && !value.includes('createRequire'))
            throw new Error(`Unexpected CommonJS in ${manifest.name}: ${path.basename(file)}`);

        if (!(await exists(file.slice(0, -3) + '.d.ts')))
            throw new Error(
                `Module lacks declaration file: ${manifest.name}/${path.basename(file)}`,
            );
    }

    return {
        manifest,
        imports,
        emittedModules: emitted.filter((file) => file.endsWith('.js')).length,
    };
}

async function files(directory) {
    const output = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);

        if (entry.isSymbolicLink()) throw new Error(`Unexpected packed symlink: ${entry.name}`);

        if (entry.isDirectory()) output.push(...(await files(file)));
        else if (entry.isFile()) output.push(file);
    }

    return output;
}

async function exists(file) {
    try {
        return (await lstat(file)).isFile();
    } catch (cause) {
        if (cause.code === 'ENOENT') return false;

        throw cause;
    }
}

function inside(root, target) {
    const relative = path.relative(root, target);

    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
