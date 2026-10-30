// #region Imports

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IKnowledgeCorpus } from '../interfaces/IKnowledgeCorpus.js';
import { readOnlyToolAnnotations } from './readOnlyToolAnnotations.js';
import { textResult } from './textResult.js';

// #endregion

/**
 * Registers complete package overviews and recursively collected generated API documentation.
 *
 * @param server - Explicit local SDK server receiving this read-only tool.
 * @param corpus - Validated package metadata, READMEs and complete API content.
 *
 * @internal
 */
export function registerGetPackageDocTool(server: McpServer, corpus: IKnowledgeCorpus): void {
    server.registerTool(
        'get-package-doc',
        {
            description:
                'Gets a Synapse package README and complete generated API, including nested class, interface and function pages.',
            inputSchema: z
                .object({
                    packageName: z
                        .string()
                        .trim()
                        .min(1)
                        .max(128)
                        .describe(
                            'Package directory slug, such as "synapse-runtime" or "synapse-provider-codex".',
                        ),
                })
                .strict(),
            annotations: readOnlyToolAnnotations,
        },
        ({ packageName }) => {
            const entry = corpus.packages.find((candidate) => candidate.name === packageName);

            if (!entry)
                return textResult(
                    `Package "${packageName}" was not found. Use list-packages to discover available packages.`,
                    true,
                );

            return textResult(
                [
                    `# ${entry.title}`,
                    entry.description,
                    `**Package:** \`${entry.packageName}\``,
                    `**Version:** ${entry.version}`,
                    ...(entry.tags.length ? [`**Tags:** ${entry.tags.join(', ')}`] : []),
                    entry.overview,
                    '## API Reference',
                    entry.apiContent,
                ].join('\n\n'),
            );
        },
    );
}
