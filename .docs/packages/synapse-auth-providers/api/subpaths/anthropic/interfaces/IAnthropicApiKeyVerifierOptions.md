# Interface: IAnthropicApiKeyVerifierOptions

Optional Anthropic workspace selection for an API-key authentication probe.

## Remarks

Keys that can select multiple workspaces require a workspace ID. The selected
workspace must match the application's later inference-client configuration. A key already
scoped to one workspace can omit this option. The supplied value is captured at construction.

## Properties

### workspaceId?

> `readonly` `optional` **workspaceId?**: `string`

Optional Anthropic workspace ID sent through the anthropic-workspace-id header.
