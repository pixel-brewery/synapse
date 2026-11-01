/**
 * Bounded provider authentication response, retained inside the backend verifier.
 *
 * @remarks The body is untrusted provider data. Concrete verifiers validate only the fields they
 * need and return safe authentication metadata instead of publishing this transport response.
 *
 * @public
 */
export interface IApiKeyVerificationResponse {
    /**
     * HTTP status returned by the selected endpoint, without following redirects.
     */
    readonly status: number;

    /**
     * Parsed JSON, or undefined for an empty or non-JSON unsuccessful response body.
     */
    readonly body: unknown;
}
