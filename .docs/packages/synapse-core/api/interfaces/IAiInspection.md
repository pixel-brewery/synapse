# Interface: IAiInspection

Explicit bounded provider/account/model metadata inspection.

## Properties

### auth

> `readonly` **auth**: [`IAiAuthStatus`](IAiAuthStatus.md)

Verified account state.

***

### limits?

> `readonly` `optional` **limits?**: readonly [`IAiLimit`](IAiLimit.md)[]

Optional account/model usage limits and reset instants.

***

### models?

> `readonly` `optional` **models?**: readonly [`IAiModel`](IAiModel.md)[]

Provider-advertised models; the consumer owns eligibility and catalog policy.
