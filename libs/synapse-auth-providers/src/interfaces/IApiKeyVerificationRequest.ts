/**
 * One bounded, non-inference provider authentication request.
 *
 * @remarks Only GET is supported. API keys belong in headers, never the URL or request body.
 * The selected transport must protect headers from redirects and reject unsafe destinations.
 *
 * @public
 */
export interface IApiKeyVerificationRequest {
    /**
     * Public HTTPS authentication or account-metadata endpoint selected by the verifier.
     */
    readonly url: string;

    /**
     * Explicit authentication and protocol headers; values are backend-only secrets.
     */
    readonly headers: Readonly<Record<string, string>>;

    /**
     * Caller cancellation, including the outer authentication operation's expiry.
     */
    readonly signal: AbortSignal;
}
