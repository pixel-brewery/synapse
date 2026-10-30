// #region Imports

import type { IRoute } from './IRoute.js';
import type { RoutingStoreBase } from '../abstracts/RoutingStoreBase.js';
import type { RouteGovernor } from '../services/RouteGovernor.js';
import type { RouteAdmission } from '../services/RouteAdmission.js';
import type { AccountCooldowns } from '../services/AccountCooldowns.js';
import type { ModelAvailabilityCache } from '../services/ModelAvailabilityCache.js';

// #endregion

/**
 * Explicit host route composition and injected runtime-local routing policies.
 *
 * @public
 */
export interface IAiRouterOptions {
    /**
     * Validated route definitions; no ambient provider/account registration.
     */
    readonly routes: readonly IRoute[];

    /**
     * Injected durable state adapter; default bounded in-memory storage.
     */
    readonly store?: RoutingStoreBase;

    /**
     * Optional shared governor; when supplied it owns its own store and clock.
     */
    readonly governor?: RouteGovernor;

    /**
     * Optional shared runtime-local admission controller.
     */
    readonly admission?: RouteAdmission;

    /**
     * Optional shared account-capacity owner.
     */
    readonly cooldowns?: AccountCooldowns;

    /**
     * Optional shared account/model evidence cache.
     */
    readonly models?: ModelAvailabilityCache;

    /**
     * UTC epoch-millisecond clock for attempt timing; defaults to Date.now.
     *
     * @returns Current UTC epoch milliseconds.
     */
    readonly now?: () => number;
}
