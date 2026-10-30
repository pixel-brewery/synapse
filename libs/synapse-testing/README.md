# @pixel-brewery/synapse-testing

Exercise real Synapse runtime and provider code without personal AI accounts. `SimulatedDriver` supplies explicitly synthetic normalized behavior; `ReplayProcessRunner` replaces the external subprocess boundary while real adapters parse their native protocol.

**Initial family version 0.0.1:** install the published package from public GitHub Packages after release verification. [Registry authentication](../../.docs/guides/consumers.md#install-from-github-packages) is required; source-repository access is separate. Requires Node.js 24.15.0 or later and native ESM. Testing depends on Core and Runtime, with no concrete provider dependency.

## Replay a fragmented process response

This script starts no operating-system process:

```ts
import { ReplayProcessRunner } from '@pixel-brewery/synapse-testing';

const runner = new ReplayProcessRunner([
    {
        executable: 'fixture-cli',
        args: ['--json'],
        stdout: ['{"text":"syn', 'thetic"}\n'],
    },
]);
const chunks: string[] = [];

try {
    const result = await runner.run({
        executable: 'fixture-cli',
        args: ['--json'],
        workingDirectory: process.cwd(),
        environment: {},
        onStdout: (chunk) => {
            chunks.push(chunk);
        },
    });
    console.log(JSON.parse(result.stdout), chunks.length, runner.executionCount);
} finally {
    await runner.dispose();
}
```

Inject this runner into a selected provider driver to test its actual parsing, argument construction and normalization. Each replay step represents one native invocation; optional expected executables and argument vectors reject mismatches. Output budgets, cancellation, callback failures and awaited disposal still apply. Fragment boundaries are preserved within each stream; stdout fragments are delivered before stderr fragments.

Use fixture-only profiles: a real driver's profile preparation and the real runtime's persistence still execute. The replay does not verify OS process-tree cleanup, native executable resolution or a live provider's current behavior. `onInput` is an explicit opt-in observer for tests that must inspect stdin; it may receive credentials or prompts. The runner retains invocation counts rather than input history.

## Simulate normalized results

For runtime/schema tests, compose `new SimulatedDriver({ result: { text: 'Synthetic fixture' } })` with `AiRuntime`. It can emit supplied normalized events or call a supplied result function, and exposes `executionCount` for assertions. A simulation performs no inference and must be labeled as such; it is never an automatic fallback for a failing native provider.

The [standalone meeting-text example](../../.docs/guides/consumers.md#independent-meeting-text-example) shows complete simulation/runtime/schema composition. Mark every protocol fixture as synthetic or a sanitized recording, including its CLI/protocol version and provenance. Keep personal credentials, private prompts and account metadata out of fixtures.

See the [consumer guide](../../.docs/guides/consumers.md) and [generated API reference](../../.docs/packages/synapse-testing/api/index.md).
