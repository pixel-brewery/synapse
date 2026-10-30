# Abstract Class: ProfileSessionStoreBase

Persistent authentication-generation boundary, independent of native provider credentials.

## Extended by

- [`FileProfileSessionStore`](FileProfileSessionStore.md)

## Constructors

### Constructor

> **new ProfileSessionStoreBase**(): `ProfileSessionStoreBase`

#### Returns

`ProfileSessionStoreBase`

## Methods

### advance()

> `abstract` **advance**(`profile`): `Promise`\<`string`\>

Advances the generation after execution drains and before credentials change.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Explicit profile exclusively owned by the caller.

#### Returns

`Promise`\<`string`\>

Newly persisted generation, distinct from the previous one.

#### Throws

An AiError on invalid/unknown state or persistence failure; native mutation must not proceed.

***

### bind()

> `abstract` **bind**(`instance`): `Promise`\<`string` \| `undefined`\>

Binds native continuations to the current driver, configuration, environment and stable profile paths.

#### Parameters

##### instance

[`IAiInstance`](../../../synapse-core/api/interfaces/IAiInstance.md)

Explicit instance whose profile the caller exclusively owns.

#### Returns

`Promise`\<`string` \| `undefined`\>

Current generation; the first binding preserves an absent legacy generation.

#### Throws

An AiError on unsupported or oversized configuration, unknown persisted versions or persistence failure.

#### Remarks

Changing an existing configuration binding advances the generation before native execution. Implementations must not persist configuration or environment plaintext. Temporary execution directories do not affect this binding.

***

### read()

> `abstract` **read**(`profile`): `Promise`\<`string` \| `undefined`\>

Reads the current generation without creating or resetting missing/unknown state.

#### Parameters

##### profile

[`IAiProfile`](../../../synapse-core/api/interfaces/IAiProfile.md)

Explicit application/account profile.

#### Returns

`Promise`\<`string` \| `undefined`\>

Persisted generation, or undefined before its first credential or configuration transition.

#### Throws

An AiError when existing state is malformed, belongs to another profile or cannot be read.
