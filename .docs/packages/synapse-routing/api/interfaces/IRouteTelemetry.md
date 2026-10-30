# Interface: IRouteTelemetry

Versioned per-candidate or shared-provider operational history.

## Properties

### attemptCount

> `readonly` **attemptCount**: `number`

Attempt reservations admitted for native execution; a pre-launch host failure may stop a reservation.

***

### averageLatencyMilliseconds?

> `readonly` `optional` **averageLatencyMilliseconds?**: `number`

Mean duration of completed native attempts.

***

### circuitOpenUntil?

> `readonly` `optional` **circuitOpenUntil?**: `number`

UTC epoch milliseconds until this circuit may be retried.

***

### consecutiveFailures

> `readonly` **consecutiveFailures**: `number`

Consecutive provider failures since last success.

***

### failureCount

> `readonly` **failureCount**: `number`

Completed provider failures, excluding cancellation and host failures.

***

### id

> `readonly` **id**: `string`

Candidate ID or explicit provider failure-group ID.

***

### kind

> `readonly` **kind**: `"candidate"` \| `"provider"`

Separate namespaces prevent candidate/provider identifier collisions.

***

### lastAttemptAt?

> `readonly` `optional` **lastAttemptAt?**: `number`

UTC epoch milliseconds of latest attempt.

***

### lastFailureAt?

> `readonly` `optional` **lastFailureAt?**: `number`

UTC epoch milliseconds of latest provider failure.

***

### lastSuccessAt?

> `readonly` `optional` **lastSuccessAt?**: `number`

UTC epoch milliseconds of latest success.

***

### schemaVersion

> `readonly` **schemaVersion**: `1`

Persisted schema version; unsupported versions fail without overwriting data.

***

### scopeId

> `readonly` **scopeId**: `string`

Host-defined routing namespace.

***

### successCount

> `readonly` **successCount**: `number`

Completed successful attempts.
