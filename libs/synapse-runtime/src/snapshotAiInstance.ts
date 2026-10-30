// #region Imports

import { AiError, type IAiInstance } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Detaches an instance's account, paths and configuration from caller-owned mutable objects.
 *
 * @param instance - Cloneable instance data supplied by the host before an asynchronous operation.
 * @returns A detached snapshot with the same readonly contract; intentional host cancellation signals belong to the operation instead.
 * @throws An AiError when instance configuration contains values that cannot be cloned.
 * @remarks Capture one snapshot before selecting a profile gate and pass that same snapshot to the driver. This prevents later host mutations from moving native work to a different account than the one being coordinated.
 *
 * @public
 */
export function snapshotAiInstance(instance: IAiInstance): IAiInstance {
    try {
        return structuredClone(instance);
    } catch (cause) {
        throw new AiError(
            'configuration',
            'Instance configuration must be cloneable immutable data.',
            { cause },
        );
    }
}
