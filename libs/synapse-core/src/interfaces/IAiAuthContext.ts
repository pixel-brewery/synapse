// #region Imports

import type { IAiInstance } from './IAiInstance.js';
import type { IAiAuthInteraction } from './IAiAuthInteraction.js';

// #endregion

/**
 * Explicit native login execution with host-owned interaction presentation.
 *
 * @public
 */
export interface IAiAuthContext {
    /**
     * Isolated account instance being authenticated.
     */
    readonly instance: IAiInstance;

    /**
     * Actually supported method selected by the host.
     */
    readonly methodId: string;

    /**
     * Authentication expiry/cancellation signal.
     */
    readonly signal: AbortSignal;

    /**
     * Present a native interaction; auth owner validates identity and expiry.
     *
     * @param interaction - Correlated native interaction to present.
     */
    readonly interaction: (interaction: IAiAuthInteraction) => void;

    /**
     * Await an owner-validated response, cancelled when this flow ends.
     *
     * @param interactionId - Current interaction whose response is requested.
     * @returns Secret input values validated against the current owner and operation.
     */
    readonly response: (interactionId: string) => Promise<Readonly<Record<string, string>>>;
}
