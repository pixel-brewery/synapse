type PatternExampleOptions = {
    readonly modelName?: string;
    readonly fields?: readonly string[];
    readonly entityName?: string;
    readonly responseName?: string;
    readonly moduleName?: string;
    readonly bases?: readonly string[];
};

/**
 * Formats optional example context using real Synapse seams and safely quoted caller data.
 *
 * @param pattern - Documentation concept; the compatible tool name does not add a runtime feature.
 * @param options - Validated optional naming, projection and abstract-seam context.
 * @returns Inert Markdown examples, or an empty string when the required example context is absent.
 * @remarks No example is evaluated, compiled, written to a checkout or passed to an AI provider.
 *
 * @internal
 */
export function createPatternExample(
    pattern: 'query' | 'repository' | 'mapping' | 'module',
    options: PatternExampleOptions,
): string {
    const fields = [...new Set(options.fields ?? [])];

    switch (pattern) {
        case 'query': {
            if (!options.modelName || !fields.length) return '';

            const schema = {
                type: 'object',
                additionalProperties: false,
                required: fields,
                properties: Object.fromEntries(fields.map((field) => [field, { type: 'string' }])),
            };

            return [
                '### Tailored request example',
                'The model ID is selected by the host. The example string properties are illustrative; supply the actual business schema and decode `structured: unknown` in the application.',
                '```typescript',
                "import type { IAiRequest } from '@pixel-brewery/synapse-core';",
                '',
                '// runtime is an explicitly composed, host-owned AiRuntime.',
                'const request: IAiRequest = {',
                '    target: { instanceId: "configured-instance" },',
                '    prompt: "Host-owned prompt",',
                `    model: ${JSON.stringify(options.modelName)},`,
                '    policy: { mode: "read-only", repeatable: true },',
                `    outputSchema: ${JSON.stringify(schema, null, 4).replaceAll('\n', '\n    ')},`,
                '};',
                'const result = await runtime.run(request).result;',
                '```',
            ].join('\n');
        }
        case 'repository': {
            if (!options.modelName || !fields.length) return '';

            return [
                '### Tailored host storage projection',
                'This projection belongs to the consuming application. Synapse exposes `RoutingStoreBase` and `ProfileSessionStoreBase` for their documented framework state; it does not provide a business repository or Prisma model.',
                '```typescript',
                `const hostStorageNamespace = ${JSON.stringify(options.modelName)};`,
                'type HostStorageProjection = Readonly<{',
                ...fields.map((field) => `    ${JSON.stringify(field)}: unknown;`),
                '}>;',
                '```',
            ].join('\n');
        }
        case 'mapping': {
            if (!options.entityName || !fields.length) return '';

            return [
                '### Tailored application projection',
                'Validate native input at its adapter boundary. These selected values remain `unknown` until the host validates its own business result; no MappingService or response-class dependency is introduced.',
                '```typescript',
                `// Native entity label: ${JSON.stringify(options.entityName)}`,
                `// Host response label: ${JSON.stringify(options.responseName ?? `${options.entityName}Response`)}`,
                'function projectSelectedFields(native: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {',
                '    return {',
                ...fields.map(
                    (field) =>
                        `        [${JSON.stringify(field)}]: native[${JSON.stringify(field)}],`,
                ),
                '    };',
                '}',
                '```',
            ].join('\n');
        }
        case 'module': {
            if (!options.moduleName || !options.bases?.length) return '';

            return [
                '### Tailored explicit composition',
                'The composition label and custom abstract seams below belong to the host. The example uses actual public Synapse constructor contracts; no dynamic module, decorator or DI container is required. The returned runtime owns disposal of its configured drivers.',
                '```typescript',
                "import type { AiDriverBase, IAiInstance } from '@pixel-brewery/synapse-core';",
                "import { AiRuntime } from '@pixel-brewery/synapse-runtime';",
                '',
                `// Host composition label: ${JSON.stringify(options.moduleName)}`,
                `// Host-owned custom seams: ${options.bases.map((base) => JSON.stringify(base)).join(', ')}`,
                'function composeRuntime(driver: AiDriverBase, instances: readonly IAiInstance[]): AiRuntime {',
                '    return new AiRuntime({ drivers: [driver], instances });',
                '}',
                '// The consuming operation calls await runtime.dispose() in its finally block.',
                '```',
            ].join('\n');
        }
    }
}
