// #region Imports

import type { IApiKeyVerificationRequest } from '../interfaces/IApiKeyVerificationRequest.js';
import type { IApiKeyVerificationResponse } from '../interfaces/IApiKeyVerificationResponse.js';

// #endregion

/**
 * Replaceable backend boundary for bounded provider authentication GET requests.
 *
 * @remarks Construction and imports must remain inert. Implementations own endpoint validation,
 * secret headers, response bounds and cancellation through awaited connection cleanup. They must
 * never invoke a model, follow redirects carrying credentials, retry or expose raw transport errors.
 *
 * @public
 */
export abstract class ApiKeyVerificationTransportBase {
    // #region Methods

    /**
     * Performs one non-inference authentication request without automatic retries.
     *
     * @param request - Explicit HTTPS endpoint, private headers and caller cancellation.
     * @returns Bounded backend-only response after connection cleanup has completed.
     * @throws A safe AiError for invalid configuration, cancellation, limits or transport failure.
     *
     * @public
     */
    public abstract get(request: IApiKeyVerificationRequest): Promise<IApiKeyVerificationResponse>;

    // #endregion
}
