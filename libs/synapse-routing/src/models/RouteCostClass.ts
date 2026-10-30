/**
 * Host-supplied relative cost classification; Synapse never owns a model catalog.
 *
 * @public
 */
export type RouteCostClass = 'local' | 'free-tier' | 'subscription-included' | 'unknown' | 'paid';
