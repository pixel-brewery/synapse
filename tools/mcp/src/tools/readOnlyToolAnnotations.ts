// #region Imports

import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

// #endregion

/**
 * Declares that knowledge tools read a closed local snapshot without external or destructive effects.
 *
 * @internal
 */
export const readOnlyToolAnnotations: Readonly<ToolAnnotations> = Object.freeze({
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
});
