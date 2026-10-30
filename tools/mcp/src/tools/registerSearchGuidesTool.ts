// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Registers bounded case-insensitive search of bundled authored integration and architecture guides.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated snapshot without ambient checkout or network discovery.
 *
 * @internal
 */
export function registerSearchGuidesTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'search-guides',
        {
            description:
                'Searches bundled Synapse guide identities, headings, descriptions and complete authored contents.',
            inputSchema: z
                .object({
                    query: z
                        .string()
                        .trim()
                        .min(1)
                        .max(256)
                        .describe(
                            'Case-insensitive keyword or phrase to find in integration and architecture guides.',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        ({ query }) => {
            const normalized = query.toLowerCase();
            const matches = corpus.guides.filter((entry) =>
                [entry.name, entry.title, entry.description, entry.content].some((value) =>
                    value.toLowerCase().includes(normalized),
                ),
            );

            if (!matches.length) return textResult(`No guides matched "${query}".`);

            return textResult(
                matches
                    .map((entry) =>
                        [`# ${entry.title}`, entry.description, entry.content].join('\n\n'),
                    )
                    .join('\n\n---\n\n'),
            );
        },
    );
}
