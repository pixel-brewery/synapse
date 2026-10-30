// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { createPatternExample } from './createPatternExample.js';
import { patternResult } from './patternResult.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';

// #endregion

/**
 * Registers explicit constructor composition under the compatible module-pattern tool name.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated Synapse composition and abstract-adapter guidance.
 *
 * @internal
 */
export function registerGetModulePatternTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-module-pattern',
        {
            description:
                'Returns explicit Synapse constructor composition and Base adapter seams. This does not generate NestJS modules, decorators or DI registration.',
            inputSchema: z
                .object({
                    moduleName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .optional()
                        .describe(
                            'Optional application composition label for the example; this is not a required module class.',
                        ),
                    bases: z
                        .array(
                            z
                                .string()
                                .min(1)
                                .max(128)
                                .regex(/Base$/u, 'Abstract class names must end in Base.'),
                        )
                        .max(64)
                        .optional()
                        .describe(
                            'Optional host-owned abstract seam names ending in Base; these are not invented Synapse exports.',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        (parameters) =>
            patternResult(corpus, 'module-pattern', createPatternExample('module', parameters)),
    );
}
