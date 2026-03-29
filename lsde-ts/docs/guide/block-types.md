# Block Types

The engine supports 5 block types. Each has a dedicated handler and a type-specific context.

All 4 content block handlers (`onDialog`, `onChoice`, `onCondition`, `onAction`) are **required** — the engine validates their presence when `start()` is called.

## DIALOG

Displays text spoken by a character. The character is resolved by the `onResolveCharacter` callback.

<!--@include: ../_shared/block-dialog.md-->

`resolveCharacterPort()` matches by character **UUID first**, then by **name** as fallback.

## CHOICE

Presents selectable options to the player. When [`setChoiceFilter()`](/guide/choice-visibility) is configured, each choice is tagged with `visible: true | false`.

<!--@include: ../_shared/block-choice.md-->

See [Choice Visibility](/guide/choice-visibility) for the full opt-in tagging system.

## CONDITION

Evaluates logic to branch the flow. The handler **must** call `resolve(result)` — `true` follows port index 0, `false` follows port index 1.

<!--@include: ../_shared/block-condition.md-->

::: tip choice: conditions
Conditions with keys starting with `choice:` reference a previous player selection. Use `scene.evaluateCondition(cond)` to resolve them — the engine checks its internal choice history automatically.
:::

## ACTION

Triggers game state changes. Call `resolve()` for success or `reject(error)` for failure.

<!--@include: ../_shared/block-action.md-->

## NOTE

Documentation block for the designer. Never executed — automatically skipped during traversal.

## Common Properties

All blocks share these base fields:

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Unique identifier |
| `type` | `BlockType` | Discriminant type |
| `label` | `string?` | Human-readable name |
| `properties` | `BlockProperty[]` | Key-value properties |
| `userProperties` | `Record?` | Free-form user properties |
| `nativeProperties` | `NativeProperties?` | Execution properties — see [Lifecycle & Validation](lifecycle#nativeproperties) |
| `metadata` | `BlockMetadata?` | Display metadata (characters, tags, color) |
| `isStartBlock` | `boolean?` | Marks the entry block |
