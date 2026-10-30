// #region Imports

import { describe, expect, it } from 'vitest';
import { snapshotAiInstance } from './snapshotAiInstance.js';

// #endregion

function instance() {
    return {
        id: 'instance-a',
        driverId: 'fixture',
        profile: {
            id: 'profile-a',
            applicationId: 'application-a',
            accountId: 'account-a',
            paths: {
                root: '/fixture/a',
                home: '/fixture/a/home',
                configuration: '/fixture/a/configuration',
                credentials: '/fixture/a/credentials',
                execution: '/fixture/a/execution',
                temporary: '/fixture/a/temporary',
            },
        },
        environment: { ACCOUNT: 'a' },
        configuration: { selected: { model: 'model-a' } },
    };
}

describe('snapshotAiInstance', () => {
    it('keeps account ownership and nested native configuration detached from later host mutations', () => {
        // Arrange
        const original = instance();
        const selected = snapshotAiInstance(original);

        // Act
        original.id = 'instance-b';
        original.profile.id = 'profile-b';
        original.profile.paths.credentials = '/fixture/b/credentials';
        original.environment.ACCOUNT = 'b';
        original.configuration.selected.model = 'model-b';

        // Assert
        expect(selected).toEqual(instance());
        expect(selected.profile).not.toBe(original.profile);
        expect(selected.profile.paths).not.toBe(original.profile.paths);
        expect(selected.environment).not.toBe(original.environment);
        expect(selected.configuration).not.toBe(original.configuration);
    });

    it('rejects noncloneable driver configuration before an operation can select a different gate', () => {
        // Arrange
        const original = { ...instance(), configuration: { callback: () => undefined } };

        // Act / Assert
        expect(() => snapshotAiInstance(original)).toThrowError(
            expect.objectContaining({ code: 'configuration' }),
        );
    });
});
