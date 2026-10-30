// #region Imports

import type { IAiInstance, IAiPolicy } from '@pixel-brewery/synapse-core';
import { AiError } from '@pixel-brewery/synapse-core';
import { createProfileEnvironment } from '@pixel-brewery/synapse-runtime';
import { join } from 'node:path';
import { openCodeConfiguration } from './openCodeConfiguration.js';

// #endregion

/**
 * Creates an isolated native environment with explicit, noninteractive execution permissions.
 *
 * @param instance - Selected profile and explicit credential environment.
 * @param policy - Optional execution policy; inspection and login use no agent policy.
 * @param selectedModel - Request model, when it overrides instance configuration.
 * @returns Allowlisted process environment with application-owned OpenCode storage.
 * @throws An AiError when a requested native permission cannot be enforced.
 *
 * @internal
 */
export async function openCodeEnvironment(
    instance: IAiInstance,
    policy?: IAiPolicy,
    selectedModel?: string,
): Promise<Readonly<Record<string, string>>> {
    const config = openCodeConfiguration(instance);
    const permission: Record<string, unknown> = {
        '*': policy?.allowedTools?.length ? 'deny' : 'allow',
    };

    for (const tool of [...(policy?.allowedTools ?? []), ...(policy?.deniedTools ?? [])]) {
        if (!/^[a-z][a-z0-9_]*$/u.test(tool))
            throw new AiError(
                'unsupported',
                'OpenCode tool permissions require native permission names.',
            );
    }

    for (const tool of policy?.allowedTools ?? []) permission[tool] = 'allow';

    for (const tool of policy?.deniedTools ?? []) permission[tool] = 'deny';

    permission['external_directory'] = 'deny';
    permission['task'] = 'deny';

    if (policy?.mode === 'read-only') {
        permission['bash'] = 'deny';
        permission['edit'] = 'deny';
    } else if (policy && permission['bash'] !== 'deny')
        permission['bash'] = {
            '*':
                policy.allowedTools?.length && !policy.allowedTools.includes('bash')
                    ? 'deny'
                    : 'allow',
            ...Object.fromEntries(
                (config.deniedCommands ?? []).map((command) => [command, 'deny']),
            ),
        };

    const model = selectedModel ?? config.model;
    const gatewayModel =
        config.gateway && model?.startsWith(`${config.gateway.providerId}/`)
            ? model.slice(config.gateway.providerId.length + 1)
            : undefined;
    const runtimeConfig = {
        $schema: 'https://opencode.ai/config.json',
        autoupdate: false,
        share: 'disabled',
        snapshot: false,
        subagent_depth: 0,
        ...(policy ? { permission } : {}),
        ...(config.gateway
            ? {
                  provider: {
                      [config.gateway.providerId]: {
                          npm: '@ai-sdk/openai-compatible',
                          name: config.gateway.displayName,
                          options: {
                              baseURL: config.gateway.baseUrl,
                              ...(config.gateway.credentialEnvironmentName
                                  ? { apiKey: `{env:${config.gateway.credentialEnvironmentName}}` }
                                  : {}),
                          },
                          ...(gatewayModel
                              ? { models: { [gatewayModel]: { name: gatewayModel } } }
                              : {}),
                      },
                  },
              }
            : {}),
    };

    return createProfileEnvironment(instance, {
        XDG_DATA_HOME: join(instance.profile.paths.home, '.local', 'share'),
        XDG_CONFIG_HOME: join(instance.profile.paths.home, '.config'),
        XDG_CACHE_HOME: join(instance.profile.paths.home, '.cache'),
        XDG_STATE_HOME: join(instance.profile.paths.home, '.local', 'state'),
        OPENCODE_CONFIG: '',
        OPENCODE_CONFIG_DIR: instance.profile.paths.configuration,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(runtimeConfig),
        OPENCODE_PERMISSION: JSON.stringify(policy ? permission : { '*': 'deny' }),
        OPENCODE_DISABLE_AUTOUPDATE: 'true',
        OPENCODE_DISABLE_CLAUDE_CODE: 'true',
        OPENCODE_DISABLE_PROJECT_CONFIG: 'true',
    });
}
