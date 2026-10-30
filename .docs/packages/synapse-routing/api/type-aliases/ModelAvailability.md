# Type Alias: ModelAvailability

> **ModelAvailability** = \{ `state`: `"available"`; \} \| \{ `reason?`: `string`; `state`: `"unavailable"`; \} \| \{ `reason?`: `string`; `state`: `"unknown"`; \}

Account-scoped evidence, with unknown intentionally distinct from unavailable.

## Union Members

### Type Literal

\{ `state`: `"available"`; \}

#### state

> `readonly` **state**: `"available"`

Positive account-scoped evidence or no explicit model requested.

***

### Type Literal

\{ `reason?`: `string`; `state`: `"unavailable"`; \}

#### reason?

> `readonly` `optional` **reason?**: `string`

Safe explanation, never raw credentials.

#### state

> `readonly` **state**: `"unavailable"`

Authoritative negative account/model evidence.

***

### Type Literal

\{ `reason?`: `string`; `state`: `"unknown"`; \}

#### reason?

> `readonly` `optional` **reason?**: `string`

Safe inspection limitation.

#### state

> `readonly` **state**: `"unknown"`

No authoritative evidence; routing fails open to normal execution.

## Nested type members

### `ModelAvailability[state="available"].state`

Positive account-scoped evidence or no explicit model requested.

### `ModelAvailability[state="unavailable"].state`

Authoritative negative account/model evidence.

### `ModelAvailability[state="unavailable"].reason`

Safe explanation, never raw credentials.

### `ModelAvailability[state="unknown"].state`

No authoritative evidence; routing fails open to normal execution.

### `ModelAvailability[state="unknown"].reason`

Safe inspection limitation.
