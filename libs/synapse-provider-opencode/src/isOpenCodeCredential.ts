/**
 * Recognizes the native OpenCode 1.x credential variants without exposing credential values.
 *
 * @param value - One untrusted auth.json entry or explicit inline credential entry.
 * @returns Whether the entry satisfies the CLI's OAuth, API or well-known credential shape.
 *
 * @internal
 */
export function isOpenCodeCredential(value: unknown): value is Readonly<Record<string, unknown>> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

    if (!('type' in value)) return false;

    if (value.type === 'api')
        return (
            'key' in value &&
            typeof value.key === 'string' &&
            (!('metadata' in value) ||
                (typeof value.metadata === 'object' &&
                    value.metadata !== null &&
                    !Array.isArray(value.metadata) &&
                    Object.values(value.metadata).every((entry) => typeof entry === 'string')))
        );

    if (value.type === 'wellknown')
        return (
            'key' in value &&
            typeof value.key === 'string' &&
            'token' in value &&
            typeof value.token === 'string'
        );

    return (
        value.type === 'oauth' &&
        'access' in value &&
        typeof value.access === 'string' &&
        'refresh' in value &&
        typeof value.refresh === 'string' &&
        'expires' in value &&
        typeof value.expires === 'number' &&
        Number.isSafeInteger(value.expires) &&
        value.expires >= 0 &&
        (!('accountId' in value) || typeof value.accountId === 'string') &&
        (!('enterpriseUrl' in value) || typeof value.enterpriseUrl === 'string')
    );
}
