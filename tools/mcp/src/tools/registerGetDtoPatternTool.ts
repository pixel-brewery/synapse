// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers the get-dto-pattern documentation contract with Synapse-specific semantics.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated authored patterns aligned with the actual Synapse APIs.
 *
 * @internal
 */
export function registerGetDtoPatternTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-dto-pattern',
        {
            description:
                'Returns Synapse public interfaces, discriminated unions, structured results and runtime boundary validation.',
            inputSchema: z.object({}).strict(),
            annotations: readOnlyToolAnnotations,
        },
        () => patternResult(corpus, 'dto-pattern'),
    );
}
