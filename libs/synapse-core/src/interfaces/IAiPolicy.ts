/**
 * Host authorization and retry intent for an execution.
 *
 * @public
 */
export interface IAiPolicy {
    /**
     * Required native filesystem policy; unsupported modes fail before launch.
     */
    readonly mode: 'read-only' | 'workspace-write';

    /**
     * Explicit permission to replay a failed transient text/read operation; default false.
     */
    readonly repeatable?: boolean;

    /**
     * Additional explicit permission to replay a writing operation; default false.
     */
    readonly allowWriteRetry?: boolean;

    /**
     * Optional tool allowlist; drivers must reject unsupported enforcement.
     */
    readonly allowedTools?: readonly string[];

    /**
     * Optional tool denylist; drivers must reject unsupported enforcement.
     */
    readonly deniedTools?: readonly string[];
}
