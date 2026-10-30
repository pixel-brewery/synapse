# Interface: ICodexInspection

Generic inspection plus safe native usage details used by existing desktop consumers.

## Extends

- [`IAiInspection`](../../../synapse-core/api/interfaces/IAiInspection.md)

## Properties

### auth

> `readonly` **auth**: [`IAiAuthStatus`](../../../synapse-core/api/interfaces/IAiAuthStatus.md)

Verified account state.

#### Inherited from

`IAiInspection.auth`

***

### limits?

> `readonly` `optional` **limits?**: readonly [`IAiLimit`](../../../synapse-core/api/interfaces/IAiLimit.md)[]

Optional account/model usage limits and reset instants.

#### Inherited from

`IAiInspection.limits`

***

### metadataWarnings?

> `readonly` `optional` **metadataWarnings?**: readonly (`"rate-limits-unavailable"` \| `"usage-unavailable"`)[]

Safe optional-metadata degradation categories; raw RPC errors never cross this boundary.

***

### models?

> `readonly` `optional` **models?**: readonly [`IAiModel`](../../../synapse-core/api/interfaces/IAiModel.md)[]

Provider-advertised models; the consumer owns eligibility and catalog policy.

#### Inherited from

`IAiInspection.models`

***

### usage?

> `readonly` `optional` **usage?**: [`ICodexAccountUsage`](ICodexAccountUsage.md)

Optional native account/subscription usage details.
