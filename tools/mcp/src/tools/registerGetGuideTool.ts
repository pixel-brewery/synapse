// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Registers retrieval by bundled document identity without interpreting it as a filesystem path.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated authored-document snapshot.
 *
 * @internal
 */
export function registerGetGuideTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-guide',
        {
            description:
                'Gets the complete bundled Synapse guide or architecture explanation identified by list-guides.',
            inputSchema: z
                .object({
                    guideName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .describe('Stable guide identity from list-guides, such as "consumers".'),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        ({ guideName }) => {
            const guide = corpus.guides.find((entry) => entry.name === guideName);

            if (!guide)
                return textResult(
                    `Guide "${guideName}" was not found. Use list-guides to discover available guides.`,
                    true,
                );

            return textResult([`# ${guide.title}`, guide.description, guide.content].join('\n\n'));
        },
    );
}
