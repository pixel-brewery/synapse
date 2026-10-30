// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Registers case-insensitive search over package metadata, overviews and complete generated APIs.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated snapshot; API member pages are searchable without importing their code.
 *
 * @internal
 */
export function registerSearchDocsTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'search-docs',
        {
            description:
                'Searches Synapse package names, metadata, READMEs and every bundled generated API page by keyword or phrase.',
            inputSchema: z
                .object({
                    query: z
                        .string()
                        .trim()
                        .min(1)
                        .max(256)
                        .describe(
                            'Case-insensitive text to find, including names or text appearing only in API member documentation.',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        ({ query }) => {
            const normalized = query.toLowerCase();
            const matches = corpus.packages.filter((entry) =>
                [
                    entry.name,
                    entry.packageName,
                    entry.title,
                    entry.description,
                    ...entry.tags,
                    entry.overview,
                    entry.apiContent,
                ].some((value) => value.toLowerCase().includes(normalized)),
            );

            if (!matches.length) return textResult(`No package documentation matched "${query}".`);

            return textResult(
                matches
                    .map((entry) =>
                        [
                            `# ${entry.title}`,
                            `**Package:** \`${entry.packageName}\``,
                            entry.description,
                            entry.overview,
                            '## API Reference',
                            entry.apiContent,
                        ].join('\n\n'),
                    )
                    .join('\n\n---\n\n'),
            );
        },
    );
}
