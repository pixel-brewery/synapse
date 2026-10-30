# Real contracts and controlled transport testing pattern

Keep `ProductionFile.spec.ts` beside the exact production owner, use Vitest and mark Arrange, Act and Assert explicitly. Exercise the real runtime/auth/routing owner and replace only the external driver or process transport boundary. Regular tests need no personal provider accounts.

This independent fixture uses the published testing adapter with a real runtime and owned profile paths:

```typescript
// #region Imports

import { ProfileManager } from '@pixel-brewery/synapse-auth';
import { AiRuntime } from '@pixel-brewery/synapse-runtime';
import { SimulatedDriver } from '@pixel-brewery/synapse-testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// #endregion

it('completes without requiring event consumption', async () => {
    // Arrange
    const root = await mkdtemp(join(tmpdir(), 'synapse-consumer-test-'));
    const driver = new SimulatedDriver({ result: { text: 'Explicit fixture response.' } });
    const profile = await new ProfileManager({ rootDirectory: root }).create({
        applicationId: 'consumer-test',
        accountId: 'fixture',
        driverId: driver.id,
        paths: { temporary: join(root, 'temporary') },
    });
    const runtime = new AiRuntime({
        drivers: [driver],
        instances: [{ id: 'fixture', driverId: driver.id, profile }],
    });

    try {
        // Act
        const result = await runtime.run({
            target: { instanceId: 'fixture' },
            prompt: 'A synthetic test request.',
            policy: { mode: 'read-only' },
        }).result;

        // Assert
        expect(result.text).toBe('Explicit fixture response.');
        expect(driver.executionCount).toBe(1);
    } finally {
        try {
            await runtime.dispose();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }
});
```

Use `ReplayProcessRunner` with provenance-labeled native frames to test a real decoder. Distinguish actual sanitized CLI captures from synthetic protocol shapes. Test fragmented output, result validation, session ownership, bounded streams, abort/dispose, auth races and persistence failures at their actual owners.

Actual login/inference and native Windows evidence come from explicitly started integration checks on those environments. See [native verification](../guides/native-verification.md); an account-free fixture does not establish those results.
