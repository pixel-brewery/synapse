# Function: isCleanupIncomplete()

> **isCleanupIncomplete**(`value`): `boolean`

Recognizes an explicitly unconfirmed process-cleanup failure through bounded Error causes and aggregates.

## Parameters

### value

`unknown`

Native, runtime or host error whose ownership outcome is being assessed.

## Returns

`boolean`

Whether one of at most sixteen inspected Error nodes carries cleanupIncomplete=true.

## Remarks

Cycles and untyped non-Error values stop traversal. A true result must block new work and credential mutations for the affected profile until the host confirms owned processes have stopped.
