/**
 * An owned native credential snapshot used to preserve refreshes without crossing profiles.
 *
 * @public
 */
export interface ICodexCredentialSnapshot {
    /**
     * Runtime CODEX_HOME containing only this profile's credential snapshot and execution state.
     */
    readonly home: string;

    /**
     * Native account credential file copied into the runtime.
     */
    readonly source: string;

    /**
     * Baseline SHA-256 used to avoid overwriting a concurrent credential change.
     */
    readonly baseline?: string;

    /**
     * Snapshot auth.json path, or absent when the account has no credentials.
     */
    readonly target: string;
}
