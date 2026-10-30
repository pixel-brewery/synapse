# Function: snapshotAiInstance()

> **snapshotAiInstance**(`instance`): [`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Detaches an instance's account, paths and configuration from caller-owned mutable objects.

## Parameters

### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Cloneable instance data supplied by the host before an asynchronous operation.

## Returns

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

A detached snapshot with the same readonly contract; intentional host cancellation signals belong to the operation instead.

## Throws

An AiError when instance configuration contains values that cannot be cloned.

## Remarks

Capture one snapshot before selecting a profile gate and pass that same snapshot to the driver. This prevents later host mutations from moving native work to a different account than the one being coordinated.
