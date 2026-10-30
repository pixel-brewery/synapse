# Interface: ICodexAccountUsage

Safe native Codex account metadata retained for host integrations.

## Properties

### credits?

> `readonly` `optional` **credits?**: [`ICodexCredits`](ICodexCredits.md)

Optional native account-credit information.

***

### planType?

> `readonly` `optional` **planType?**: `string`

Native account/subscription plan name when reported.

***

### tokenUsage?

> `readonly` `optional` **tokenUsage?**: [`ICodexTokenUsage`](ICodexTokenUsage.md)

Optional native account usage statistics.

***

### windows

> `readonly` **windows**: readonly [`ICodexUsageWindow`](ICodexUsageWindow.md)[]

Native primary and secondary capacity windows.
