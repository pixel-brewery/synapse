# Source, filename and TSDoc conventions

These are the binding framework-neutral application of Archipel's source standards. Read with common OOP and [documentation](documentation.md).

## Files and declarations

- TypeScript strict ESM; relative runtime imports use `.js`. Keep imports contiguous at the top, wrapped in `// #region Imports` and `// #endregion`. Type-only imports use `import type`.
- Public declaration `Name` owns `Name.ts`, preserving exact casing. A named function owns its matching function-name file. `index.ts` files are explicit export barrels, not implementation buckets.
- One public declaration per file. Internal helper declarations may stay beside their single owner. A cohesive runtime schema and its directly inferred type may share a file; unrelated exports may not. Barrels may re-export public declarations.
- Every interface starts with `I` and lives in `interfaces/`. Every abstract class ends in `Base` and lives in `abstracts/`. Do not introduce `*Port` or `ports/`.
- Concrete implementations belong to the owning capability's `services/`, `adapters/` or suitable cohesive source owner; avoid redundant feature/layer wrappers and speculative folders.
- Every non-browser spec is adjacent to its actual production owner: `Name.ts` owns `Name.spec.ts`. No aggregate/scenario/technology suffixes, separate test directories or empty production files to manufacture ownership. Put fixtures beside their real consumer.

## Classes and type safety

Class regions are an ordered subset of `Fields` → `Ctor` → `Properties` → `Methods`. Include a region only when it contains the corresponding members. Never create an empty region or a placeholder member to fill it. Regions are balanced and nonnested; an empty class needs no regions.

The Imports region surrounds imports outside the class and is not an additional class region. Order members by `public`, `protected`, `private`; static members come first within each access level. Use explicit access modifiers. Private fields use `_`; private methods do not. Constructor parameter properties are fields and use the same naming.

## Layout and comments

- Use the configured four-space indentation and ordinary operator/argument spacing. Run the repository formatter; tightly packed code is not a substitute for keeping a file short.
- Keep a blank line after every region opening and before its closure, including Imports. Keep a blank line between adjacent regions. The first class region follows the opening class brace; the final region closure is followed by the closing class brace.
- Keep imports contiguous inside their region. Separate the import region from the next declaration with a blank line.
- Separate methods, constructors and documented members with a blank line. A member's TSDoc stays immediately above that member. Related simple, undocumented fields may remain adjacent; do not add artificial blank lines between every field.
- Separate logical statement groups, guards and the final result with a blank line. Related consecutive local declarations can remain together. Preserve compact object/array data and do not insert empty lines between every statement indiscriminately.
- Every TSDoc block uses separate delimiter lines: `/**`, description lines beginning with ` *`, and ` */`. Never put a description or tag on the opening/closing delimiter line, even for a single property.
- Put a ` *` blank line between the description and tags. Keep related parameter/return/error tags together; put access/release tags such as `@public`, `@protected` or `@internal` in a separate final block. Do not put an extra blank line before the closing delimiter or between the comment and its declaration.
- Source-formatting checks must inspect actual comments and syntax. Strings, regular expressions, template literal text and deliberately malformed source fixtures are data, not comments to rewrite.

```typescript
/**
 * Returns the selected provider's native display name.
 *
 * @param id - Native provider identifier.
 * @returns The display name for the selected provider.
 *
 * @public
 */
export function displayName(id: string): string {
    const name = id.trim();

    return name;
}
```

Use English code, comments and TSDoc; precise public type annotations, `unknown` instead of `any`, immutable values, discriminated unions, exhaustive switches and explicit typed errors. Never hide an unchecked boundary with assertions or `as unknown as`. Validate unknown provider/config/persisted data at the owner.

Use constructor injection. Constructors/imports do not execute processes, read credentials, search files, access the network, start timers or register global mutable state. Lifecycle effects require an explicit method.

## Public API documentation

All exported public classes, abstract bases, interfaces, types, functions, constants and their public/protected API members require English TSDoc. Document interface properties and abstract methods as fully as concrete APIs. Include access/release intent where relevant, parameters, returns, errors, lifecycle and ownership; use `@public`, `@internal`, `@param`, `@returns`, `@throws`, `@remarks` and useful `@example` tags supported by the docs generator. Use `@override`/`@inheritDoc` only when it resolves to a real documented declaration. Private implementation details do not substitute for a documented public contract.

See [documentation](documentation.md) for completeness, validation and generated artifacts. No public API is complete until consumers can understand and generate its documentation.
