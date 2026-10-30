// #region Imports

import { AiError, type IAiExecutionContext } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Builds native exec arguments while neutralizing ambient hooks, plugins and MCP configuration.
 *
 * @param context - Authorized execution, selected model and bound native continuation.
 * @param projectServers - Target-project MCP names which must remain disabled.
 * @param schemaFile - Private native JSON Schema file when structured output was requested.
 * @returns An argument vector with the prompt read from stdin.
 * @throws An AiError for unsupported explicit tool filtering or invalid reasoning settings.
 *
 * @public
 */
export function codexExecutionArguments(
    context: IAiExecutionContext,
    projectServers: readonly string[],
    schemaFile?: string,
): readonly string[] {
    const request = context.request;

    for (const value of [request.model, request.session?.nativeId])
        if (
            value !== undefined &&
            (!value || value.length > 512 || value.startsWith('-') || /[\r\n\0]/u.test(value))
        )
            throw new AiError('configuration', 'Codex model or session selection is invalid.');

    if (request.policy.allowedTools !== undefined || Boolean(request.policy.deniedTools?.length))
        throw new AiError(
            'unsupported',
            'Codex exec cannot enforce the requested per-tool filter.',
        );

    if (request.reasoningEffort && !/^[a-z][a-z0-9_-]{0,63}$/u.test(request.reasoningEffort))
        throw new AiError('configuration', 'Codex reasoning effort is invalid.');

    const settings = [
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        ...(request.model ? ['--model', request.model] : []),
        ...(request.reasoningEffort
            ? ['--config', `model_reasoning_effort=${JSON.stringify(request.reasoningEffort)}`]
            : []),
        '--config',
        `sandbox_mode=${JSON.stringify(request.policy.mode)}`,
        ...[
            'model_provider="openai"',
            'notify=[]',
            'apps._default.enabled=false',
            'bundled_skills.enabled=false',
            'features.apps=false',
            'features.browser_use=false',
            'features.browser_use_external=false',
            'features.browser_use_full_cdp_access=false',
            'features.computer_use=false',
            'features.hooks=false',
            'features.multi_agent=false',
            'features.plugins=false',
        ].flatMap((value) => ['--config', value]),
        ...projectServers.flatMap((name) => [
            '--config',
            `mcp_servers.${/^[A-Za-z0-9_-]+$/u.test(name) ? name : JSON.stringify(name)}={enabled=false,command="synapse-disabled-mcp"}`,
        ]),
        ...(schemaFile ? ['--output-schema', schemaFile] : []),
    ];

    return request.session
        ? ['exec', 'resume', '--json', ...settings, request.session.nativeId, '-']
        : [
              'exec',
              '--json',
              ...settings,
              '--sandbox',
              request.policy.mode,
              '-C',
              context.workingDirectory,
              '-',
          ];
}
