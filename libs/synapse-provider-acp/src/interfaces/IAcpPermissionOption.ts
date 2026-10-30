/**
 * One native ACP permission decision, without raw tool inputs or credentials.
 *
 * @public
 */
export interface IAcpPermissionOption {
    /**
     * Native opaque option ID that may be returned by the host.
     */
    readonly id: string;

    /**
     * Safe bounded display label.
     */
    readonly label: string;

    /**
     * Native permission family, such as allow_once or reject_once.
     */
    readonly kind: string;
}
