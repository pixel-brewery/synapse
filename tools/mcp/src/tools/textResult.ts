// #region Imports

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// #endregion

/**
 * Creates an MCP text response within the documented eight-MiB result budget.
 *
 * @param text - Complete documentation text, never a command to execute.
 * @param isError - Whether the request could not produce its requested documentation.
 * @returns A text-only SDK result; oversized content is reported explicitly without truncation.
 *
 * @internal
 */
export function textResult(text: string, isError = false): CallToolResult {
    if (Buffer.byteLength(text, 'utf8') > 8_388_608)
        return {
            content: [
                {
                    type: 'text',
                    text: 'The documentation result exceeds the eight-MiB response limit. Use a more specific search.',
                },
            ],
            isError: true,
        };

    return {
        content: [{ type: 'text', text }],
        ...(isError ? { isError: true } : {}),
    };
}
