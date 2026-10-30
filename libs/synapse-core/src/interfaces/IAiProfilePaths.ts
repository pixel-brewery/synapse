/**
 * Filesystem locations explicitly owned by one application/account profile.
 *
 * @public
 */
export interface IAiProfilePaths {
    /**
     * Profile root, normally a private application-owned directory.
     */
    readonly root: string;

    /**
     * Isolated HOME/USERPROFILE directory used by the CLI.
     */
    readonly home: string;

    /**
     * CLI configuration location, mapped explicitly for legacy profiles.
     */
    readonly configuration: string;

    /**
     * Native CLI credential location; never a token value.
     */
    readonly credentials: string;

    /**
     * Execution-only state, separate from credentials when supported.
     */
    readonly execution: string;

    /**
     * Private temporary directory for profile-owned subprocess files.
     */
    readonly temporary: string;

    /**
     * Optional native CLI database directory; host application databases are separate.
     */
    readonly sqlite?: string;
}
