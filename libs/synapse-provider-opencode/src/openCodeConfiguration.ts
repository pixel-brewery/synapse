// #region Imports

import { AiError, type IAiInstance } from '@pixel-brewery/synapse-core';
import type { IOpenCodeConfiguration } from './interfaces/IOpenCodeConfiguration.js';

// #endregion

/**
 * Validates native settings without reading configuration or credentials from ambient files.
 *
 * @param instance - Host-selected profile and driver settings.
 * @returns A validated copy of supported native options.
 * @throws An AiError when native configuration is malformed.
 *
 * @internal
 */
export function openCodeConfiguration(instance: IAiInstance): IOpenCodeConfiguration {
    const value = instance.configuration ?? {};

    for (const name of ['providerId', 'authMethod', 'model', 'variant']) {
        if (value[name] !== undefined && (typeof value[name] !== 'string' || !value[name].trim())) {
            throw new AiError('configuration', `OpenCode ${name} must be a nonempty string.`);
        }
    }

    const commands = value['deniedCommands'];

    if (
        commands !== undefined &&
        (!Array.isArray(commands) ||
            !commands.every((item) => typeof item === 'string' && item.trim()))
    ) {
        throw new AiError(
            'configuration',
            'OpenCode deniedCommands must contain native permission patterns.',
        );
    }

    const gateway = value['gateway'];

    if (gateway !== undefined) {
        if (
            !record(gateway) ||
            typeof gateway['providerId'] !== 'string' ||
            typeof gateway['displayName'] !== 'string' ||
            typeof gateway['baseUrl'] !== 'string' ||
            (gateway['credentialEnvironmentName'] !== undefined &&
                typeof gateway['credentialEnvironmentName'] !== 'string')
        ) {
            throw new AiError('configuration', 'OpenCode gateway settings are incomplete.');
        }

        let endpoint: URL;

        try {
            endpoint = new URL(gateway['baseUrl']);
        } catch {
            throw new AiError('configuration', 'OpenCode gateway endpoint is invalid.');
        }

        if (
            !['http:', 'https:'].includes(endpoint.protocol) ||
            endpoint.username ||
            endpoint.password ||
            !/^[A-Za-z0-9_-]+$/u.test(gateway['providerId']) ||
            (typeof gateway['credentialEnvironmentName'] === 'string' &&
                !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(gateway['credentialEnvironmentName']))
        ) {
            throw new AiError(
                'configuration',
                'OpenCode gateway endpoint or identifiers are invalid.',
            );
        }

        return {
            ...strings(value),
            ...(Array.isArray(commands)
                ? {
                      deniedCommands: commands.filter(
                          (item): item is string => typeof item === 'string',
                      ),
                  }
                : {}),
            gateway: {
                providerId: gateway['providerId'],
                displayName: gateway['displayName'],
                baseUrl: endpoint.toString(),
                ...(typeof gateway['credentialEnvironmentName'] === 'string'
                    ? { credentialEnvironmentName: gateway['credentialEnvironmentName'] }
                    : {}),
            },
        };
    }

    return {
        ...strings(value),
        ...(Array.isArray(commands)
            ? {
                  deniedCommands: commands.filter(
                      (item): item is string => typeof item === 'string',
                  ),
              }
            : {}),
    };
}

function strings(
    value: Readonly<Record<string, unknown>>,
): Pick<IOpenCodeConfiguration, 'providerId' | 'authMethod' | 'model' | 'variant'> {
    return {
        ...(typeof value['providerId'] === 'string' ? { providerId: value['providerId'] } : {}),
        ...(typeof value['authMethod'] === 'string' ? { authMethod: value['authMethod'] } : {}),
        ...(typeof value['model'] === 'string' ? { model: value['model'] } : {}),
        ...(typeof value['variant'] === 'string' ? { variant: value['variant'] } : {}),
    };
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
