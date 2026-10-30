// #region Imports

import { AiError, type IAiExecutionContext } from '@pixel-brewery/synapse-core';

// #endregion

/**
 * Builds safe-mode native print arguments; the actual prompt remains on stdin.
 *
 * @param context - Authorized execution policy, native model and bound continuation.
 * @returns A native argument vector with actual tool filtering and native structured output.
 * @throws An AiError for invalid tool patterns, model or reasoning options.
 * @remarks Safe mode retains native subscription auth while disabling ambient hooks, skills and plugins. Bare mode is intentionally excluded because it disables OAuth.
 *
 * @public
 */
export function claudeExecutionArguments(context: IAiExecutionContext): readonly string[] {
    const request = context.request;

    for (const value of [request.model, request.session?.nativeId])
        if (
            value !== undefined &&
            (!value || value.length > 512 || value.startsWith('-') || /[\r\n\0]/u.test(value))
        )
            throw new AiError('configuration', 'Claude model or session selection is invalid.');

    if (
        request.reasoningEffort &&
        !['low', 'medium', 'high', 'xhigh', 'max'].includes(request.reasoningEffort)
    )
        throw new AiError('configuration', 'Claude reasoning effort is unsupported.');

    const allowed = request.policy.allowedTools;
    const denied = request.policy.deniedTools ?? [];

    if ((allowed?.length ?? 0) > 256 || denied.length > 256)
        throw new AiError('output-limit', 'Claude tool filtering exceeds the supported bound.');

    for (const tool of [...(allowed ?? []), ...denied])
        if (!tool || tool.length > 512 || /[\r\n\0]/u.test(tool) || tool.startsWith('-'))
            throw new AiError(
                'configuration',
                'Claude tool filtering contains an invalid pattern.',
            );

    const names = allowed
        ?.map((tool) => tool.split('(')[0]!)
        .filter((name) => /^[A-Za-z][A-Za-z0-9_.:-]*$/u.test(name));

    if (allowed && names?.length !== allowed.length)
        throw new AiError('unsupported', 'Claude cannot enforce this tool allowlist.');

    if (
        request.policy.mode === 'read-only' &&
        names?.some(
            (name) => !['Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch'].includes(name),
        )
    )
        throw new AiError(
            'unsupported',
            'The Claude tool allowlist conflicts with read-only execution.',
        );

    return [
        '--safe-mode',
        '--print',
        '--input-format',
        'text',
        '--output-format',
        'stream-json',
        '--verbose',
        '--setting-sources',
        'user',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--disable-slash-commands',
        '--permission-mode',
        request.policy.mode === 'read-only' ? 'plan' : 'acceptEdits',
        ...(allowed
            ? [
                  '--tools',
                  [...new Set(names)].join(','),
                  ...(allowed.length ? ['--allowedTools', allowed.join(',')] : []),
              ]
            : request.policy.mode === 'workspace-write'
              ? ['--allowedTools', 'Bash', 'WebFetch', 'WebSearch']
              : []),
        ...(denied.length ? ['--disallowedTools', denied.join(',')] : []),
        ...(request.model ? ['--model', request.model] : []),
        ...(request.reasoningEffort ? ['--effort', request.reasoningEffort] : []),
        ...(request.session ? ['--resume', request.session.nativeId] : []),
        ...(request.outputSchema ? ['--json-schema', JSON.stringify(request.outputSchema)] : []),
    ];
}
