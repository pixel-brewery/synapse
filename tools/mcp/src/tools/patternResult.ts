// #region Imports

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Reads one authored Synapse pattern and appends optional, inert example text.
 *
 * @param corpus - Validated bundled snapshot; no filesystem lookup occurs here.
 * @param name - Stable pattern identity selected by its registered tool.
 * @param example - Optional caller-tailored Markdown, never executed by the server.
 * @returns The complete pattern or an explicit error when required bundled content is absent.
 *
 * @internal
 */
export function patternResult(
    corpus: IKnowledgeCorpus,
    name: string,
    example = '',
): CallToolResult {
    const pattern = corpus.patterns.find((entry) => entry.name === name);

    if (!pattern) return textResult(`Required Synapse pattern "${name}" is unavailable.`, true);

    return textResult([pattern.content, example].filter(Boolean).join('\n\n'));
}
