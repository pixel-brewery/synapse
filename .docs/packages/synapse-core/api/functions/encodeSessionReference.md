# Function: encodeSessionReference()

> **encodeSessionReference**(`reference`): `string`

Encodes the complete binding and authentication generation into an opaque host storage field.

## Parameters

### reference

[`IAiSessionReference`](../interfaces/IAiSessionReference.md)

Runtime-created session reference, including its original generation.

## Returns

`string`

Versioned continuation text; native CLIs receive only its decoded nativeId.

## Throws

An AiError when the reference is malformed.

## Remarks

Hosts must preserve the entire reference instead of rebinding an old native ID to current credentials.
