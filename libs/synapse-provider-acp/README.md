# @pixel-brewery/synapse-provider-acp

Connect an installed ACP-speaking agent to Synapse through local stdio. The adapter uses the official TypeScript SDK and exposes the same execution, event and session contracts as Synapse's native drivers.

Use it to add a CLI whose ACP mode and permission guarantees you have verified. Your host selects the executable, native arguments, policy-mode mappings and any authentication adapter.

## Installation and requirements

Requires **Node.js 24.15+**, ESM and a compatible installed ACP agent. The package depends on **`@agentclientprotocol/sdk` 2.1.0**. It starts no agent, installer, server or sign-in flow during import or construction.

The initial family version is **0.0.1**, published through public GitHub Packages after release verification. Configure [registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) before installation; native AI sign-in remains separate. Local evaluation can use [verified archives](../../.docs/guides/consumers.md#local-archive-alternative). Install the verified published version with:

```sh
yarn add @pixel-brewery/synapse-provider-acp@0.0.1 @pixel-brewery/synapse-runtime@0.0.1 @pixel-brewery/synapse-auth@0.0.1
```

## Compose an ACP runtime

Set `SYNAPSE_ACP_EXECUTABLE` to your selected installed agent and `SYNAPSE_ACP_READ_ONLY_MODE` to its verified native mode ID. Configure `args` for that agent's stdio ACP entry point. There is no universal ACP CLI flag or universal `plan` mode.

```ts
import { resolve } from 'node:path';
import { ProfileManager } from '@pixel-brewery/synapse-auth';
import { AiRuntime, NodeProcessRunner } from '@pixel-brewery/synapse-runtime';
import { AcpDriver } from '@pixel-brewery/synapse-provider-acp';

const executable = process.env['SYNAPSE_ACP_EXECUTABLE'];
const readOnlyMode = process.env['SYNAPSE_ACP_READ_ONLY_MODE'];
if (!executable || !readOnlyMode) {
    throw new Error('Select an ACP executable and its verified read-only mode.');
}

const driver = new AcpDriver(new NodeProcessRunner(), {
    id: 'my-native-agent',
    args: [], // Set the arguments required by this agent's stdio ACP mode.
    modeIds: { 'read-only': readOnlyMode },
});
const profiles = new ProfileManager({
    rootDirectory: resolve('.local-ai-profiles'),
});
const profile = await profiles.create({
    applicationId: 'meeting-assistant',
    accountId: 'personal',
    driverId: driver.id,
});
const instance = { id: 'acp-personal', driverId: driver.id, profile, executable };
const runtime = new AiRuntime({ drivers: [driver], instances: [instance] });

try {
    const result = await runtime.run({
        target: { instanceId: instance.id },
        prompt: 'Summarize this transcript: We agreed to publish the draft tomorrow.',
        policy: { mode: 'read-only' },
    }).result;

    console.log(result.text);
} finally {
    await runtime.dispose();
}
```

Configure native authentication for this isolated profile before running an account-backed agent. The runtime supplies an owned temporary workspace when `workingDirectory` is omitted; the driver passes that path to the native session. Runtime disposal drains the driver and its runner. Different ACP implementations can use different driver IDs and independent profiles without a central provider registry.

## Capabilities and negotiated limits

| Capability            | Behavior                                                                               |
| --------------------- | -------------------------------------------------------------------------------------- |
| Transport             | Local bounded ACP stdio through the official SDK.                                      |
| Execution policy      | Host-declared native mode mappings, advertised/selected before prompting.              |
| Streaming             | Text chunks, reasoning, bounded tool labels and bound session references.              |
| Resume                | Optional; the agent must negotiate `loadSession` before a stored session is forwarded. |
| Structured results    | Text can be JSON Schema-validated locally by `AiRuntime`; no native schema promise.    |
| Model/effort          | Requires explicit config-option IDs and values advertised by the agent.                |
| Tool permissions      | Denied by default; optional host callback selects an actually offered permission ID.   |
| Portable tool filters | Nonempty tool-name allowlists/denylists are unsupported.                               |
| Token accounting      | No per-turn token usage is fabricated from context-window updates.                     |
| Inspection/auth       | Initialization-only inspection plus an optional independent native auth adapter.       |

`modeIds` must map only modes whose actual native behavior your host trusts. Missing mappings fail before launching a request. The agent must advertise the mapped mode, and an unexpected mode-change update stops the turn. ACP itself does not define a universal filesystem sandbox; a mapping is a host assertion about the selected CLI.

The client advertises no filesystem or terminal capabilities and supplies no MCP servers. The native agent may still have its own built-in tools, controlled by its native modes and permission protocol.

## Permissions and configuration

The optional `IAcpDriverOptions.permission` callback receives a bounded title, kind, session/tool IDs and the agent's offered options. It receives no raw tool input or command output. Return an offered option ID to select it, or `undefined` to deny/cancel. Unknown IDs fail as host errors.

Read-only requests deny the `edit`, `delete`, `execute`, `switch_mode` and `other` kinds, plus requests without a kind, even when the host callback would allow them. With no callback, every permission request is denied. Tool-name lists are not a portable replacement for this protocol; an empty `allowedTools` array is not a deny-all policy.

For selection, set `modelConfigId` and/or `reasoningConfigId` to the agent's advertised session-config IDs. Request values must appear in those options and be confirmed by the native config response before the prompt is sent.

Frames default to **1 MiB**, with a separate **4 MiB** combined process-output limit; both are configurable in `IAcpDriverOptions`. Execution also observes the runtime's deadline, caller cancellation and owned process teardown.

For structured output, request JSON in your prompt and set `outputSchema`. `AiRuntime` validates the resulting text; the host still decodes its application result.

## Authentication and session ownership

ACP exposes no general non-mutating authenticated-account check. Without an injected `auth` adapter, inspection reports that account verification is unavailable. A successful protocol handshake does not establish an authenticated subscription.

Supply a verified `AiAuthDriverBase` through `IAcpDriverOptions.auth` when native login/status/logout are needed. Its credential locations must match the same isolated profile used by this driver. Then compose `AuthManager` with **`runtime.access`** and use only methods that native adapter advertises. Synapse provides no ACP-wide login methods or token broker. See [explicit authentication](../../.docs/guides/consumers.md#explicit-authentication).

Persist the complete session reference from events or `result.session` and submit it as `session` on the next run. Driver, instance, profile, candidate and authentication generation stay bound together. A provider change cannot reuse an unrelated native session ID. See [persisted sessions](../../.docs/guides/consumers.md#persisted-sessions) and the core string-storage codec.

## Compatibility and verification

This package characterizes **SDK 2.1.0 and a synthetic ACP agent transport**, not every ACP implementation. Tests exercise fragmented SDK messages, negotiated modes, session-loading checks, denied write permissions, native exit behavior, critical host callback failures and owned shutdown.

Local checks have run on **macOS with Node.js 24**. The repository's Node 24 CI matrix targets macOS, Linux and native Windows; configured jobs do not establish a completed remote matrix run. Live compatibility, native authentication and mode guarantees must be verified for each chosen executable/version.

## Documentation and license

- [Consumer guide](../../.docs/guides/consumers.md)
- [Generated provider API](../../.docs/packages/synapse-provider-acp/api/index.md)
- [Authentication API](../../.docs/packages/synapse-auth/api/index.md)
- [Runtime API](../../.docs/packages/synapse-runtime/api/index.md)
- [Official ACP TypeScript SDK](https://agentclientprotocol.com/libraries/typescript)

MIT. The public API is documented through TSDoc and the generated package reference.
