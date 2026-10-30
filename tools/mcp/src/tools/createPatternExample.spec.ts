// #region Imports

import { describe, expect, it } from 'vitest';
import { createPatternExample } from './createPatternExample.js';

// #endregion

describe('createPatternExample', () => {
    it('preserves unusual caller data as quoted JSON and emits a valid deduplicated result schema', () => {
        // Arrange
        const field = 'quoted"\n```\n__proto__';
        const model = 'fixture"\nprocess.exit(99)';

        // Act
        const example = createPatternExample('query', { modelName: model, fields: [field, field] });
        const schemaText = /outputSchema: ([\s\S]+),\n\};/u.exec(example)?.[1];

        // Assert
        expect(example).toContain(`model: ${JSON.stringify(model)}`);
        expect(schemaText).toBeDefined();
        expect(JSON.parse(schemaText!)).toEqual({
            type: 'object',
            additionalProperties: false,
            required: [field],
            properties: { [field]: { type: 'string' } },
        });
    });

    it('keeps a special property name as an own computed mapping property', () => {
        // Arrange
        const field = '__proto__';

        // Act
        const example = createPatternExample('mapping', {
            entityName: 'NativeEvent',
            fields: [field],
        });

        // Assert
        expect(example).toContain('["__proto__"]: native["__proto__"]');
        expect(example).toContain('Readonly<Record<string, unknown>>');
    });

    it.each(['query', 'repository', 'mapping', 'module'] as const)(
        'leaves the authored %s pattern alone without sufficient tailoring context',
        (pattern) => {
            // Arrange
            const context = {};

            // Act
            const example = createPatternExample(pattern, context);

            // Assert
            expect(example).toBe('');
        },
    );
});
