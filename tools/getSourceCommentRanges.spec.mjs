// #region Imports

import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { getSourceCommentRanges } from './getSourceCommentRanges.mjs';

// #endregion

function parseSource(text) {
    return ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function expectedRanges(text, comments) {
    let nextPosition = 0;

    return comments.map(([kind, comment]) => {
        const pos = text.indexOf(comment, nextPosition);

        if (pos === -1) throw new Error(`Comment fixture not found: ${comment}`);

        nextPosition = pos + comment.length;

        return { kind, pos, end: nextPosition };
    });
}

describe('lexical source comments', () => {
    it('preserves comments between import and expression tokens in source order', () => {
        // Arrange
        const text = [
            '/* license */',
            'import /* before binding */ { value /* before alias */ as renamed } from "./dependency.js"; // import tail',
            '// between imports',
            'import { other } from "./other.js";',
            'const result = renamed /* before operator */ + /* after operator */ other;',
        ].join('\n');
        const source = parseSource(text);
        const expected = expectedRanges(text, [
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* license */'],
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* before binding */'],
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* before alias */'],
            [ts.SyntaxKind.SingleLineCommentTrivia, '// import tail'],
            [ts.SyntaxKind.SingleLineCommentTrivia, '// between imports'],
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* before operator */'],
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* after operator */'],
        ]);

        // Act
        const actual = getSourceCommentRanges(source);

        // Assert
        expect(actual).toEqual(expected);
    });

    it('finds real comments inside nested template interpolations without scanning raw text', () => {
        // Arrange
        const text = [
            'const view = `// #region RawHead',
            '${/* expression */ value // expression tail',
            '} raw /* fake */ ${`${// nested expression',
            'value} // #endregion NestedRaw`} tail`;',
        ].join('\n');
        const source = parseSource(text);
        const expected = expectedRanges(text, [
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* expression */'],
            [ts.SyntaxKind.SingleLineCommentTrivia, '// expression tail'],
            [ts.SyntaxKind.SingleLineCommentTrivia, '// nested expression'],
        ]);

        // Act
        const actual = getSourceCommentRanges(source);

        // Assert
        expect(actual).toEqual(expected);
    });

    it('ignores fake regions in quoted strings, regular expressions and raw fixture templates', () => {
        // Arrange
        const text = [
            'const quoted = "// #region Quoted";',
            "const blockText = '/* #endregion Quoted */';",
            'const linePattern = /\\/\\/ #region Regex/u;',
            'const blockPattern = /\\/\\* #endregion Regex \\*\\//u;',
            'const template = `// #region Template',
            '/* #endregion Template */`;',
            'const fixture = String.raw`// #region Fixture',
            '/* #endregion Fixture */`;',
        ].join('\n');
        const source = parseSource(text);

        // Act
        const actual = getSourceCommentRanges(source);

        // Assert
        expect(actual).toEqual([]);
    });

    it('returns a complete JSDoc block once without extracting comments from its example', () => {
        // Arrange
        const documentation = [
            '/**',
            ' * Provides a documented example.',
            ' *',
            ' * @example',
            ' * ```ts',
            ' * // #region Example',
            ' * const value = "// #endregion Example";',
            ' * ```',
            ' *',
            ' * @public',
            ' */',
        ].join('\n');
        const text = `${documentation}\nexport function documented(): void {}\n// real EOF`;
        const source = parseSource(text);
        const expected = expectedRanges(text, [
            [ts.SyntaxKind.MultiLineCommentTrivia, documentation],
            [ts.SyntaxKind.SingleLineCommentTrivia, '// real EOF'],
        ]);

        // Act
        const actual = getSourceCommentRanges(source);

        // Assert
        expect(actual).toEqual(expected);
    });

    it('deduplicates shared trivia while preserving identical comments at distinct offsets', () => {
        // Arrange
        const text = '/* repeated */ const value = 1; /* repeated */';
        const source = parseSource(text);
        const expected = expectedRanges(text, [
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* repeated */'],
            [ts.SyntaxKind.MultiLineCommentTrivia, '/* repeated */'],
        ]);

        // Act
        const actual = getSourceCommentRanges(source);

        // Assert
        expect(actual).toEqual(expected);
    });

    it.each([
        { name: 'an empty file', text: '', comments: [] },
        {
            name: 'a file containing only an EOF line comment',
            text: '// EOF without newline',
            comments: [[ts.SyntaxKind.SingleLineCommentTrivia, '// EOF without newline']],
        },
        {
            name: 'a file containing only a block comment',
            text: '/* only comment */',
            comments: [[ts.SyntaxKind.MultiLineCommentTrivia, '/* only comment */']],
        },
        { name: 'an empty function body', text: 'function empty() {}', comments: [] },
        {
            name: 'an otherwise empty body followed by an EOF comment',
            text: 'function empty() { /* body comment */ } // EOF',
            comments: [
                [ts.SyntaxKind.MultiLineCommentTrivia, '/* body comment */'],
                [ts.SyntaxKind.SingleLineCommentTrivia, '// EOF'],
            ],
        },
        {
            name: 'an otherwise empty body containing a line comment',
            text: 'function empty() {\n// body comment\n}',
            comments: [[ts.SyntaxKind.SingleLineCommentTrivia, '// body comment']],
        },
    ])('handles $name', ({ text, comments }) => {
        // Arrange
        const source = parseSource(text);
        const expected = expectedRanges(text, comments);

        // Act
        const actual = getSourceCommentRanges(source);

        // Assert
        expect(actual).toEqual(expected);
    });
});
