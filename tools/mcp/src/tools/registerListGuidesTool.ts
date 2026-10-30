// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Registers stable discovery of bundled Synapse integration and architecture guides.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated authored-document snapshot.
 *
 * @internal
 */
export function registerListGuidesTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'list-guides',
        {
            description:
                'Lists bundled Synapse guides and architecture explanations with their stable IDs, titles and display order.',
            inputSchema: z.object({}).strict(),
            annotations: readOnlyToolAnnotations,
        },
        () =>
            textResult(
                JSON.stringify(
                    [...corpus.guides]
                        .sort(
                            (left, right) =>
                                left.order - right.order ||
                                (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
                        )
                        .map((entry) => ({
                            name: entry.name,
                            title: entry.title,
                            description: entry.description,
                            order: entry.order,
                        })),
                    null,
                    2,
                ),
            ),
    );
}
