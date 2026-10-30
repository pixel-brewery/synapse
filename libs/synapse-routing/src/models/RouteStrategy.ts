/**
 * Deterministic selection strategies extracted from Symphony's routing governor.
 *
 * @public
 */
export type RouteStrategy =
    | 'priority'
    | 'quality-first'
    | 'last-known-good'
    | 'lowest-cost'
    | 'lowest-latency'
    | 'most-reliable'
    | 'least-used'
    | 'reset-aware'
    | 'balanced';
