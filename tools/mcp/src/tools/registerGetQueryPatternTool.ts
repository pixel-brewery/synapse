// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { createPatternExample } from './createPatternExample.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers the compatible query-pattern tool as a Synapse AI-request and structured-result guide.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated pattern snapshot; optional examples remain inert documentation.
 *
 * @internal
 */
export function registerGetQueryPatternTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-query-pattern',
        {
            description:
                'Returns Synapse IAiRequest, AiRuntime.run and native structured-result patterns. This documents AI requests, not database queries.',
            inputSchema: z
                .object({
                    modelName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .optional()
                        .describe(
                            'Optional host-selected native model ID for an illustrative request; this does not invoke or discover a model.',
                        ),
                    fields: z
                        .array(z.string().min(1).max(128))
                        .max(64)
                        .optional()
                        .describe(
                            'Optional result property names for an illustrative JSON Schema; business validation remains host-owned.',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        (parameters) =>
            patternResult(corpus, 'query-pattern', createPatternExample('query', parameters)),
    );
}
