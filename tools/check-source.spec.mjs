// #region Imports

import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { inspectSource } from './check-source.mjs';

// #endregion

const execute = promisify(execFile);

describe('Synapse source boundaries', () => {
    it.each(['libs/synapse-core/src/Example.spec.ts', 'apps/meeting-notes/src/main.ts'])(
        'checks test/host structure without imposing library API or dependency rules: %s',
        (path) => {
            // Arrange
            const source = `// #region Imports

import { platform } from 'node:os';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';

// #endregion

export class TestDouble {
// #region Fields

public value = process.env['NODE_ENV'];

// #endregion
}

export const configured = true;`;

            // Act
            const failures = inspectSource(path, source);

            // Assert
            expect(failures).toEqual([]);
        },
    );

    it.each(['libs/synapse-core/src/Example.spec.ts', 'apps/meeting-notes/src/main.ts'])(
        'still rejects actual classes without regions in tests and executable hosts: %s',
        (path) => {
            // Arrange
            const source = 'class TestDouble { public value = 1; }';

            // Act
            const failures = inspectSource(path, source);

            // Assert
            expect(failures).toContainEqual(
                expect.stringContaining('value belongs in the Fields region'),
            );
            expect(failures).not.toContainEqual(expect.stringContaining('public API TSDoc'));
        },
    );

    it('checks actual spec files in the CLI instead of stopping after their adjacency check', async () => {
        // Arrange
        const temporary = await realpath(await mkdtemp(join(tmpdir(), 'synapse-source-cli-')));

        try {
            const tools = join(temporary, 'tools');
            const sources = join(temporary, 'libs', 'synapse-core', 'src');

            await mkdir(tools, { recursive: true });
            await mkdir(sources, { recursive: true });
            await mkdir(join(temporary, 'apps'));
            await symlink(
                fileURLToPath(new URL('../node_modules', import.meta.url)),
                join(temporary, 'node_modules'),
                'junction',
            );

            for (const name of ['check-source.mjs', 'getSourceCommentRanges.mjs'])
                await copyFile(new URL(name, import.meta.url), join(tools, name));

            await writeFile(
                join(sources, 'Example.ts'),
                `/**
 * Owns the fixture's production declaration.
 *
 * @public
 */
export class Example {}`,
            );

            const imports = `// #region Imports

import { platform } from 'node:os';
import { CodexDriver } from '@pixel-brewery/synapse-provider-codex';

// #endregion

`;
            const spec = join(sources, 'Example.spec.ts');
            const command = join(tools, 'check-source.mjs');
            const options = { cwd: temporary, encoding: 'utf8' };

            await writeFile(
                spec,
                imports + "export class TestDouble { public value = process.env['NODE_ENV']; }",
            );

            // Act / Assert
            await expect(execute(process.execPath, [command], options)).rejects.toMatchObject({
                stderr: expect.stringContaining('value belongs in the Fields region'),
            });

            await writeFile(
                spec,
                imports +
                    `export class TestDouble {
// #region Fields

public value = process.env['NODE_ENV'];

// #endregion
}`,
            );

            const checked = await execute(process.execPath, [command], options);

            expect(checked.stdout).toContain('(2 files)');
        } finally {
            await rm(temporary, { recursive: true, force: true });
        }
    });

    it('checks declarations exposed through named exports', () => {
        // Arrange
        const source = 'interface Account { token: string; }\nexport { Account };';

        // Act
        const failures = inspectSource('libs/synapse-core/src/Incorrect.ts', source);

        // Assert
        expect(failures).toEqual(
            expect.arrayContaining([
                expect.stringContaining('Account must own Account.ts'),
                expect.stringContaining('needs public API TSDoc'),
                expect.stringContaining('I-prefixed interfaces'),
            ]),
        );
    });

    it.each([
        [
            'libs/synapse-runtime/src/load.ts',
            "import('@pixel-brewery/synapse-provider-codex')",
            'Provider-neutral',
        ],
        [
            'libs/synapse-runtime/src/load.ts',
            "import('../../synapse-provider-codex/src/index.js')",
            'Cross-package',
        ],
        [
            'libs/synapse-provider-codex/src/load.ts',
            "import('@pixel-brewery/synapse-provider-claude')",
            'other provider',
        ],
        ['libs/synapse-core/src/load.ts', 'process.env.PATH', 'Node.js globals'],
    ])('enforces dependency ownership for %s with %s', (path, source, message) => {
        // Arrange / Act
        const failures = inspectSource(path, source);

        // Assert
        expect(failures).toContainEqual(expect.stringContaining(message));
    });

    it('checks internal class structure without requiring public API documentation', () => {
        // Arrange
        const source = 'class Internal { private value = 0; }';

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('value belongs in the Fields region'),
        );
        expect(failures).not.toContainEqual(expect.stringContaining('public API TSDoc'));
    });

    it('accepts a documented class with only its populated regions and method contracts', () => {
        // Arrange
        const source = `/**
 * Owns a bounded execution.
 *
 * @public
 */
export class Runner {
// #region Fields

private readonly _label: string = 'worker';

// #endregion

// #region Methods

/**
 * Returns a labeled result.
 *
 * @param value - Result text supplied by the caller.
 * @returns Labeled text for this execution.
 *
 * @public
 */
public run(value: string): string { return this._label + value; }

// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/services/Runner.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('accepts a documented interface at its canonical owner', () => {
        // Arrange
        const source = `/**
 * A profile owned by one application.
 *
 * @public
 */
export interface IProfile {
/**
 * Stable account identifier.
 */
readonly id: string;
}`;

        // Act
        const failures = inspectSource('libs/synapse-core/src/interfaces/IProfile.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('rejects an undocumented public method even when the class is documented', () => {
        // Arrange
        const source = `/**
 * Runs a single operation.
 *
 * @public
 */
export class Runner {
// #region Methods

public run(value: string): string { return value; }

// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/services/Runner.ts', source);

        // Assert
        expect(failures).toContainEqual(expect.stringContaining('run needs public API TSDoc'));
    });

    it('requires parameter and result contracts beyond a comment being present', () => {
        // Arrange
        const source =
            '/** Runs an operation. @public */\nexport function run(value: string): string { return value; }';

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/run.ts', source);

        // Assert
        expect(failures).toEqual(
            expect.arrayContaining([
                expect.stringContaining('@param value'),
                expect.stringContaining('@returns'),
            ]),
        );
    });

    it('rejects interfaces outside interfaces and abstracts outside abstracts', () => {
        // Arrange
        const source = '/** Owns a profile. @public */\nexport interface Profile {}';

        // Act
        const failures = inspectSource('libs/synapse-core/src/Profile.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('I-prefixed interfaces belong under interfaces/'),
        );
    });

    it('rejects a concrete provider dependency from a neutral runtime package', () => {
        // Arrange
        const source =
            "// #region Imports\n\nimport { CodexDriver } from '@pixel-brewery/synapse-provider-codex';\n\n// #endregion\n";

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/Runner.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('Provider-neutral packages cannot import concrete drivers'),
        );
    });

    it('rejects private naming and incorrect class regions', () => {
        // Arrange
        const source = `/** Owns bounded state. @public */
export class State {
// #region Methods
private value = 1;
private _change(): void {}
// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/State.ts', source);

        // Assert
        expect(failures).toEqual(
            expect.arrayContaining([
                expect.stringContaining('value belongs in the Fields region'),
                expect.stringContaining('Private fields need an underscore'),
                expect.stringContaining('Private methods do not use underscore'),
            ]),
        );
    });

    it('accepts an empty class without artificial regions', () => {
        // Arrange
        const source = 'class Empty {}';

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('accepts constructor and accessor regions without unused fields or methods regions', () => {
        // Arrange
        const source = `class Accessor {
// #region Ctor

public constructor() {}

// #endregion

// #region Properties

public get value(): number { return 1; }

// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('accepts region padding with native Windows line endings', () => {
        // Arrange
        const source = [
            'class Windows {',
            '// #region Fields',
            '',
            'private readonly _value = 1;',
            '',
            '// #endregion',
            '}',
        ].join('\r\n');

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it.each(['@inheritDoc Base.run', '{@inheritDoc Base.run}'])(
        'keeps TypeDoc responsible for resolving the inherited API contract: %s',
        (inheritance) => {
            // Arrange
            const source = `/**
 * ${inheritance}
 */
export function run(value: string): string { return value; }`;

            // Act
            const failures = inspectSource('libs/synapse-runtime/src/run.ts', source);

            // Assert
            expect(failures).toEqual([]);
        },
    );

    it('rejects comment-only regions without counting explanatory comments as members', () => {
        // Arrange
        const source = `class Empty {
// #region Fields

// This is an explanation, not a class member.

// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(expect.stringContaining('omit empty regions'));
    });

    it.each([
        ['Methods', 'Fields'],
        ['Fields', 'Fields'],
        ['Unknown', 'Methods'],
    ])('rejects unordered, duplicate or unknown region names: %s then %s', (first, second) => {
        // Arrange
        const source = `class Ordered {
// #region ${first}

private readonly _value = 1;

// #endregion

// #region ${second}

private read(): number { return this._value; }

// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(expect.stringContaining('Class regions must follow'));
    });

    it.each([
        'class Broken {\n// #endregion\n}',
        'class Broken {\n// #region Fields\n\nprivate readonly _value = 1;\n}',
        `class Broken {
// #region Fields

// #region Methods

private read(): number { return 1; }

// #endregion

// #endregion
}`,
    ])('rejects unmatched or nested class regions', (source) => {
        // Arrange / Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(expect.stringContaining('balanced and nonnested'));
    });

    it('does not treat a closed region as ownership of a later member', () => {
        // Arrange
        const source = `class Escaped {
// #region Methods

private first(): number { return 1; }

// #endregion

private second(): number { return 2; }
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('second belongs in the Methods region'),
        );
    });

    it('ignores region-like strings, interpolated template text, regex and quoted code fixtures', () => {
        // Arrange
        const source = [
            'class Literals {',
            '// #region Fields',
            '',
            'private readonly _quoted = "// #endregion";',
            'private readonly _template = `// #region Ctor ${"// #endregion"} // #region Properties`;',
            'private readonly _regex = /\\/\\/ #region Methods/;',
            'private readonly _fixture = `class Fake { private bad = 1; /** inline fixture */ }`;',
            '',
            '// #endregion',
            '}',
        ].join('\n');

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('keeps nested-class regions and method-body comments out of their containing class regions', () => {
        // Arrange
        const source = `class Outer {
// #region Fields

private readonly _inner = class {
// #region Methods

private read(): number { return 1; }

// #endregion
};

// #endregion

// #region Methods

private read(): number {
    // #region Algorithm detail
    const value = 1;
    // #endregion
    return value;
}

// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('requires interior region padding and separation between populated class regions', () => {
        // Arrange
        const source = `class Compact {
// #region Fields
private readonly _value = 1;
// #endregion
// #region Methods
private read(): number { return this._value; }
// #endregion
}`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual(
            expect.arrayContaining([
                expect.stringContaining('one blank line after a region opening'),
                expect.stringContaining('one blank line before a region closure'),
                expect.stringContaining('Separate regions with one blank line'),
            ]),
        );
    });

    it('accepts one padded Imports region around the actual contiguous import block', () => {
        // Arrange
        const source = `// #region Imports

import type { IAiProfile } from '@pixel-brewery/synapse-core';

// #endregion

const profile: IAiProfile | undefined = undefined;`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toEqual([]);
    });

    it('rejects an empty Imports region instead of requiring a placeholder', () => {
        // Arrange
        const source = '// #region Imports\n\n// Nothing imported.\n\n// #endregion\n';

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('Imports regions must contain actual imports'),
        );
    });

    it('does not recognize an Imports marker embedded in documentation as a real wrapper', () => {
        // Arrange
        const source = `/**
 * A quoted example: // #region Imports
 */
import type { IAiProfile } from '@pixel-brewery/synapse-core';

// #endregion`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('Wrap the contiguous top import block'),
        );
    });

    it('rejects source declarations inside an otherwise valid Imports wrapper', () => {
        // Arrange
        const source = `// #region Imports

import type { IAiProfile } from '@pixel-brewery/synapse-core';
const profile: IAiProfile | undefined = undefined;

// #endregion`;

        // Act
        const failures = inspectSource('libs/synapse-runtime/src/internal.ts', source);

        // Assert
        expect(failures).toContainEqual(
            expect.stringContaining('Wrap the contiguous top import block'),
        );
    });
});
