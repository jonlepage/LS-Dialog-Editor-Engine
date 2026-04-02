# Block Types

Blocks are the building blocks of a dialogue scene — each node in the editor graph is a block. The engine routes the flow from block to block and calls the matching handler for each type.

There are 5 types: **Dialog**, **Choice**, **Condition**, **Action**, and **Note**. The first four are content blocks with a dedicated handler (`onDialog`, `onChoice`, `onCondition`, `onAction`) — all four are **required** and validated when `start()` is called. Note blocks are skipped automatically.

Handlers come in two tiers: **global handlers** (registered on the engine) cover all scenes and are sufficient for most games. **Scene handlers** (registered on a [`SceneHandle`](/api-ref/interfaces/SceneHandle)) can supplement or override globals for a specific scene. See [Handlers](/guide/handlers) for details.

## DIALOG

A dialog block represents a line of speech — a character talking, a narrator, on-screen text. The engine resolves the speaking character via the `onResolveCharacter` callback and exposes it as `context.character`. A typical dialog handler creates a text instance in the game (textbox, bubble, subtitle…), waits for the player or an animation to finish, then calls `next()` to advance the engine. The optional cleanup function lets you clean up side effects when the engine moves to the next block.

<!--@include: ../_shared/block-dialog.md-->

When the narrative designer assigns a dedicated output per character ([`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)), the handler must call `resolveCharacterPort()` to tell the engine which path to follow on `next()`.

## CHOICE

A choice block represents a branching point where the player picks a response — a dialogue menu, a list of options. `context.choices` contains all available options. When [`onResolveCondition()`](/guide/choice-visibility) is configured, each option is tagged `visible: true | false` — the handler filters and displays whichever it wants. After the player interacts, `selectChoice(uuid)` tells the engine which path to follow, then `next()` advances the flow.

<!--@include: ../_shared/block-choice.md-->

See [Choice Visibility](/guide/choice-visibility) for the full opt-in tagging system.

## CONDITION

A condition block is an invisible switch — it evaluates game state and silently sends the flow down one or more paths without the player seeing it. Conditions are grouped in a 2D array: each group is a "case" evaluated as an AND/OR chain.

**When `onResolveCondition` is installed**, the engine pre-evaluates all groups before calling `onCondition`. Each group in `context.conditionGroups` has a `result` (true/false) and a `portIndex`. The engine auto-resolves the routing — `onCondition` is optional and serves as a logging/override hook.

**Routing modes:**
- **Switch mode** (default): first matching group index routes the flow. `-1` (no match) follows the default port.
- **Dispatcher mode** (`enableDispatcher: true`): all matching group indices fire as independent async tracks, default port is the main continuation.

`context.resolve()` accepts `boolean` (legacy), `number` (switch), or `number[]` (dispatcher).

<!--@include: ../_shared/block-condition.md-->

## ACTION

An action block fires side effects in the game — give an item, play a sound, set a flag. Each action references an `actionId` that the developer maps to their own systems. The handler executes the action list then calls `context.resolve()` to follow the "then" port, or `context.reject(error)` to follow the "catch" port (falls back to "then" if no "catch" connection exists).

<!--@include: ../_shared/block-action.md-->

## NOTE

A note block is a sticky note for the narrative designer — comments, reminders, context. It is automatically skipped during traversal. While it is technically possible to intercept a note block via [`onBeforeBlock`](/guide/lifecycle), this is not recommended — the action block should cover all your side-effect needs.

## Common Properties

All blocks share these base fields ([`BlueprintBlockBase`](/api-ref/interfaces/BlueprintBlockBase)):

| Field | Type | Description |
|-------|------|-------------|
| [`uuid`](/api-ref/interfaces/BlueprintBlockBase#uuid) | `string` | Unique identifier |
| [`type`](/api-ref/interfaces/BlueprintBlockBase#type) | `BlockType` | Discriminant type |
| [`label`](/api-ref/interfaces/BlueprintBlockBase#label) | `string?` | Human-readable name |
| [`parentLabels`](/api-ref/interfaces/BlueprintBlockBase#parentlabels) | `string[]?` | Parent folder hierarchy from the editor |
| [`properties`](/api-ref/interfaces/BlueprintBlockBase#properties) | `BlockProperty[]` | Key-value properties |
| [`userProperties`](/api-ref/interfaces/BlueprintBlockBase#userproperties) | `Record?` | Free-form user properties |
| [`nativeProperties`](/api-ref/interfaces/BlueprintBlockBase#nativeproperties) | `NativeProperties?` | Execution properties |
| [`metadata`](/api-ref/interfaces/BlueprintBlockBase#metadata) | `BlockMetadata?` | Display metadata (characters, tags, color) |
| [`isStartBlock`](/api-ref/interfaces/BlueprintBlockBase#isstartblock) | `boolean?` | Marks the entry block |

### NativeProperties

| Field | Type | Description |
|-------|------|-------------|
| [`isAsync`](/api-ref/interfaces/NativeProperties#isasync) | `boolean?` | Execute on a parallel async track |
| [`delay`](/api-ref/interfaces/NativeProperties#delay) | `number?` | Delay before execution (consumed by `onBeforeBlock`) |
| [`timeout`](/api-ref/interfaces/NativeProperties#timeout) | `number?` | Execution timeout |
| [`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter) | `boolean?` | One output port per character in metadata |
| [`skipIfMissingActor`](/api-ref/interfaces/NativeProperties#skipifmissingactor) | `boolean?` | Skip block if the assigned actor is missing |
| [`debug`](/api-ref/interfaces/NativeProperties#debug) | `boolean?` | Debug flag for the editor |
| [`waitForBlocks`](/api-ref/interfaces/NativeProperties#waitforblocks) | `string[]?` | Block UUIDs that must be visited before this block can progress |
| [`waitInput`](/api-ref/interfaces/NativeProperties#waitinput) | `boolean?` | Passive flag for explicit player input control |
| [`enableDispatcher`](/api-ref/interfaces/NativeProperties#enabledispatcher) | `boolean?` | Condition block: all matching groups fire as async tracks |
