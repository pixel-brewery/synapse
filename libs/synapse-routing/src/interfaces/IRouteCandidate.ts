// #region Imports

import type { RouteCostClass } from '../models/RouteCostClass.js';
import type { ModelAvailability } from '../models/ModelAvailability.js';

// #endregion

/**
 * One host-authorized execution candidate with open provider and account identities.
 *
 * @public
 */
export interface IRouteCandidate {
    /**
     * Stable candidate identity, unique within its host scope, used for telemetry and native session binding.
     */
    readonly id: string;

    /**
     * Registered runtime instance selected for this candidate.
     */
    readonly instanceId: string;

    /**
     * Account cooldown identity shared by sibling candidates in the same scope.
     */
    readonly accountId: string;

    /**
     * Optional host-defined failure group for provider-wide circuit evidence.
     */
    readonly providerId?: string;

    /**
     * Lower values rank earlier; default 0 with stable input-order ties.
     */
    readonly priority?: number;

    /**
     * Host cost class; default unknown.
     */
    readonly costClass?: RouteCostClass;

    /**
     * Host quality estimate from 0 to 100; default 50.
     */
    readonly qualityScore?: number;

    /**
     * Whether a matching bound native session ranks first; default false.
     */
    readonly sessionAffinity?: boolean;

    /**
     * Provider-native model selected by the host catalog.
     */
    readonly model?: string;

    /**
     * Optional native reasoning setting.
     */
    readonly reasoningEffort?: string;

    /**
     * Optional authoritative account-scoped inspector.
     *
     * @param model - Native model to inspect for this account.
     * @param signal - Bounded operation cancellation.
     * @returns Available, unavailable or unknown evidence; unknown does not block normal inference.
     * @remarks The host owns this callback and its resources. It must observe cancellation and settle after bounded native cleanup; routing awaits that settlement rather than abandoning an unknown process. Inspection must not start login, inference, hooks or MCP sessions.
     */
    readonly inspectModelAvailability?: (
        model: string,
        signal: AbortSignal,
    ) => Promise<ModelAvailability>;
}
