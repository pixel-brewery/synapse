# Interface: IAiModel

Safe provider metadata, distinct from consumer model-catalog policy.

## Properties

### defaultReasoningEffort?

> `readonly` `optional` **defaultReasoningEffort?**: `string`

Provider-advertised default reasoning setting, if known.

***

### description?

> `readonly` `optional` **description?**: `string`

Provider-supplied model description, without consumer catalog policy.

***

### id

> `readonly` **id**: `string`

Provider-native model identifier.

***

### isDefault?

> `readonly` `optional` **isDefault?**: `boolean`

Whether the provider advertises this as its native default.

***

### name?

> `readonly` `optional` **name?**: `string`

Optional provider-supplied display name.

***

### reasoningDescriptions?

> `readonly` `optional` **reasoningDescriptions?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Safe explanations keyed by the advertised native reasoning setting.

***

### reasoningEfforts?

> `readonly` `optional` **reasoningEfforts?**: readonly `string`[]

Advertised native reasoning settings, if known.
