// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { createPatternExample } from './createPatternExample.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers host-storage guidance under the compatible repository-pattern tool name.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated RoutingStoreBase and ProfileSessionStoreBase guidance.
 *
 * @internal
 */
export function registerGetRepositoryPatternTool(
    server: McpServer,
    corpus: IKnowledgeCorpus,
): void {
    server.registerTool(
        'get-repository-pattern',
        {
            description:
                'Returns Synapse RoutingStoreBase and ProfileSessionStoreBase storage seams. Business repositories and databases remain application-owned.',
            inputSchema: z
                .object({
                    modelName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .optional()
                        .describe(
                            'Optional host-owned storage namespace used only as example context; no Prisma model or repository is generated.',
                        ),
                    fields: z
                        .array(z.string().min(1).max(128))
                        .max(64)
                        .optional()
                        .describe(
                            'Optional host projection fields; these do not change the actual Synapse framework-state contracts.',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        (parameters) =>
            patternResult(
                corpus,
                'repository-pattern',
                createPatternExample('repository', parameters),
            ),
    );
}
