# Type Alias: AiTarget

> **AiTarget** = \{ `candidateId?`: `string`; `instanceId`: `string`; \} \| \{ `routeId`: `string`; \}

Explicit instance selection or an injected host-configured route.

## Union Members

### Type Literal

\{ `candidateId?`: `string`; `instanceId`: `string`; \}

#### candidateId?

> `readonly` `optional` **candidateId?**: `string`

Route candidate identity, defaulting to instanceId.

#### instanceId

> `readonly` **instanceId**: `string`

Selected instance identity.

***

### Type Literal

\{ `routeId`: `string`; \}

#### routeId

> `readonly` **routeId**: `string`

Route registered in the injected routing owner.

## Nested type members

### `AiTarget.instanceId`

Selected instance identity.

### `AiTarget.candidateId`

Route candidate identity, defaulting to instanceId.

### `AiTarget.routeId`

Route registered in the injected routing owner.
