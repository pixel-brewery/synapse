/**
 * One authored guide, architecture explanation or Synapse-specific implementation pattern.
 *
 * @internal
 */
export interface IKnowledgeDocument {
    /**
     * Stable document identity accepted by the guide or pattern tool.
     */
    readonly name: string;

    /**
     * Human-readable heading derived from the actual document.
     */
    readonly title: string;

    /**
     * Short searchable description of the document's purpose.
     */
    readonly description: string;

    /**
     * Stable display order; equal orders are resolved by document identity.
     */
    readonly order: number;

    /**
     * Complete authored Markdown body.
     */
    readonly content: string;
}
