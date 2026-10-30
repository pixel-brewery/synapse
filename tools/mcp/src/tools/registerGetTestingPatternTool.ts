// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers the get-testing-pattern documentation contract with Synapse-specific semantics.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated authored patterns aligned with the actual Synapse APIs.
 *
 * @internal
 */
export function registerGetTestingPatternTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-testing-pattern',
        {
            description:
                'Returns Synapse adjacent Vitest, SimulatedDriver and ReplayProcessRunner patterns without live provider accounts.',
            inputSchema: z.object({}).strict(),
            annotations: readOnlyToolAnnotations,
        },
        () => patternResult(corpus, 'testing-pattern'),
    );
}
