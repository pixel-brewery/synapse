# Interface: IOpenAiApiKeyVerifierOptions

Optional OpenAI organization/project selection for an API-key authentication probe.

## Remarks

These selectors must match the host's later inference-client configuration. They do
not change the fixed OpenAI endpoint, grant permissions or select a model. Construction
captures detached values; subsequent mutations of the supplied object have no effect.

## Properties

### organization?

> `readonly` `optional` **organization?**: `string`

Optional OpenAI organization ID sent through the OpenAI-Organization header.

***

### project?

> `readonly` `optional` **project?**: `string`

Optional OpenAI project ID sent through the OpenAI-Project header.
