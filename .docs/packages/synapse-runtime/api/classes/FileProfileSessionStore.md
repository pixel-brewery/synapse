# Class: FileProfileSessionStore

Atomic private profile metadata that invalidates native continuations across account or configuration changes and restarts.

## Remarks

Synchronization belongs to the shared profile coordinator; this file is not a cross-process execution lock. Version 1 stores explicit owner identifiers and optional generation/configuration digests, never native credentials or configuration plaintext. Metadata is limited to 8 KiB; canonical configuration hashing accepts at most 1 MiB, 10,000 nodes and 32 levels of JSON data.

## Extends

- [`ProfileSessionStoreBase`](ProfileSessionStoreBase.md)

## Constructors

### Constructor

> **new FileProfileSessionStore**(`_createId?`): `FileProfileSessionStore`

Captures an identifier source without filesystem access.

#### Parameters

##### \_createId?

() => `string`

Distinct bounded generation identifiers; default cryptographic UUIDs.

#### Returns

`FileProfileSessionStore`

#### Overrides

[`ProfileSessionStoreBase`](ProfileSessionStoreBase.md).[`constructor`](ProfileSessionStoreBase.md#constructor)

## Methods

### advance()

> **advance**(`profile`): `Promise`\<`string`\>

Persists a fresh generation before native credential mutation and preserves the configuration binding.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Drained profile exclusively owned by the shared coordinator.

#### Returns

`Promise`\<`string`\>

The new persisted generation, also readable by a restarted runtime.

#### Throws

An AiError for invalid identifiers, unknown state or atomic-write failure.

#### Overrides

[`ProfileSessionStoreBase`](ProfileSessionStoreBase.md).[`advance`](ProfileSessionStoreBase.md#advance)

***

### bind()

> **bind**(`instance`): `Promise`\<`string` \| `undefined`\>

Binds the profile to a canonical SHA-256 digest of its current native configuration.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Driver, executable, JSON configuration, explicit environment and owned profile.

#### Returns

`Promise`\<`string` \| `undefined`\>

Current generation, including undefined for a first or legacy binding.

#### Throws

An AiError for non-JSON/cyclic/oversized configuration, unsupported metadata or persistence failure.

#### Remarks

Object keys are sorted. Profile identity and stable paths are included; temporary paths and the instance identifier are excluded. An existing changed digest advances the generation before the new binding is persisted. This method requires the caller's exclusive profile gate.

#### Overrides

[`ProfileSessionStoreBase`](ProfileSessionStoreBase.md).[`bind`](ProfileSessionStoreBase.md#bind)

***

### read()

> **read**(`profile`): `Promise`\<`string` \| `undefined`\>

Reads bounded versioned metadata while preserving absent legacy state.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Explicit owner and absolute storage root.

#### Returns

`Promise`\<`string` \| `undefined`\>

Current generation, or undefined when no credential/configuration change has been recorded.

#### Throws

An AiError for malformed, foreign, symlinked or unsupported metadata.

#### Overrides

[`ProfileSessionStoreBase`](ProfileSessionStoreBase.md).[`read`](ProfileSessionStoreBase.md#read)
