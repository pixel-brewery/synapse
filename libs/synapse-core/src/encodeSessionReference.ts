// #region Imports

import type { IAiSessionReference } from './interfaces/IAiSessionReference.js';
import { validateSessionReference } from './validateSessionReference.js';

// #endregion

/**
 * Encodes the complete binding and authentication generation into an opaque host storage field.
 *
 * @param reference - Runtime-created session reference, including its original generation.
 * @returns Versioned continuation text; native CLIs receive only its decoded nativeId.
 * @throws An AiError when the reference is malformed.
 * @remarks Hosts must preserve the entire reference instead of rebinding an old native ID to current credentials.
 *
 * @public
 */
export function encodeSessionReference(reference: IAiSessionReference): string {
    return 'synapse-session:v1:' + JSON.stringify(validateSessionReference(reference));
}
