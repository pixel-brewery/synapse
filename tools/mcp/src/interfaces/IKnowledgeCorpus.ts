// #region Imports

import type { IKnowledgeDocument } from './IKnowledgeDocument.js';
import type { IPackageKnowledge } from './IPackageKnowledge.js';

// #endregion

/**
 * Complete, versioned documentation snapshot consumed by the local knowledge server.
 *
 * @remarks The builder derives this data from package manifests, checked TypeDoc artifacts and authored documentation. The server never imports provider implementations or discovers another checkout.
 *
 * @internal
 */
export interface IKnowledgeCorpus {
    /**
     * Supported serialization version; unknown versions are rejected before serving tools.
     */
    readonly schemaVersion: 1;

    /**
     * Deterministically ordered public library overviews and complete generated API Markdown.
     */
    readonly packages: readonly IPackageKnowledge[];

    /**
     * Authored integration and architecture documents, ordered by their stable identities.
     */
    readonly guides: readonly IKnowledgeDocument[];

    /**
     * The nine Synapse-specific architecture patterns addressed by the compatible tool names.
     */
    readonly patterns: readonly IKnowledgeDocument[];
}
