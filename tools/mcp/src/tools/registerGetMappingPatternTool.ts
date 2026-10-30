// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { createPatternExample } from './createPatternExample.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers native-event normalization and host-result projection guidance.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated Synapse mapping pattern without framework service dependencies.
 *
 * @internal
 */
export function registerGetMappingPatternTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-mapping-pattern',
        {
            description:
                'Returns Synapse native-data normalization into AiEvent/IAiResult and application-owned result projection; no MappingService dependency is required.',
            inputSchema: z
                .object({
                    entityName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .optional()
                        .describe(
                            'Optional label for the native input record, used only in example text.',
                        ),
                    fields: z
                        .array(z.string().min(1).max(128))
                        .max(64)
                        .optional()
                        .describe(
                            'Optional selected property names; values remain unknown until the host validates them.',
                        ),
                    responseName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .optional()
                        .describe(
                            'Optional host response label; defaults to the entity label followed by Response.',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        (parameters) =>
            patternResult(corpus, 'mapping-pattern', createPatternExample('mapping', parameters)),
    );
}
