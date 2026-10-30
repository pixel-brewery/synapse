// #region Imports

import ts from 'typescript';
import { format } from 'prettier';
import { describe, expect, it } from 'vitest';
import { formatSourceLayout } from './formatSourceLayout.mjs';
import { getSourceCommentRanges } from './getSourceCommentRanges.mjs';

// #endregion

function parse(text) {
    return ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true);
}

function literalText(text) {
    const source = parse(text);
    const values = [];

    const visit = (node) => {
        if (ts.isJSDoc(node)) return;

        if (
            ts.isStringLiteralLike(node) ||
            ts.isRegularExpressionLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)
        )
            values.push(node.getText(source));

        for (const child of node.getChildren(source)) visit(child);
    };

    visit(source);

    return values;
}

describe('source layout', () => {
    it('keeps the formatter command stable when Prettier expands a fresh callback body', async () => {
        // Arrange
        const text = 'const release = enter(() => { finish(); throw new Error("closed"); });';
        const options = { parser: 'typescript', tabWidth: 4, singleQuote: true };

        // Act
        const expanded = await format(text, options);
        const laidOut = formatSourceLayout('fixture.ts', expanded);
        const final = await format(laidOut, options);

        // Assert
        expect(final).toContain("finish();\n\n    throw new Error('closed');");
        expect(formatSourceLayout('fixture.ts', final)).toBe(final);
        expect(await format(final, options)).toBe(final);
    });

    it('removes unused regions and retains the needed nonempty sections', () => {
        // Arrange
        const text = [
            'class Worker {',
            '    // #region Fields',
            '    private _active = false;',
            '    // #endregion',
            '    // #region Ctor',
            '    // #endregion',
            '    // #region Properties',
            '    // #endregion',
            '    // #region Methods',
            '    public stop(): void { this._active = false; }',
            '    // #endregion',
            '}',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('Worker.ts', text);

        // Assert
        expect(formatted).toBe(
            [
                'class Worker {',
                '    // #region Fields',
                '',
                '    private _active = false;',
                '',
                '    // #endregion',
                '',
                '    // #region Methods',
                '',
                '    public stop(): void { this._active = false; }',
                '',
                '    // #endregion',
                '}',
            ].join('\n'),
        );
    });

    it('keeps related simple fields together while separating documented members', () => {
        // Arrange
        const text = [
            'class State {',
            '    private _first = 1;',
            '    private _second = 2;',
            '    /** The visible state. */',
            '    public readonly active = true;',
            '    /** The current label. */',
            "    public readonly label = 'ready';",
            '}',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('State.ts', text);

        // Assert
        expect(formatted).toContain('private _first = 1;\n    private _second = 2;\n\n    /**');
        expect(formatted).toContain('public readonly active = true;\n\n    /**');
        expect(formatted).not.toContain('*/\n\n    public');
    });

    it('puts documentation delimiters, descriptions and release tags on separate lines', () => {
        // Arrange
        const text = [
            '/** Returns a result.',
            ' * @public',
            ' * @param value - Supplied result.',
            ' * @returns The supplied result.',
            ' */',
            'export function result(value: string): string { return value; }',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('result.ts', text);

        // Assert
        expect(formatted).toContain(
            [
                '/**',
                ' * Returns a result.',
                ' *',
                ' * @param value - Supplied result.',
                ' * @returns The supplied result.',
                ' *',
                ' * @public',
                ' */',
                'export function result',
            ].join('\n'),
        );
    });

    it('moves a property off a documentation closing line', () => {
        // Arrange
        const text = 'interface IResult {\n    /** Generated text. */ readonly text: string;\n}';

        // Act
        const formatted = formatSourceLayout('IResult.ts', text);

        // Assert
        expect(formatted).toContain(
            '    /**\n     * Generated text.\n     */\n    readonly text: string;',
        );
    });

    it('pads the import region without separating contiguous imports', () => {
        // Arrange
        const text = [
            '// #region Imports',
            'import { first } from "./first.js";',
            'import { second } from "./second.js";',
            '// #endregion',
            'const result = first + second;',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('result.ts', text);

        // Assert
        expect(formatted).toBe(
            [
                '// #region Imports',
                '',
                'import { first } from "./first.js";',
                'import { second } from "./second.js";',
                '',
                '// #endregion',
                '',
                'const result = first + second;',
            ].join('\n'),
        );
    });

    it('separates guards and final results while preserving local declaration groups', () => {
        // Arrange
        const text = [
            'function result(value: number) {',
            '    const first = value;',
            '    const second = first + 1;',
            '    if (second < 1) throw new Error("invalid");',
            '    return second;',
            '}',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('result.ts', text);

        // Assert
        expect(formatted).toContain(
            'const first = value;\n    const second = first + 1;\n\n    if',
        );
        expect(formatted).toContain('throw new Error("invalid");\n\n    return second;');
    });

    it('preserves literals containing fake regions and malformed source fixtures byte for byte', () => {
        // Arrange
        const text = [
            'const quoted = "/** fixture */ // #region Fields";',
            'const pattern = /\\/\\*\\*.*\\*\\//u;',
            'const fixture = String.raw`/** Inline fixture. */',
            'class Fixture {',
            '// #region Fields',
            '// #endregion',
            '}`;',
            '/** Actual documentation. */',
            'function documented(): void {}',
        ].join('\n');
        const before = literalText(text);

        // Act
        const formatted = formatSourceLayout('fixture.ts', text);

        // Assert
        expect(literalText(formatted)).toEqual(before);
        expect(formatted).toContain('/**\n * Actual documentation.\n */');
    });

    it('keeps fenced documentation examples intact while separating real release metadata', () => {
        // Arrange
        const text = [
            '/** Demonstrates a call.',
            ' * @public',
            ' * @example',
            ' * ```ts',
            ' * // #region Example',
            ' * const message = "@public";',
            ' * ```',
            ' */',
            'function example(): void {}',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('example.ts', text);

        // Assert
        expect(formatted).toContain(
            ' * ```ts\n * // #region Example\n * const message = "@public";\n * ```',
        );
        expect(formatted).toContain(' * ```\n *\n * @public\n */');
    });

    it('preserves significant spaces in documentation examples through a Prettier round trip', async () => {
        // Arrange
        const example = [
            ' * ```ts',
            ' * const message = String.raw`first  ',
            ' * middle',
            ' * last`;',
            ' * ```',
        ].join('\n');
        const text = [
            '/** Explains a literal.',
            ' * @public',
            ' * @example',
            example,
            ' */',
            'function example(): void {}',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('example.ts', text);
        const pretty = await format(formatted, { parser: 'typescript', tabWidth: 4 });

        // Assert
        expect(formatted).toContain(example);
        expect(pretty).toContain(example);
        expect(formatSourceLayout('example.ts', pretty)).toBe(pretty);
    });

    it('preserves whitespace-only literal lines while normalizing documentation', () => {
        // Arrange
        const example = [
            ' * ```ts',
            ' * const message = String.raw`first',
            ' *   ',
            ' * last`;',
            ' * ```',
        ].join('\n');
        const text = [
            '/** Explains literal whitespace.',
            ' * @public',
            ' * @example',
            example,
            ' */',
            'function example(): void {}',
        ].join('\n');

        // Act
        const formatted = formatSourceLayout('example.ts', text);

        // Assert
        expect(formatted).toContain(example);
        expect(formatSourceLayout('example.ts', formatted)).toBe(formatted);
    });

    it.each([
        ['````ts', '````', '```md'],
        ['~~~ts', '~~~', '```'],
    ])(
        'preserves nested fence text and tag-like literal lines inside %s',
        async (opening, closing, inner) => {
            // Arrange
            const example = [
                ` * ${opening}`,
                ' * const message = String.raw`first',
                ` * ${inner}`,
                ' *',
                ' * @public',
                ' * last`;',
                ` * ${closing}`,
            ].join('\n');
            const text = [
                '/** Explains nested markup.',
                ' * @public',
                ' * @example',
                example,
                ' */',
                'function example(): void {}',
            ].join('\n');

            // Act
            const formatted = formatSourceLayout('example.ts', text);
            const pretty = await format(formatted, { parser: 'typescript', tabWidth: 4 });

            // Assert
            expect(formatted).toContain(example);
            expect(pretty).toContain(example);
            expect(formatted).toContain(` * ${closing}\n *\n * @public\n */`);
            expect(formatSourceLayout('example.ts', pretty)).toBe(pretty);
        },
    );

    it('retains ordinary block comments and keeps empty classes free of artificial sections', () => {
        // Arrange
        const text =
            'class Empty {\n// #region Fields\n/* Explain the empty owner. */\n// #endregion\n}';

        // Act
        const formatted = formatSourceLayout('Empty.ts', text);

        // Assert
        expect(formatted).toBe('class Empty {\n/* Explain the empty owner. */\n}');
        expect(getSourceCommentRanges(parse(formatted))).toHaveLength(1);
    });

    it('is idempotent for nested documented members and grouped statements', () => {
        // Arrange
        const text = [
            '/** Owns a profile.\n * @public\n */',
            'interface IProfile {',
            '    /** Stable identity. */ readonly id: string;',
            '    /** Optional metadata. */ readonly metadata?: {',
            '        /** Visible label. */ readonly label: string;',
            '        /** Display order. */ readonly order: number;',
            '    };',
            '}',
        ].join('\n');
        const first = formatSourceLayout('IProfile.ts', text);

        // Act
        const second = formatSourceLayout('IProfile.ts', first);

        // Assert
        expect(second).toBe(first);
    });
});
