// #region Imports

import type { IAiAuthStatus } from '@pixel-brewery/synapse-core';
import type { IApiKeyCredentialScope } from '../interfaces/IApiKeyCredentialScope.js';

// #endregion

/**
 * Backend adapter that verifies an API key using the host's selected provider client.
 *
 * @remarks A stored string or a matching key prefix is not verified authentication. Implementations
 * must perform a bounded, non-inference authentication check, honor cancellation and return only
 * safe account metadata. Provider endpoints, HTTP policy, SDK dependencies and authorization
 * remain with the injected adapter. Verification does not prove access to every model or budget.
 * No model invocation, streaming implementation or provider SDK is supplied by this contract.
 *
 * @public
 */
export abstract class ApiKeyVerifierBase {
    // #region Methods

    /**
     * Checks this connection's candidate secret without storing it or invoking a model.
     *
     * @param scope - Complete authorized connection identity used to select provider policy.
     * @param apiKey - Backend-only candidate key; never return or log it.
     * @param signal - Bounded cancellation supplied by the authentication lifecycle.
     * @returns Safe status for the selected authentication check. Authenticated false means that
     * access could not be verified; a restricted key is not necessarily an invalid key.
     * @throws An error for cancellation, provider or transport failure.
     *
     * @public
     */
    public abstract verify(
        scope: IApiKeyCredentialScope,
        apiKey: string,
        signal: AbortSignal,
    ): Promise<IAiAuthStatus>;

    // #endregion
}
