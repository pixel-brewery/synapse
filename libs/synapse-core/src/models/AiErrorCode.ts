/**
 * Stable failure categories used for routing, recovery and host translation.
 *
 * @public
 */
export type AiErrorCode =
    | 'configuration'
    | 'unsupported'
    | 'provider'
    | 'auth-required'
    | 'auth-busy'
    | 'quota'
    | 'rate-limit'
    | 'cancelled'
    | 'timeout'
    | 'host'
    | 'persistence'
    | 'protocol'
    | 'result-validation'
    | 'session-unavailable'
    | 'output-limit'
    | 'disposed';
