# Function: parseSessionReference()

> **parseSessionReference**(`value`): [`IAiSessionReference`](../interfaces/IAiSessionReference.md) \| `undefined`

Decodes a stored binding without stamping current credentials onto legacy native IDs.

## Parameters

### value

`string`

Opaque host continuation text, possibly a pre-Synapse native ID.

## Returns

[`IAiSessionReference`](../interfaces/IAiSessionReference.md) \| `undefined`

Complete original binding, or undefined for a non-versioned legacy native ID.

## Throws

An AiError for malformed references or unsupported newer versions.

## Remarks

Unknown versions fail as configuration errors so a downgraded host does not silently clear newer state.
