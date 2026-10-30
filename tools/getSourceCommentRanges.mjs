// #region Imports

import ts from 'typescript';

// #endregion

/**
 * Collects genuine source comments without treating literal contents as comments.
 *
 * @remarks
 * Includes each complete JSDoc block once, without inspecting its example content.
 * Offsets refer to the supplied source text. Repeated trivia ranges are deduplicated.
 * @param {ts.SourceFile} source - Parsed source whose syntax nodes and tokens own the comments.
 * @returns {Array<Pick<ts.CommentRange, 'kind' | 'pos' | 'end'>>} Comment ranges sorted by source position.
 *
 * @public
 */
export function getSourceCommentRanges(source) {
    const ranges = new Map();

    /**
     * Syntax nodes and tokens waiting for inspection.
     *
     * @type {ts.Node[]}
     */
    const pending = [source];

    while (pending.length > 0) {
        const node = pending.pop();

        if (ts.isJSDoc(node)) continue;

        const comments = [
            ...(ts.getLeadingCommentRanges(source.text, node.pos) ?? []),
            ...(ts.getTrailingCommentRanges(source.text, node.end) ?? []),
        ];

        for (const range of comments) {
            ranges.set(`${range.kind}:${range.pos}:${range.end}`, {
                kind: range.kind,
                pos: range.pos,
                end: range.end,
            });
        }

        for (const child of node.getChildren(source)) pending.push(child);
    }

    return [...ranges.values()].sort(
        (left, right) => left.pos - right.pos || left.end - right.end || left.kind - right.kind,
    );
}
