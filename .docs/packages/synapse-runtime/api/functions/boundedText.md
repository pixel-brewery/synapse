# Function: boundedText()

> **boundedText**(`value`, `maxCharacters?`): `string`

Redacts common credential shapes and bounds a normalized progress message.

## Parameters

### value

`string`

Untrusted human-readable progress text, never a raw credentials object.

### maxCharacters?

`number` = `64_000`

Maximum retained characters, default 64000.

## Returns

`string`

Redacted and bounded text, with a truncation marker if needed.

## Remarks

This projection supplements explicit safe-field selection; it is not a general secret detector.
