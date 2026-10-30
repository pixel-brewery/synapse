// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers the get-guard-pattern documentation contract with Synapse-specific semantics.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated authored patterns aligned with the actual Synapse APIs.
 *
 * @internal
 */
export function registerGetGuardPatternTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-guard-pattern',
        {
            description:
                'Returns Synapse IAiPolicy, capability validation, admission and profile/session binding patterns.',
            inputSchema: z.object({}).strict(),
            annotations: readOnlyToolAnnotations,
        },
        () => patternResult(corpus, 'guard-pattern'),
    );
}
