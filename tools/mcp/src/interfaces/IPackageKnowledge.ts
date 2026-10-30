/**
 * One public package's actual metadata, shipped overview and complete generated API content.
 *
 * @internal
 */
export interface IPackageKnowledge {
    /**
     * Stable package-directory slug accepted by get-package-doc, such as synapse-runtime.
     */
    readonly name: string;

    /**
     * Scoped package name taken from the manifest and checked API index.
     */
    readonly packageName: string;

    /**
     * Coordinated package version represented by this documentation snapshot.
     */
    readonly version: string;

    /**
     * Consumer-facing package heading.
     */
    readonly title: string;

    /**
     * Package responsibility from its actual manifest.
     */
    readonly description: string;

    /**
     * Searchable package keywords, without invented provider capabilities.
     */
    readonly tags: readonly string[];

    /**
     * Complete package README explaining imports, composition and ownership.
     */
    readonly overview: string;

    /**
     * Recursively collected generated API pages, including nested member documentation.
     */
    readonly apiContent: string;
}
