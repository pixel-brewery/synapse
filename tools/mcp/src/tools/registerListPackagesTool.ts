// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Registers discovery of the actual public Synapse libraries represented by the checked corpus.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated documentation snapshot without runtime-provider imports.
 *
 * @internal
 */
export function registerListPackagesTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'list-packages',
        {
            description:
                'Lists public Synapse packages with their actual scoped names, descriptions and tags.',
            inputSchema: z.object({}).strict(),
            annotations: readOnlyToolAnnotations,
        },
        () =>
            textResult(
                JSON.stringify(
                    corpus.packages.map((entry) => ({
                        name: entry.name,
                        package: entry.packageName,
                        description: entry.description,
                        tags: entry.tags,
                    })),
                    null,
                    2,
                ),
            ),
    );
}
