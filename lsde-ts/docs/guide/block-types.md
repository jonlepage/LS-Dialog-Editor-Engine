# Block Types

Blocks are the building blocks of a dialogue scene — each node in the editor graph is a block. The engine routes the flow from block to block and calls the matching handler for each type.

There are 6 types: **Dialog**, **Choice**, **Condition**, **Router**, **Action**, and **Note**. Dialog, Choice, Condition and Action are content blocks with a dedicated handler (`onDialog`, `onChoice`, `onCondition`, `onAction`) — all four are **required** and validated when `start()` is called. A Router has no handler: the engine dispatches it on its own. Note blocks are skipped automatically.

Handlers come in two tiers: **global handlers** (registered on the engine) cover all scenes and are sufficient for most games. **Scene handlers** (registered on a [`SceneHandle`](/api-ref/interfaces/SceneHandle)) can supplement or override globals for a specific scene. See [Handlers](/guide/handlers) for details.

## DIALOG

A dialog block represents a line of speech — a character talking, a narrator, on-screen text. The engine resolves the speaking character via the `onResolveCharacter` callback and exposes it as `context.character`. A typical dialog handler creates a text instance in the game (textbox, bubble, subtitle…), waits for the player or an animation to finish, then calls `next()` to advance the engine. The optional cleanup function lets you clean up side effects when the engine moves to the next block.

<!--@include: ../_shared/block-dialog.md-->

When the narrative designer assigns a dedicated output per character ([`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)), the handler must call `resolveCharacterPort()` to tell the engine which path to follow on `next()`.

## CHOICE

A choice block represents a branching point where the player picks a response — a dialogue menu, a list of options. `context.options` contains all available options. When [`onResolveCondition()`](/guide/choice-visibility) is configured, each option is tagged `visible: true | false` — the handler filters and displays whichever it wants. After the player interacts, `selectChoice(optionId)` tells the engine which path to follow — **the option id IS the port** the flow leaves by (`C1`, `C2`…) — then `next()` advances the flow.

<!--@include: ../_shared/block-choice.md-->

See [Choice Visibility](/guide/choice-visibility) for the full opt-in tagging system.

## CONDITION

A condition block is an invisible switch — it reads game state and sends the flow down a path without the player seeing it.

**The engine never compares anything itself.** It reads no dictionary, does not know what `credits` holds, does not implement `greaterOrEqual`. It hands every test to [`onResolveCondition()`](/guide/choice-visibility) and assembles the answers. Each test reaches the resolver **exactly once**, whatever the mode.

With a resolver installed the engine already knows the exit port before it calls the handler, which is what makes `onCondition` optional: it becomes a place to log or to override. The handler is handed `context.cases`, each case carrying its `port` and its already-computed `result`. To override, `context.resolve(port)` takes a **port NAME** — `"out"`, `"default"`, or a case port (`"K1"`).

There are **two modes, and only two**:

- **`portPerCase` absent** — every case must hold. If they all do the flow leaves by `out`; otherwise by `default`.
- **`portPerCase: true`** — the **first** case that holds leaves by **its own port** (`K1`, `K2`…). If none holds, `default`.

A case with no `when` is always true, and makes every case below it unreachable in `portPerCase` mode. That is the writer's drawing, not an error to report. A block with no cases at all leaves by `out`: nothing was asked, so nothing failed.

`default` means "no case held" — **not** "the chosen exit has no wire". A port with no wire ends the flow, which is a legitimate ending.

A test whose dictionary is the reserved word **`choice`** reads an answer the player already gave: `{ dict: "choice", entry: "CHOICE-001", value: "C1" }`. The engine answers it **itself**, from the scene's history — the question never reaches the game. See also `scene.getChoice(blockId)` and `scene.evaluateCondition(test)`.

<!--@include: ../_shared/block-condition.md-->

## ROUTER

A router carries the **same `cases`** as a condition and reads them the opposite way. A condition asks *which one* holds and leaves by a single port; a router asks *which ones*: it evaluates **every** case, launches the port of each true one, and then always continues — by `then` when all of them held, by `catch` when any did not. A router with no case at all leaves by `then`, the way `Promise.all([])` resolves.

Its `K*` routes are walked like any other port: an `isAsync` target opens its own track, the others are walked in turn, and the continuation comes **last**. `catch` cancels nothing — the tracks of the true cases are already running.

There is **no `onRouter` handler** and `start()` requires none: the engine dispatches a router on its own. To observe one, use `handle.onBlock(id)`.

<!--@include: ../_shared/block-router.md-->

See [The Router Block](/guide/router) for the full contract and diagrams, and [Distributing characters](/guide/character-distribution) for `inPortPerCharacter` — the entry port a router's routes typically name.

## ACTION

An action block fires side effects in the game — give an item, play a sound, set a flag. `context.calls` carries the calls: each cites the `fn` of a declared [function](/guide/blueprints#functions), and its `args` arrive **by name**, never by position. The handler executes them then calls `context.resolve()` to follow the `then` port, or `context.reject()` to follow the `catch` port — and when the designer wired no `catch`, the flow carries on through `then` rather than stranding the player.

<!--@include: ../_shared/block-action.md-->

## NOTE

A note block is a sticky note for the narrative designer — comments, reminders, context. It is automatically skipped during traversal. While it is technically possible to intercept a note block via [`onBeforeBlock`](/guide/lifecycle), this is not recommended — the action block should cover all your side-effect needs.

## Common Properties

All blocks share these base fields ([`BlueprintBlockBase`](/api-ref/type-aliases/BlueprintBlock)):

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Identity **relative to its scene** — `DIALOG-002`. Ids repeat across scenes. |
| `key` | `string` | The full i18n key, as the localization files carry it |
| `type` | `BlockType` | `dialog`, `choice`, `condition`, `router`, `action` or `note` |
| `label` | `string?` | Readable name, when the writer set one |
| `parentLabels` | `string[]?` | Parent folder hierarchy from the editor |
| `note` | `string?` | The writer's own note |
| `actors` | `string[]?` | The **card ids** the block cites, in file order |
| `emotion` | `string?` | The emotion's card id — it belongs to the **block**, not to each actor |
| `intensity` | `number?` | How strongly, for that emotion |
| `text` | `TextByLocale?` | The text per locale, when the export is inline |
| `props` | `PropertyBag?` | **One bag**: the natives and the writer's own properties, by bare id |
| `options` | `Option[]?` | CHOICE only |
| `cases` | `ConditionCase[]?` | CONDITION and ROUTER — the same data, read in opposite ways |
| `calls` | `ActionCall[]?` | ACTION only |
| `next` | `Link[]?` | **The block's outgoing wires.** There is no connection table in v2 |

The entry block is not flagged on the block: the **scene** names it, in `scene.start`. A scene therefore cannot declare two of them.

### NativeProperties

The ten properties the **engine** reads, taken out of `props`. Ids cannot collide — LSDE refuses a project property that takes a native name — so telling them apart is a plain lookup.

| Field | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | **Opens a parallel track** on this block instead of continuing the current one |
| `waitForBlocks` | `string[]?` | Block ids **of this scene**. The block is **held before it is dispatched** until every one of them has **finished** — no handler is called |
| `delay` | `number?` | **MILLISECONDS** before the block plays. Applied by `onBeforeBlock`, never by the engine |
| `timeout` | `number?` | **MILLISECONDS** the block STAYS after its line has been said, then it leaves on its own — an auto-advance for blocks. **Outranks `waitInput`**. Passed through; the engine enforces nothing |
| `waitInput` | `boolean?` | Wait for player input. Passed through, never interpreted — **outranked by `timeout`** |
| `debug` | `boolean?` | Debug flag for the editor. Passed through |
| `portPerCharacter` | `boolean?` | The block leaves by a port **named by the actor's card id**, instead of `out` |
| `inPortPerCharacter` | `boolean?` | The wire **names the actor**: a link's `toPort` is a card id, and only that actor is offered to `onResolveCharacter`. See [Distributing characters](/guide/character-distribution) |
| `skipIfMissingActor` | `boolean?` | Passed through — the game decides |
| `portPerCase` | `boolean?` | CONDITION: each case leaves by **its own port** (`K1`…) instead of sharing `out` |

::: warning `delay` and `timeout` are MILLISECONDS in v2
They were seconds in v1, and **nothing reports the change at runtime**: a migrated project turns a 3-second pause into 3 ms.
:::

::: tip `timeout` is an auto-advance for blocks — count from the END of the line
The countdown starts when the line has been **said**, not when the block arrived. What the writer sets is how long it STAYS on screen after its last character is typed (or its last syllable spoken); then the block leaves on its own.

Counting from arrival is the mistake that reads naturally and plays wrong: 2500 ms on a 120-character line truncates it mid-sentence.

It **outranks `waitInput`**, and it outranks leaving immediately. All three say WHEN the block is left, and the one the writer put on the card is the most specific answer. So a click may only **hurry the reveal**, never dismiss the block — pressing a line that plays its own time makes no sense, speeding it up does, and the hurried reveal is what arms the countdown.

And since leaving a block is what marks it **finished**, a `timeout` is also what releases a [`waitForBlocks`](/guide/async-tracks) that names it.
:::

Only **three** of these change anything about the traversal: `isAsync`, `waitForBlocks` and `inPortPerCharacter`. The other seven are handed to the game untouched.
