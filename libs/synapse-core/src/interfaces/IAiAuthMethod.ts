/**
 * An authentication procedure actually supported by a driver.
 *
 * @public
 */
export interface IAiAuthMethod {
    /**
     * Driver-local method identifier.
     */
    readonly id: string;

    /**
     * Human-readable procedure name.
     */
    readonly label: string;

    /**
     * Required native interaction family.
     */
    readonly kind: 'browser' | 'device-code' | 'terminal' | 'credentials';
}
