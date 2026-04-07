LSDE Dialog Engine — Full API Reference (plain text, auto-generated)
============================================================
Concatenates all TypeDoc-generated API documentation for LLM consumption.
Source: lsde-ts/docs/api-ref/**/*.md
============================================================

# LSDE Dialog Engine

## Classes

- [DialogueEngine](classes/DialogueEngine.md)
- [LsdeUtils](classes/LsdeUtils.md)

## Interfaces

- [ActionBlock](interfaces/ActionBlock.md)
- [ActionContext](interfaces/ActionContext.md)
- [ActionSignature](interfaces/ActionSignature.md)
- [BaseBlockContext](interfaces/BaseBlockContext.md)
- [BeforeBlockArgs](interfaces/BeforeBlockArgs.md)
- [BeforeBlockContext](interfaces/BeforeBlockContext.md)
- [BlockCharacter](interfaces/BlockCharacter.md)
- [BlockHandlerArgs](interfaces/BlockHandlerArgs.md)
- [BlockMetadata](interfaces/BlockMetadata.md)
- [BlockProperty](interfaces/BlockProperty.md)
- [BlockScreenshot](interfaces/BlockScreenshot.md)
- [BlueprintBlockBase](interfaces/BlueprintBlockBase.md)
- [BlueprintConnection](interfaces/BlueprintConnection.md)
- [BlueprintExport](interfaces/BlueprintExport.md)
- [BlueprintScene](interfaces/BlueprintScene.md)
- [CheckOptions](interfaces/CheckOptions.md)
- [ChoiceBlock](interfaces/ChoiceBlock.md)
- [ChoiceContext](interfaces/ChoiceContext.md)
- [ChoiceItem](interfaces/ChoiceItem.md)
- [ConditionBlock](interfaces/ConditionBlock.md)
- [ConditionContext](interfaces/ConditionContext.md)
- [DiagnosticEntry](interfaces/DiagnosticEntry.md)
- [DiagnosticReport](interfaces/DiagnosticReport.md)
- [DiagnosticStats](interfaces/DiagnosticStats.md)
- [DialogBlock](interfaces/DialogBlock.md)
- [DialogContext](interfaces/DialogContext.md)
- [Dictionary](interfaces/Dictionary.md)
- [DictionaryRow](interfaces/DictionaryRow.md)
- [ExportAction](interfaces/ExportAction.md)
- [ExportCondition](interfaces/ExportCondition.md)
- [IDialogueEngine](interfaces/IDialogueEngine.md)
- [InitOptions](interfaces/InitOptions.md)
- [InvalidateBlockArgs](interfaces/InvalidateBlockArgs.md)
- [NativeProperties](interfaces/NativeProperties.md)
- [NoteBlock](interfaces/NoteBlock.md)
- [PortResolutionInput](interfaces/PortResolutionInput.md)
- [PortResolutionResult](interfaces/PortResolutionResult.md)
- [RuntimeChoiceItem](interfaces/RuntimeChoiceItem.md)
- [RuntimeConditionGroup](interfaces/RuntimeConditionGroup.md)
- [SceneContext](interfaces/SceneContext.md)
- [SceneHandle](interfaces/SceneHandle.md)
- [SceneLifecycleArgs](interfaces/SceneLifecycleArgs.md)
- [SignatureParam](interfaces/SignatureParam.md)
- [TrackInfo](interfaces/TrackInfo.md)
- [ValidateNextBlockArgs](interfaces/ValidateNextBlockArgs.md)
- [ValidateNextBlockContext](interfaces/ValidateNextBlockContext.md)
- [ValidationResult](interfaces/ValidationResult.md)

## Type Aliases

- [ActionHandler](type-aliases/ActionHandler.md)
- [BeforeBlockHandler](type-aliases/BeforeBlockHandler.md)
- [BlockHandler](type-aliases/BlockHandler.md)
- [BlockType](type-aliases/BlockType.md)
- [BlueprintBlock](type-aliases/BlueprintBlock.md)
- [ChoiceHandler](type-aliases/ChoiceHandler.md)
- [CleanupFn](type-aliases/CleanupFn.md)
- [ConditionHandler](type-aliases/ConditionHandler.md)
- [DialogHandler](type-aliases/DialogHandler.md)
- [InvalidateBlockHandler](type-aliases/InvalidateBlockHandler.md)
- [SceneLifecycleHandler](type-aliases/SceneLifecycleHandler.md)
- [ValidateNextBlockHandler](type-aliases/ValidateNextBlockHandler.md)

================================================================================

[LSDE Dialog Engine](../index.md) / DialogueEngine

# Class: DialogueEngine

Defined in: [engine.ts:25](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L25)

LSDE Dialog Engine — callback-driven graph dispatcher.

## Implements

- [`IDialogueEngine`](../interfaces/IDialogueEngine.md)

## Constructors

### Constructor

> **new DialogueEngine**(): `DialogueEngine`

#### Returns

`DialogueEngine`

## Methods

### getActiveScenes()

> **getActiveScenes**(): [`SceneHandle`](../interfaces/SceneHandle.md)[]

Defined in: [engine.ts:145](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L145)

Get all currently active scene handles.

#### Returns

[`SceneHandle`](../interfaces/SceneHandle.md)[]

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`getActiveScenes`](../interfaces/IDialogueEngine.md#getactivescenes)

***

### getCurrentBlocks()

> **getCurrentBlocks**(): [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)[]

Defined in: [engine.ts:149](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L149)

Get the current block of every active scene.

#### Returns

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)[]

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`getCurrentBlocks`](../interfaces/IDialogueEngine.md#getcurrentblocks)

***

### getSceneConnections()

> **getSceneConnections**(`sceneId`): [`BlueprintConnection`](../interfaces/BlueprintConnection.md)[]

Defined in: [engine.ts:158](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L158)

Get connections for a scene (for inter-scene navigation).

#### Parameters

##### sceneId

`string`

#### Returns

[`BlueprintConnection`](../interfaces/BlueprintConnection.md)[]

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`getSceneConnections`](../interfaces/IDialogueEngine.md#getsceneconnections)

***

### init()

> **init**(`options`): [`DiagnosticReport`](../interfaces/DiagnosticReport.md)

Defined in: [engine.ts:41](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L41)

Validate blueprint data, build internal graph, return diagnostic report.

#### Parameters

##### options

[`InitOptions`](../interfaces/InitOptions.md)

#### Returns

[`DiagnosticReport`](../interfaces/DiagnosticReport.md)

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`init`](../interfaces/IDialogueEngine.md#init)

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [engine.ts:141](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L141)

True if at least one scene is active.

#### Returns

`boolean`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`isRunning`](../interfaces/IDialogueEngine.md#isrunning)

***

### onAction()

> **onAction**(`handler`): `void`

Defined in: [engine.ts:102](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L102)

Register a global handler for ACTION blocks. The developer MUST handle execution in this handler.

#### Parameters

##### handler

[`ActionHandler`](../type-aliases/ActionHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onAction`](../interfaces/IDialogueEngine.md#onaction)

***

### onBeforeBlock()

> **onBeforeBlock**(`handler`): `void`

Defined in: [engine.ts:86](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L86)

Register a handler called before every block. Must call resolve() to continue.

#### Parameters

##### handler

[`BeforeBlockHandler`](../type-aliases/BeforeBlockHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onBeforeBlock`](../interfaces/IDialogueEngine.md#onbeforeblock)

***

### onChoice()

> **onChoice**(`handler`): `void`

Defined in: [engine.ts:94](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L94)

Register a global handler for CHOICE blocks. All choices are provided, tagged with `visible` when `onResolveCondition()` is configured.

#### Parameters

##### handler

[`ChoiceHandler`](../type-aliases/ChoiceHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onChoice`](../interfaces/IDialogueEngine.md#onchoice)

***

### onCondition()

> **onCondition**(`handler`): `void`

Defined in: [engine.ts:98](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L98)

Register a global handler for CONDITION blocks. The developer MUST handle evaluation in this handler.

#### Parameters

##### handler

[`ConditionHandler`](../type-aliases/ConditionHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onCondition`](../interfaces/IDialogueEngine.md#oncondition)

***

### onDialog()

> **onDialog**(`handler`): `void`

Defined in: [engine.ts:90](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L90)

Register a global handler for DIALOG blocks. May return a cleanup function.

#### Parameters

##### handler

[`DialogHandler`](../type-aliases/DialogHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onDialog`](../interfaces/IDialogueEngine.md#ondialog)

***

### onInvalidateBlock()

> **onInvalidateBlock**(`handler`): `void`

Defined in: [engine.ts:82](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L82)

Register a handler called when a block fails validation.

#### Parameters

##### handler

[`InvalidateBlockHandler`](../type-aliases/InvalidateBlockHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onInvalidateBlock`](../interfaces/IDialogueEngine.md#oninvalidateblock)

***

### onResolveCharacter()

> **onResolveCharacter**(`fn`): `void`

Defined in: [engine.ts:65](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L65)

Register a global character resolver. Called for every block with `metadata.characters`.

#### Parameters

##### fn

(`characters`) => [`BlockCharacter`](../interfaces/BlockCharacter.md) \| `undefined`

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onResolveCharacter`](../interfaces/IDialogueEngine.md#onresolvecharacter)

***

### onResolveCondition()

> **onResolveCondition**(`evaluator`): `void`

Defined in: [engine.ts:69](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L69)

Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
The engine handles `choice:` conditions internally via choice history — this callback
evaluates game-state conditions only.

When installed:
- Choice blocks: each choice is tagged with `visible: true | false` based on its `visibilityConditions`.
- Condition blocks: each group is pre-evaluated and the result is available in `context.groups[i].result`
  and `context.evaluation`.

#### Parameters

##### evaluator

(`condition`) => `boolean`

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onResolveCondition`](../interfaces/IDialogueEngine.md#onresolvecondition)

***

### onSceneEnter()

> **onSceneEnter**(`handler`): `void`

Defined in: [engine.ts:106](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L106)

Register a handler called when any scene starts.

#### Parameters

##### handler

[`SceneLifecycleHandler`](../type-aliases/SceneLifecycleHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onSceneEnter`](../interfaces/IDialogueEngine.md#onsceneenter)

***

### onSceneExit()

> **onSceneExit**(`handler`): `void`

Defined in: [engine.ts:110](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L110)

Register a handler called when any scene ends (natural or cancelled).

#### Parameters

##### handler

[`SceneLifecycleHandler`](../type-aliases/SceneLifecycleHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onSceneExit`](../interfaces/IDialogueEngine.md#onsceneexit)

***

### onValidateNextBlock()

> **onValidateNextBlock**(`handler`): `void`

Defined in: [engine.ts:78](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L78)

Register a handler called before each block to validate it.

#### Parameters

##### handler

[`ValidateNextBlockHandler`](../type-aliases/ValidateNextBlockHandler.md)

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`onValidateNextBlock`](../interfaces/IDialogueEngine.md#onvalidatenextblock)

***

### scene()

> **scene**(`sceneId`): [`SceneHandle`](../interfaces/SceneHandle.md)

Defined in: [engine.ts:114](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L114)

Create a scene handle. Does NOT start the flow — call handle.start().

#### Parameters

##### sceneId

`string`

#### Returns

[`SceneHandle`](../interfaces/SceneHandle.md)

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`scene`](../interfaces/IDialogueEngine.md#scene)

***

### ~~setChoiceFilter()~~

> **setChoiceFilter**(`evaluator`): `void`

Defined in: [engine.ts:74](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L74)

#### Parameters

##### evaluator

(`condition`) => `boolean`

#### Returns

`void`

#### Deprecated

Use onResolveCondition() instead.

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`setChoiceFilter`](../interfaces/IDialogueEngine.md#setchoicefilter)

***

### setLocale()

> **setLocale**(`locale`): `void`

Defined in: [engine.ts:52](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L52)

Set the active locale for text resolution.

#### Parameters

##### locale

`string`

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`setLocale`](../interfaces/IDialogueEngine.md#setlocale)

***

### stop()

> **stop**(): `void`

Defined in: [engine.ts:135](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/engine.ts#L135)

Stop all active scenes.

#### Returns

`void`

#### Implementation of

[`IDialogueEngine`](../interfaces/IDialogueEngine.md).[`stop`](../interfaces/IDialogueEngine.md#stop)

================================================================================

[LSDE Dialog Engine](../index.md) / LsdeUtils

# Class: LsdeUtils

Defined in: [lsde-utils.ts:8](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L8)

Public utility class exposing common helpers for game developers integrating the LSDE engine.

## Constructors

### Constructor

> **new LsdeUtils**(): `LsdeUtils`

#### Returns

`LsdeUtils`

## Properties

### evaluateConditionChain

> `static` **evaluateConditionChain**: (`conditions`, `evaluator`) => `boolean`

Defined in: [lsde-utils.ts:75](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L75)

Evaluates a chain of conditions with `&` (AND) / `|` (OR) chaining.
Left-to-right evaluation, no operator precedence. Empty array returns `true`.

Evaluate a chain of conditions left-to-right with no operator precedence.
- Empty array → true (no conditions = pass)
- First condition: standalone result
- Subsequent conditions: '&' = AND, '|' = OR with accumulated result

#### Parameters

##### conditions

[`ExportCondition`](../interfaces/ExportCondition.md)[]

##### evaluator

(`condition`) => `boolean`

#### Returns

`boolean`

#### Param

The condition chain to evaluate.

#### Param

A callback that evaluates a single condition.

***

### evaluateConditionGroups

> `static` **evaluateConditionGroups**: (`groups`, `evaluator`, `dispatcher?`) => `number` \| `number`[]

Defined in: [lsde-utils.ts:85](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L85)

Evaluates condition groups (2D array) for switch or dispatcher mode.
- Switch mode (`dispatcher = false`): returns the index of the first matching group, or `-1`.
- Dispatcher mode (`dispatcher = true`): returns an array of all matching group indices.

Evaluate condition groups (2D array) for switch or dispatcher mode.
Each inner array is a "case" evaluated via `evaluateConditionChain`.

- **Switch mode** (`dispatcher = false`): evaluates groups in order, returns the index
  of the first matching group, or `-1` if none match (→ default port).
- **Dispatcher mode** (`dispatcher = true`): evaluates ALL groups, returns an array
  of all matching indices (may be empty → default port only).

#### Parameters

##### groups

[`ExportCondition`](../interfaces/ExportCondition.md)[][]

##### evaluator

(`condition`) => `boolean`

##### dispatcher?

`boolean`

#### Returns

`number` \| `number`[]

#### Param

The 2D condition array from `ConditionBlock.conditions`.

#### Param

A callback that evaluates a single condition.

#### Param

When `true`, evaluates all groups instead of breaking at first match.

***

### filterVisibleChoices

> `static` **filterVisibleChoices**: (`choices`, `evaluator`, `scene?`) => [`ChoiceItem`](../interfaces/ChoiceItem.md)[]

Defined in: [lsde-utils.ts:96](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L96)

Filters choice items by their visibility conditions.
Choices without `visibilityConditions` are always visible.

Filter choices by their visibilityConditions.
Choices with no conditions or passing conditions are kept.

When `scene` is provided, `choice:` conditions are resolved automatically
via the scene's internal choice history — the developer never sees them.
Non-choice conditions are delegated to the `evaluator` callback.

#### Parameters

##### choices

[`ChoiceItem`](../interfaces/ChoiceItem.md)[]

##### evaluator

(`condition`) => `boolean`

##### scene?

###### evaluateCondition

#### Returns

[`ChoiceItem`](../interfaces/ChoiceItem.md)[]

#### Param

The full list of choices.

#### Param

A callback that evaluates a single condition.

#### Param

Optional [SceneHandle](../interfaces/SceneHandle.md). When provided, `choice:` conditions are
  resolved automatically via the scene's internal choice history and the developer
  never sees them — only non-choice conditions are delegated to the `evaluator` callback.

***

### isActionBlock

> `static` **isActionBlock**: (`block`) => `block is ActionBlock`

Defined in: [lsde-utils.ts:22](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L22)

Returns `true` if the block is an [ActionBlock](../interfaces/ActionBlock.md).

#### Parameters

##### block

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

#### Returns

`block is ActionBlock`

***

### isChoiceBlock

> `static` **isChoiceBlock**: (`block`) => `block is ChoiceBlock`

Defined in: [lsde-utils.ts:18](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L18)

Returns `true` if the block is a [ChoiceBlock](../interfaces/ChoiceBlock.md).

#### Parameters

##### block

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

#### Returns

`block is ChoiceBlock`

***

### isConditionBlock

> `static` **isConditionBlock**: (`block`) => `block is ConditionBlock`

Defined in: [lsde-utils.ts:20](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L20)

Returns `true` if the block is a [ConditionBlock](../interfaces/ConditionBlock.md).

#### Parameters

##### block

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

#### Returns

`block is ConditionBlock`

***

### isDialogBlock

> `static` **isDialogBlock**: (`block`) => `block is DialogBlock`

Defined in: [lsde-utils.ts:16](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L16)

Returns `true` if the block is a [DialogBlock](../interfaces/DialogBlock.md).

#### Parameters

##### block

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

#### Returns

`block is DialogBlock`

***

### isNoteBlock

> `static` **isNoteBlock**: (`block`) => `block is NoteBlock`

Defined in: [lsde-utils.ts:24](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L24)

Returns `true` if the block is a [NoteBlock](../interfaces/NoteBlock.md).

#### Parameters

##### block

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

#### Returns

`block is NoteBlock`

***

### locale

> `static` **locale**: `string` \| `null` = `null`

Defined in: [lsde-utils.ts:11](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L11)

Current locale set by `engine.setLocale()`. Used as default by `getLocalizedText()`.

## Methods

### getBlockLabel()

> `static` **getBlockLabel**(`block`): `string`

Defined in: [lsde-utils.ts:29](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L29)

Returns the block's label, or the first 8 characters of its UUID as fallback.

#### Parameters

##### block

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

#### Returns

`string`

***

### getChoiceConditionBlockUuid()

> `static` **getChoiceConditionBlockUuid**(`condition`): `string` \| `undefined`

Defined in: [lsde-utils.ts:65](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L65)

Extracts the referenced choice block UUID from a choice condition.

#### Parameters

##### condition

[`ExportCondition`](../interfaces/ExportCondition.md)

#### Returns

`string` \| `undefined`

The block UUID, or `undefined` if the condition is not a choice condition.

***

### getLocalizedText()

> `static` **getLocalizedText**(`dialogueText`, `locale?`): `string` \| `undefined`

Defined in: [lsde-utils.ts:42](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L42)

Looks up a localized text value from a `dialogueText` map.
Works with both `DialogBlock.dialogueText` and `ChoiceItem.dialogueText`.
Uses the engine locale (set via `engine.setLocale()`) by default.

#### Parameters

##### dialogueText

`Record`\<`string`, `string`\> \| `undefined`

The localized text map.

##### locale?

`string`

Optional locale override. If omitted, uses `LsdeUtils.locale`.

#### Returns

`string` \| `undefined`

The localized string, or `undefined` if the key is not found.

#### Throws

If no locale is set (neither via parameter nor `engine.setLocale()`).

***

### isChoiceCondition()

> `static` **isChoiceCondition**(`condition`): `boolean`

Defined in: [lsde-utils.ts:57](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/lsde-utils.ts#L57)

Returns `true` if the condition references a previous choice selection.
Choice conditions use the key format `"choice:<blockUuid>"` and are
evaluated internally by the engine against the scene's choice history.

#### Parameters

##### condition

[`ExportCondition`](../interfaces/ExportCondition.md)

#### Returns

`boolean`

================================================================================

[LSDE Dialog Engine](../index.md) / ActionBlock

# Interface: ActionBlock

Defined in: [types.ts:409](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L409)

Action block — triggers game state changes.

## Remarks

The developer MUST handle execution in the `onAction` handler.

The block has two output ports: `"then"` (success) and `"catch"` (failure).
Call `context.resolve()` for success or `context.reject(error)` for failure. If no
`"catch"` connection exists, rejection falls back to the `"then"` port.

## Example

```ts
engine.onAction(({ block, context, next }) => {
  try {
    for (const action of block.actions ?? []) {
      executeGameAction(action);
    }
    context.resolve();   // → "then" port
  } catch (err) {
    context.reject(err); // → "catch" port (fallback "then")
  }
  next();
});
```

## See

 - [ExportAction](ExportAction.md) for action structure
 - [ActionSignature](ActionSignature.md) for reusable action type definitions
 - [ActionContext](ActionContext.md) for handler context

## Extends

- [`BlueprintBlockBase`](BlueprintBlockBase.md)

## Properties

### actions?

> `optional` **actions?**: [`ExportAction`](ExportAction.md)[]

Defined in: [types.ts:412](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L412)

Actions to execute. Each references an `ActionSignature` via `actionId`.

***

### isStartBlock?

> `optional` **isStartBlock?**: `boolean`

Defined in: [types.ts:260](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L260)

When true, this block is the entry point of the scene. Only one per scene.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`isStartBlock`](BlueprintBlockBase.md#isstartblock)

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:248](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L248)

Display label assigned in the editor.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`label`](BlueprintBlockBase.md#label)

***

### metadata?

> `optional` **metadata?**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [types.ts:258](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L258)

Non-logic metadata for display and organization.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`metadata`](BlueprintBlockBase.md#metadata)

***

### nativeProperties?

> `optional` **nativeProperties?**: [`NativeProperties`](NativeProperties.md)

Defined in: [types.ts:256](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L256)

LSDE native execution properties (async, delay, portPerCharacter, etc.).

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`nativeProperties`](BlueprintBlockBase.md#nativeproperties)

***

### note?

> `optional` **note?**: `string`

Defined in: [types.ts:414](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L414)

Designer note. Not displayed to players.

***

### parentLabels?

> `optional` **parentLabels?**: `string`[]

Defined in: [types.ts:250](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L250)

Hierarchy of parent folder labels providing structural context.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`parentLabels`](BlueprintBlockBase.md#parentlabels)

***

### properties

> **properties**: [`BlockProperty`](BlockProperty.md)[]

Defined in: [types.ts:252](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L252)

Custom key-value properties defined by block configuration.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`properties`](BlueprintBlockBase.md#properties)

***

### type

> **type**: `"ACTION"`

Defined in: [types.ts:410](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L410)

Block type determining behavior and rendering.

#### Overrides

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`type`](BlueprintBlockBase.md#type)

***

### userProperties?

> `optional` **userProperties?**: `Record`\<`string`, `string` \| `number` \| `boolean`\>

Defined in: [types.ts:254](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L254)

User-defined custom properties dictionary set by the narrative designer.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`userProperties`](BlueprintBlockBase.md#userproperties)

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:244](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L244)

Unique block identifier.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`uuid`](BlueprintBlockBase.md#uuid)

================================================================================

[LSDE Dialog Engine](../index.md) / ActionContext

# Interface: ActionContext

Defined in: [types.ts:664](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L664)

Context for ACTION block handlers.

## Extends

- [`BaseBlockContext`](BaseBlockContext.md)

## Properties

### character

> **character**: [`BlockCharacter`](BlockCharacter.md) \| `undefined`

Defined in: [types.ts:623](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L623)

Character resolved by the `onResolveCharacter` callback for this block, or `undefined` if none.

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`character`](BaseBlockContext.md#character)

***

### preventGlobalHandler

> **preventGlobalHandler**: () => `void`

Defined in: [types.ts:625](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L625)

Prevent the global (Tier 1) handler from executing after this scene handler.

#### Returns

`void`

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`preventGlobalHandler`](BaseBlockContext.md#preventglobalhandler)

***

### reject

> **reject**: (`error`) => `void`

Defined in: [types.ts:668](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L668)

Mark action as failed. Engine follows the `catch` port (fallback `then` if no catch port exists).

#### Parameters

##### error

`unknown`

#### Returns

`void`

***

### resolve

> **resolve**: () => `void`

Defined in: [types.ts:666](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L666)

Mark action as succeeded. Engine follows the `then` port.

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / ActionSignature

# Interface: ActionSignature

Defined in: [types.ts:497](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L497)

Action signature defining a reusable action type. Map `id` to your engine's action handlers.

## Properties

### id

> **id**: `string`

Defined in: [types.ts:501](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L501)

Short action type identifier (e.g. "set_flag"). Referenced by `ExportAction.actionId`.

***

### params

> **params**: [`SignatureParam`](SignatureParam.md)[]

Defined in: [types.ts:503](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L503)

Parameter definitions describing the expected inputs.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:499](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L499)

Unique identifier for this signature.

================================================================================

[LSDE Dialog Engine](../index.md) / BaseBlockContext

# Interface: BaseBlockContext

Defined in: [types.ts:621](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L621)

Base context available to all block handlers.

## Extended by

- [`DialogContext`](DialogContext.md)
- [`ChoiceContext`](ChoiceContext.md)
- [`ConditionContext`](ConditionContext.md)
- [`ActionContext`](ActionContext.md)

## Properties

### character

> **character**: [`BlockCharacter`](BlockCharacter.md) \| `undefined`

Defined in: [types.ts:623](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L623)

Character resolved by the `onResolveCharacter` callback for this block, or `undefined` if none.

***

### preventGlobalHandler

> **preventGlobalHandler**: () => `void`

Defined in: [types.ts:625](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L625)

Prevent the global (Tier 1) handler from executing after this scene handler.

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / BeforeBlockArgs

# Interface: BeforeBlockArgs

Defined in: [types.ts:815](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L815)

Arguments for the onBeforeBlock handler.

## Properties

### block

> **block**: [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

Defined in: [types.ts:816](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L816)

***

### context

> **context**: [`BeforeBlockContext`](BeforeBlockContext.md)

Defined in: [types.ts:818](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L818)

***

### resolve

> **resolve**: () => `void`

Defined in: [types.ts:819](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L819)

#### Returns

`void`

***

### scene

> **scene**: [`SceneHandle`](SceneHandle.md)

Defined in: [types.ts:817](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L817)

================================================================================

[LSDE Dialog Engine](../index.md) / BeforeBlockContext

# Interface: BeforeBlockContext

Defined in: [types.ts:672](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L672)

Context passed to onBeforeBlock handler.

## Properties

### nativeProperties

> **nativeProperties**: [`NativeProperties`](NativeProperties.md) \| `undefined`

Defined in: [types.ts:673](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L673)

================================================================================

[LSDE Dialog Engine](../index.md) / BlockCharacter

# Interface: BlockCharacter

Defined in: [types.ts:182](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L182)

Character (actor) assigned to a block.

## Properties

### emotion?

> `optional` **emotion?**: `string`

Defined in: [types.ts:190](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L190)

Emotion label for the character in this block (e.g. "happy", "angry", "sad").

***

### emotionIntensity?

> `optional` **emotionIntensity?**: `number`

Defined in: [types.ts:192](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L192)

Emotion intensity (e.g. 0 = neutral, higher = stronger).

***

### id

> **id**: `string`

Defined in: [types.ts:186](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L186)

Game-side character identifier. Use this to look up the character in your game engine.

***

### name

> **name**: `string`

Defined in: [types.ts:188](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L188)

Display name for debugging and editor preview. Not intended for in-game display.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:184](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L184)

Internal UUID used by the dialog engine.

================================================================================

[LSDE Dialog Engine](../index.md) / BlockHandlerArgs

# Interface: BlockHandlerArgs\<B, C\>

Defined in: [types.ts:704](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L704)

Arguments passed to any block handler.

## Remarks

Every block handler receives this common structure. The generic `B` parameter provides
the block type ([DialogBlock](DialogBlock.md), [ChoiceBlock](ChoiceBlock.md), etc.) and `C` provides
the type-specific context ([DialogContext](DialogContext.md), [ChoiceContext](ChoiceContext.md), etc.).

The engine uses a **two-tier handler system**:
1. **Tier 2 (scene)**: registered via `handle.onDialog()`, `handle.onChoice()`, etc.
2. **Tier 1 (global)**: registered via `engine.onDialog()`, `engine.onChoice()`, etc.

When a block is dispatched, the scene handler (Tier 2) is called first. The global handler
(Tier 1) is then called **after**, unless `context.preventGlobalHandler()` was invoked.

A block-specific override via `handle.onBlock(uuid, handler)` takes highest priority.

## See

 - [BlockHandler](../type-aliases/BlockHandler.md) for the handler function signature
 - [SceneHandle](SceneHandle.md) for scene-level handler registration
 - [BaseBlockContext.preventGlobalHandler](BaseBlockContext.md#preventglobalhandler) for suppressing Tier 1

## Type Parameters

### B

`B` *extends* [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

### C

`C` *extends* [`BaseBlockContext`](BaseBlockContext.md)

## Properties

### block

> **block**: `B`

Defined in: [types.ts:708](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L708)

The block being executed, typed to match the handler (e.g. `DialogBlock` for `onDialog`).

***

### context

> **context**: `C`

Defined in: [types.ts:710](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L710)

Type-specific context providing actions for this block (e.g. selectChoice, resolve).

***

### next

> **next**: () => `void`

Defined in: [types.ts:712](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L712)

Advance the flow to the next block. Must be called exactly once to continue traversal.

#### Returns

`void`

***

### scene

> **scene**: [`SceneHandle`](SceneHandle.md)

Defined in: [types.ts:706](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L706)

The scene handle that owns this block. Use it to inspect state, cancel the scene, etc.

================================================================================

[LSDE Dialog Engine](../index.md) / BlockMetadata

# Interface: BlockMetadata

Defined in: [types.ts:204](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L204)

Non-logic metadata for display and organization. Should not affect game logic.

## Properties

### characters?

> `optional` **characters?**: [`BlockCharacter`](BlockCharacter.md)[]

Defined in: [types.ts:214](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L214)

Characters (actors) assigned to this block.

***

### color?

> `optional` **color?**: `string`

Defined in: [types.ts:206](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L206)

Visual color coding (hex) assigned by the designer.

***

### comments?

> `optional` **comments?**: `string`

Defined in: [types.ts:208](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L208)

Free-form designer notes. Not displayed to players.

***

### others?

> `optional` **others?**: `Record`\<`string`, `string` \| `number` \| `boolean` \| (`string` \| `number` \| `boolean`)[]\>

Defined in: [types.ts:216](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L216)

Additional designer-defined metadata key-value pairs.

***

### screenShots?

> `optional` **screenShots?**: [`BlockScreenshot`](BlockScreenshot.md)[]

Defined in: [types.ts:212](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L212)

Screenshots captured from the editor for this block.

***

### tags?

> `optional` **tags?**: `string`[]

Defined in: [types.ts:210](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L210)

Contextual tags for categorization and filtering.

================================================================================

[LSDE Dialog Engine](../index.md) / BlockProperty

# Interface: BlockProperty

Defined in: [types.ts:30](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L30)

Generic key-value property attached to a block.

## Properties

### key

> **key**: `string`

Defined in: [types.ts:32](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L32)

Property name or identifier.

***

### value

> **value**: `string` \| `number` \| `boolean`

Defined in: [types.ts:34](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L34)

Property value.

================================================================================

[LSDE Dialog Engine](../index.md) / BlockScreenshot

# Interface: BlockScreenshot

Defined in: [types.ts:196](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L196)

Screenshot or image captured from the editor for documentation.

## Properties

### note?

> `optional` **note?**: `string`

Defined in: [types.ts:200](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L200)

Optional caption or description.

***

### src

> **src**: `string`

Defined in: [types.ts:198](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L198)

Image source as a data URL (base64) or file path.

================================================================================

[LSDE Dialog Engine](../index.md) / BlueprintBlockBase

# Interface: BlueprintBlockBase

Defined in: [types.ts:242](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L242)

Common properties shared by all block types.

## Remarks

All five block types ([DialogBlock](DialogBlock.md), [ChoiceBlock](ChoiceBlock.md), [ConditionBlock](ConditionBlock.md),
[ActionBlock](ActionBlock.md), [NoteBlock](NoteBlock.md)) extend this base. Use the `type` discriminant field
to narrow to a specific block type in TypeScript:

```ts
if (block.type === 'DIALOG') {
  // block is DialogBlock here
  console.log(block.dialogueText);
}
```

The `properties` array contains designer-defined key-value pairs from the editor's block
configuration panel. `userProperties` is a free-form dictionary for narrative-designer data
that doesn't fit the structured property model.

## See

 - [BlueprintBlock](../type-aliases/BlueprintBlock.md) for the discriminated union type
 - [NativeProperties](NativeProperties.md) for execution-related properties
 - [BlockMetadata](BlockMetadata.md) for non-logic display metadata

## Extended by

- [`DialogBlock`](DialogBlock.md)
- [`ChoiceBlock`](ChoiceBlock.md)
- [`ConditionBlock`](ConditionBlock.md)
- [`ActionBlock`](ActionBlock.md)
- [`NoteBlock`](NoteBlock.md)

## Properties

### isStartBlock?

> `optional` **isStartBlock?**: `boolean`

Defined in: [types.ts:260](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L260)

When true, this block is the entry point of the scene. Only one per scene.

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:248](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L248)

Display label assigned in the editor.

***

### metadata?

> `optional` **metadata?**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [types.ts:258](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L258)

Non-logic metadata for display and organization.

***

### nativeProperties?

> `optional` **nativeProperties?**: [`NativeProperties`](NativeProperties.md)

Defined in: [types.ts:256](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L256)

LSDE native execution properties (async, delay, portPerCharacter, etc.).

***

### parentLabels?

> `optional` **parentLabels?**: `string`[]

Defined in: [types.ts:250](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L250)

Hierarchy of parent folder labels providing structural context.

***

### properties

> **properties**: [`BlockProperty`](BlockProperty.md)[]

Defined in: [types.ts:252](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L252)

Custom key-value properties defined by block configuration.

***

### type

> **type**: [`BlockType`](../type-aliases/BlockType.md)

Defined in: [types.ts:246](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L246)

Block type determining behavior and rendering.

***

### userProperties?

> `optional` **userProperties?**: `Record`\<`string`, `string` \| `number` \| `boolean`\>

Defined in: [types.ts:254](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L254)

User-defined custom properties dictionary set by the narrative designer.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:244](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L244)

Unique block identifier.

================================================================================

[LSDE Dialog Engine](../index.md) / BlueprintConnection

# Interface: BlueprintConnection

Defined in: [types.ts:14](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L14)

Directed connection between two blocks in the blueprint. Connections define the dialogue flow by linking output ports of source blocks to input ports of target blocks.

## Properties

### fromId

> **fromId**: `string`

Defined in: [types.ts:18](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L18)

UUID of the source block.

***

### fromPort

> **fromPort**: `string`

Defined in: [types.ts:22](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L22)

Output port identifier on the source block. For CHOICE blocks: the selected choice UUID. For ACTION blocks: `"then"` or `"catch"`.

***

### fromPortIndex?

> `optional` **fromPortIndex?**: `number`

Defined in: [types.ts:26](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L26)

Zero-based index of the output port. For CONDITION blocks: 0 = true, 1 = false. For DIALOG with `portPerCharacter`: index of the character.

***

### id

> **id**: `string`

Defined in: [types.ts:16](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L16)

Unique identifier for this connection.

***

### toId

> **toId**: `string`

Defined in: [types.ts:20](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L20)

UUID of the target block.

***

### toPort

> **toPort**: `string`

Defined in: [types.ts:24](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L24)

Input port identifier on the target block.

================================================================================

[LSDE Dialog Engine](../index.md) / BlueprintExport

# Interface: BlueprintExport

Defined in: [types.ts:544](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L544)

Root container for exported blueprint data.

## Remarks

This is the top-level JSON structure exported by the LS-Dialog editor. Pass it to
`engine.init({ data })` to load and validate the blueprint. The engine indexes all scenes,
blocks, and connections internally — the original object is not mutated.

The `locales` array lists all available languages. Call `engine.setLocale(code)` to store
the active locale — your handlers are responsible for reading the appropriate key from
`DialogBlock.dialogueText` and `ChoiceItem.dialogueText`.

Use the optional `check` parameter in `init()` to cross-validate blueprint references
(signatures, dictionaries, characters) against your game's known capabilities.

## Example

```ts
import blueprint from './blueprint.json';

const engine = new DialogueEngine();
const report = engine.init({
  data: blueprint as BlueprintExport,
  check: {
    signatures: ['set_flag', 'play_sound'],
    characters: ['Alice', 'Bob'],
  },
});

if (report.errors.length > 0) {
  console.error('Invalid blueprint:', report.errors);
}
```

## See

 - [BlueprintScene](BlueprintScene.md) for scene structure
 - [ActionSignature](ActionSignature.md) for action type definitions
 - [Dictionary](Dictionary.md) for dictionary groups
 - [DiagnosticReport](DiagnosticReport.md) for validation results

## Properties

### dictionaries?

> `optional` **dictionaries?**: [`Dictionary`](Dictionary.md)[]

Defined in: [types.ts:556](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L556)

Dictionary groups for conditions and action parameters.

***

### exportDate

> **exportDate**: `string`

Defined in: [types.ts:548](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L548)

ISO 8601 timestamp of when this export was generated.

***

### locales

> **locales**: `string`[]

Defined in: [types.ts:554](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L554)

All language locale codes included in this export.

***

### primaryLanguage?

> `optional` **primaryLanguage?**: `string`

Defined in: [types.ts:552](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L552)

Primary language locale code (e.g. "fr", "en").

***

### projectName?

> `optional` **projectName?**: `string`

Defined in: [types.ts:550](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L550)

Name of the LSDE project.

***

### scenes

> **scenes**: [`BlueprintScene`](BlueprintScene.md)[]

Defined in: [types.ts:560](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L560)

All exported scenes.

***

### signatures?

> `optional` **signatures?**: [`ActionSignature`](ActionSignature.md)[]

Defined in: [types.ts:558](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L558)

Action signature definitions describing available action types.

***

### version

> **version**: `string`

Defined in: [types.ts:546](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L546)

Schema version of this export format.

================================================================================

[LSDE Dialog Engine](../index.md) / BlueprintScene

# Interface: BlueprintScene

Defined in: [types.ts:451](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L451)

A scene — an independent dialogue subgraph with its own entry point.

## Remarks

A scene is the unit of execution in the engine. Call `engine.scene(uuid)` to obtain a
[SceneHandle](SceneHandle.md), then `handle.start()` to begin traversing from `entryBlockId`.

The `blocks` array contains all blocks in this scene. The `connections` array defines the
directed edges between blocks (output port → input port). Together they form a directed
graph that the engine traverses at runtime.

Multiple scenes can run concurrently — each gets its own `SceneHandle` with independent
state, visited blocks, and async tracks.

## Example

```ts
const sceneId = blueprint.scenes[0].uuid;
const handle = engine.scene(sceneId);
handle.onDialog(({ block, next }) => { next(); });
handle.start();
```

## See

 - [SceneHandle](SceneHandle.md) for runtime scene control
 - [BlueprintConnection](BlueprintConnection.md) for edge structure
 - [BlueprintBlock](../type-aliases/BlueprintBlock.md) for block types

## Properties

### blocks

> **blocks**: [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)[]

Defined in: [types.ts:463](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L463)

All blocks contained within this scene.

***

### connections

> **connections**: [`BlueprintConnection`](BlueprintConnection.md)[]

Defined in: [types.ts:465](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L465)

All connections defining the dialogue flow in this scene.

***

### date

> **date**: `string`

Defined in: [types.ts:461](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L461)

Scene creation or last modification date.

***

### entryBlockId?

> `optional` **entryBlockId?**: `string`

Defined in: [types.ts:459](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L459)

UUID of the entry block for this scene.

***

### label

> **label**: `string`

Defined in: [types.ts:455](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L455)

Scene name assigned by the designer.

***

### note?

> `optional` **note?**: `string`

Defined in: [types.ts:457](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L457)

Scene-level designer notes.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:453](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L453)

Unique scene identifier.

================================================================================

[LSDE Dialog Engine](../index.md) / CheckOptions

# Interface: CheckOptions

Defined in: [types.ts:592](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L592)

Options for cross-validating blueprint data against game capabilities. When provided, the engine warns about blueprint references that don't match your game's known capabilities.

## Properties

### characters?

> `optional` **characters?**: `string`[]

Defined in: [types.ts:598](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L598)

Known character names in your game. Blueprint blocks referencing unknown characters will produce warnings.

***

### dictionaries?

> `optional` **dictionaries?**: `Record`\<`string`, `string`[]\>

Defined in: [types.ts:596](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L596)

Known dictionary groups and their row keys. Blueprint references to unknown groups/keys will produce warnings.

***

### signatures?

> `optional` **signatures?**: `string`[]

Defined in: [types.ts:594](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L594)

Known action signature IDs in your game. Blueprint actions referencing unknown IDs will produce warnings.

================================================================================

[LSDE Dialog Engine](../index.md) / ChoiceBlock

# Interface: ChoiceBlock

Defined in: [types.ts:327](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L327)

Choice block — presents selectable options to the player.

## Remarks

The `context.choices` array contains ALL choices — none are filtered out.
When [onResolveCondition()](IDialogueEngine.md#onresolvecondition) is configured, the engine
evaluates each choice's `visibilityConditions` and tags every [RuntimeChoiceItem](RuntimeChoiceItem.md) with
`visible: true | false`. The developer filters with `choices.filter(c => c.visible !== false)`.
Without a filter, `visible` is `undefined` and all choices pass.

The handler must call `context.selectChoice(uuid)` to pick a choice. The engine then follows
the connection whose `fromPort` matches the selected choice UUID.

If no `onChoice` handler is registered, the engine silently advances with no selection — the
flow may end if no default connection exists.

## Example

```ts
engine.onChoice(({ context, next }) => {
  showChoicesUI(context.choices, (selectedUuid) => {
    context.selectChoice(selectedUuid);
    next();
  });
});
```

## See

 - [ChoiceItem](ChoiceItem.md) for choice structure
 - [ChoiceContext](ChoiceContext.md) for handler context
 - [ExportCondition](ExportCondition.md) for visibility conditions

## Extends

- [`BlueprintBlockBase`](BlueprintBlockBase.md)

## Properties

### choices?

> `optional` **choices?**: [`ChoiceItem`](ChoiceItem.md)[]

Defined in: [types.ts:330](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L330)

Available player choices. Visibility is filtered at runtime via `visibilityConditions`.

***

### isStartBlock?

> `optional` **isStartBlock?**: `boolean`

Defined in: [types.ts:260](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L260)

When true, this block is the entry point of the scene. Only one per scene.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`isStartBlock`](BlueprintBlockBase.md#isstartblock)

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:248](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L248)

Display label assigned in the editor.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`label`](BlueprintBlockBase.md#label)

***

### metadata?

> `optional` **metadata?**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [types.ts:258](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L258)

Non-logic metadata for display and organization.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`metadata`](BlueprintBlockBase.md#metadata)

***

### nativeProperties?

> `optional` **nativeProperties?**: [`NativeProperties`](NativeProperties.md)

Defined in: [types.ts:256](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L256)

LSDE native execution properties (async, delay, portPerCharacter, etc.).

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`nativeProperties`](BlueprintBlockBase.md#nativeproperties)

***

### note?

> `optional` **note?**: `string`

Defined in: [types.ts:332](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L332)

Designer note. Not displayed to players.

***

### parentLabels?

> `optional` **parentLabels?**: `string`[]

Defined in: [types.ts:250](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L250)

Hierarchy of parent folder labels providing structural context.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`parentLabels`](BlueprintBlockBase.md#parentlabels)

***

### properties

> **properties**: [`BlockProperty`](BlockProperty.md)[]

Defined in: [types.ts:252](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L252)

Custom key-value properties defined by block configuration.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`properties`](BlueprintBlockBase.md#properties)

***

### type

> **type**: `"CHOICE"`

Defined in: [types.ts:328](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L328)

Block type determining behavior and rendering.

#### Overrides

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`type`](BlueprintBlockBase.md#type)

***

### userProperties?

> `optional` **userProperties?**: `Record`\<`string`, `string` \| `number` \| `boolean`\>

Defined in: [types.ts:254](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L254)

User-defined custom properties dictionary set by the narrative designer.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`userProperties`](BlueprintBlockBase.md#userproperties)

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:244](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L244)

Unique block identifier.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`uuid`](BlueprintBlockBase.md#uuid)

================================================================================

[LSDE Dialog Engine](../index.md) / ChoiceContext

# Interface: ChoiceContext

Defined in: [types.ts:635](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L635)

Context for CHOICE block handlers.

## Extends

- [`BaseBlockContext`](BaseBlockContext.md)

## Properties

### character

> **character**: [`BlockCharacter`](BlockCharacter.md) \| `undefined`

Defined in: [types.ts:623](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L623)

Character resolved by the `onResolveCharacter` callback for this block, or `undefined` if none.

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`character`](BaseBlockContext.md#character)

***

### choices

> **choices**: [`RuntimeChoiceItem`](RuntimeChoiceItem.md)[]

Defined in: [types.ts:641](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L641)

All choices with optional visibility tags. When `engine.onResolveCondition()` is configured,
each choice is tagged `visible: true | false`. Filter with `choices.filter(c => c.visible !== false)`.
Without a filter, `visible` is `undefined` and all choices pass.

***

### preventGlobalHandler

> **preventGlobalHandler**: () => `void`

Defined in: [types.ts:625](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L625)

Prevent the global (Tier 1) handler from executing after this scene handler.

#### Returns

`void`

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`preventGlobalHandler`](BaseBlockContext.md#preventglobalhandler)

***

### selectChoice

> **selectChoice**: (`choiceUuid`) => `void`

Defined in: [types.ts:643](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L643)

Select a choice by UUID. The engine follows the matching port.

#### Parameters

##### choiceUuid

`string`

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / ChoiceItem

# Interface: ChoiceItem

Defined in: [types.ts:83](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L83)

Player choice option within a choice block.

## Extended by

- [`RuntimeChoiceItem`](RuntimeChoiceItem.md)

## Properties

### dialogueText?

> `optional` **dialogueText?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:91](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L91)

Localized text map: `{ locale -> text }`.

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:89](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L89)

Display label for editor reference.

***

### structureKey

> **structureKey**: `string`

Defined in: [types.ts:87](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L87)

Hierarchical key for localization lookup.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:85](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L85)

Unique identifier for this choice.

***

### visibilityConditions?

> `optional` **visibilityConditions?**: [`ExportCondition`](ExportCondition.md)[]

Defined in: [types.ts:93](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L93)

Conditions controlling whether this choice is visible. If all pass (or none set), the choice is shown.

================================================================================

[LSDE Dialog Engine](../index.md) / ConditionBlock

# Interface: ConditionBlock

Defined in: [types.ts:369](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L369)

Condition block — evaluates logic to branch the dialogue flow.

## Remarks

Conditions are organized as a 2D array of groups (`ExportCondition[][]`).
Each inner array is a "case" — conditions chained with `&` (AND) / `|` (OR).

**Single group** (classic true/false): `[[c1, c2]]` — `resolve(true)` → port 0, `resolve(false)` → port 1.

**Multiple groups** (switch mode): `[[c1], [c2], [c3]]` — groups are evaluated in order,
first matching group routes to its port (`case_0`, `case_1`, ...), otherwise routes to `default`.
Call `context.resolve(matchingIndex)` or `context.resolve(-1)` for default.

**Dispatcher mode** (`nativeProperties.enableDispatcher = true`): all groups are evaluated,
every matching group fires its port as an async track, and the `default` port is the main
continuation track (always executed). Call `context.resolve(matchingIndices[])`.

## Example

```ts
engine.onCondition(({ block, context, next }) => {
  const result = LsdeUtils.evaluateConditionGroups(
    block.conditions ?? [],
    (cond) => myEvaluator(cond),
    !!block.nativeProperties?.enableDispatcher,
  );
  context.resolve(result);
  next();
});
```

## See

 - [ExportCondition](ExportCondition.md) for condition structure and chaining rules
 - [ConditionContext](ConditionContext.md) for handler context
 - [NativeProperties.enableDispatcher](NativeProperties.md#enabledispatcher) for dispatcher mode

## Extends

- [`BlueprintBlockBase`](BlueprintBlockBase.md)

## Properties

### conditions?

> `optional` **conditions?**: [`ExportCondition`](ExportCondition.md)[][]

Defined in: [types.ts:375](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L375)

2D array of condition groups. Each inner array is a "case" — conditions chained with `&` / `|`.
Single group: classic true/false branching. Multiple groups: switch mode (case_0..N / default).

***

### isStartBlock?

> `optional` **isStartBlock?**: `boolean`

Defined in: [types.ts:260](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L260)

When true, this block is the entry point of the scene. Only one per scene.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`isStartBlock`](BlueprintBlockBase.md#isstartblock)

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:248](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L248)

Display label assigned in the editor.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`label`](BlueprintBlockBase.md#label)

***

### metadata?

> `optional` **metadata?**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [types.ts:258](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L258)

Non-logic metadata for display and organization.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`metadata`](BlueprintBlockBase.md#metadata)

***

### nativeProperties?

> `optional` **nativeProperties?**: [`NativeProperties`](NativeProperties.md)

Defined in: [types.ts:256](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L256)

LSDE native execution properties (async, delay, portPerCharacter, etc.).

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`nativeProperties`](BlueprintBlockBase.md#nativeproperties)

***

### note?

> `optional` **note?**: `string`

Defined in: [types.ts:377](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L377)

Designer note. Not displayed to players.

***

### parentLabels?

> `optional` **parentLabels?**: `string`[]

Defined in: [types.ts:250](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L250)

Hierarchy of parent folder labels providing structural context.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`parentLabels`](BlueprintBlockBase.md#parentlabels)

***

### properties

> **properties**: [`BlockProperty`](BlockProperty.md)[]

Defined in: [types.ts:252](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L252)

Custom key-value properties defined by block configuration.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`properties`](BlueprintBlockBase.md#properties)

***

### type

> **type**: `"CONDITION"`

Defined in: [types.ts:370](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L370)

Block type determining behavior and rendering.

#### Overrides

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`type`](BlueprintBlockBase.md#type)

***

### userProperties?

> `optional` **userProperties?**: `Record`\<`string`, `string` \| `number` \| `boolean`\>

Defined in: [types.ts:254](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L254)

User-defined custom properties dictionary set by the narrative designer.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`userProperties`](BlueprintBlockBase.md#userproperties)

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:244](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L244)

Unique block identifier.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`uuid`](BlueprintBlockBase.md#uuid)

================================================================================

[LSDE Dialog Engine](../index.md) / ConditionContext

# Interface: ConditionContext

Defined in: [types.ts:647](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L647)

Context for CONDITION block handlers.

## Extends

- [`BaseBlockContext`](BaseBlockContext.md)

## Properties

### character

> **character**: [`BlockCharacter`](BlockCharacter.md) \| `undefined`

Defined in: [types.ts:623](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L623)

Character resolved by the `onResolveCharacter` callback for this block, or `undefined` if none.

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`character`](BaseBlockContext.md#character)

***

### conditionGroups

> **conditionGroups**: [`RuntimeConditionGroup`](RuntimeConditionGroup.md)[]

Defined in: [types.ts:653](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L653)

All condition groups with optional pre-evaluated results.
When [onResolveCondition()](IDialogueEngine.md#onresolvecondition) is configured,
each group has `result: true | false`. Without a resolver, `result` is `undefined`.

***

### preventGlobalHandler

> **preventGlobalHandler**: () => `void`

Defined in: [types.ts:625](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L625)

Prevent the global (Tier 1) handler from executing after this scene handler.

#### Returns

`void`

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`preventGlobalHandler`](BaseBlockContext.md#preventglobalhandler)

***

### resolve

> **resolve**: (`result`) => `void`

Defined in: [types.ts:660](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L660)

Resolve the condition evaluation result.
- `boolean`: legacy single-group mode — `true` → port index 0, `false` → port index 1.
- `number`: switch mode — `>= 0` follows the matching case port, `< 0` follows `default`.
- `number[]`: dispatcher mode — all matching case indices fire as async tracks, `default` is the main track.

#### Parameters

##### result

`number` \| `boolean` \| `number`[]

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / DiagnosticEntry

# Interface: DiagnosticEntry

Defined in: [types.ts:566](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L566)

Single diagnostic entry (error or warning).

## Properties

### blockId?

> `optional` **blockId?**: `string`

Defined in: [types.ts:574](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L574)

UUID of the block where the issue was found, if applicable.

***

### code

> **code**: `string`

Defined in: [types.ts:568](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L568)

Machine-readable error/warning code (e.g. "NO_ENTRY_BLOCK", "ORPHAN_CONNECTION").

***

### message

> **message**: `string`

Defined in: [types.ts:570](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L570)

Human-readable description of the issue.

***

### sceneId?

> `optional` **sceneId?**: `string`

Defined in: [types.ts:572](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L572)

UUID of the scene where the issue was found, if applicable.

================================================================================

[LSDE Dialog Engine](../index.md) / DiagnosticReport

# Interface: DiagnosticReport

Defined in: [types.ts:585](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L585)

Result of `engine.init()` — validation report.

## Properties

### errors

> **errors**: [`DiagnosticEntry`](DiagnosticEntry.md)[]

Defined in: [types.ts:586](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L586)

***

### stats

> **stats**: [`DiagnosticStats`](DiagnosticStats.md)

Defined in: [types.ts:588](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L588)

***

### warnings

> **warnings**: [`DiagnosticEntry`](DiagnosticEntry.md)[]

Defined in: [types.ts:587](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L587)

================================================================================

[LSDE Dialog Engine](../index.md) / DiagnosticStats

# Interface: DiagnosticStats

Defined in: [types.ts:578](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L578)

Aggregate statistics from blueprint validation.

## Properties

### blockCount

> **blockCount**: `number`

Defined in: [types.ts:580](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L580)

***

### connectionCount

> **connectionCount**: `number`

Defined in: [types.ts:581](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L581)

***

### sceneCount

> **sceneCount**: `number`

Defined in: [types.ts:579](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L579)

================================================================================

[LSDE Dialog Engine](../index.md) / DialogBlock

# Interface: DialogBlock

Defined in: [types.ts:287](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L287)

Dialog block — displays text spoken by a character.

## Remarks

The character is resolved by the `onResolveCharacter` callback and exposed as `context.character` in the handler.
When `nativeProperties.portPerCharacter` is enabled, each character gets a dedicated output port
and the handler must call `context.resolveCharacterPort(character.uuid)` to select which port to follow.

If no `onDialog` handler is registered, the engine silently advances to the next block.

## Example

```ts
engine.onDialog(({ block, context, next }) => {
  const text = block.dialogueText?.['en'] ?? '';
  const char = context.character;
  showDialogUI(char?.name, text);
  next();
});
```

## See

 - [DialogContext](DialogContext.md) for handler context
 - [BlockCharacter](BlockCharacter.md) for character data
 - [NativeProperties.portPerCharacter](NativeProperties.md#portpercharacter) for multi-port routing

## Extends

- [`BlueprintBlockBase`](BlueprintBlockBase.md)

## Properties

### content?

> `optional` **content?**: `string`

Defined in: [types.ts:292](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L292)

Raw text content in the primary language.

***

### dialogueText?

> `optional` **dialogueText?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:294](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L294)

Localized text map: `{ locale -> text }`.

***

### isStartBlock?

> `optional` **isStartBlock?**: `boolean`

Defined in: [types.ts:260](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L260)

When true, this block is the entry point of the scene. Only one per scene.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`isStartBlock`](BlueprintBlockBase.md#isstartblock)

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:248](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L248)

Display label assigned in the editor.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`label`](BlueprintBlockBase.md#label)

***

### metadata?

> `optional` **metadata?**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [types.ts:258](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L258)

Non-logic metadata for display and organization.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`metadata`](BlueprintBlockBase.md#metadata)

***

### nativeProperties?

> `optional` **nativeProperties?**: [`NativeProperties`](NativeProperties.md)

Defined in: [types.ts:256](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L256)

LSDE native execution properties (async, delay, portPerCharacter, etc.).

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`nativeProperties`](BlueprintBlockBase.md#nativeproperties)

***

### parentLabels?

> `optional` **parentLabels?**: `string`[]

Defined in: [types.ts:250](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L250)

Hierarchy of parent folder labels providing structural context.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`parentLabels`](BlueprintBlockBase.md#parentlabels)

***

### properties

> **properties**: [`BlockProperty`](BlockProperty.md)[]

Defined in: [types.ts:252](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L252)

Custom key-value properties defined by block configuration.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`properties`](BlueprintBlockBase.md#properties)

***

### structureKey?

> `optional` **structureKey?**: `string`

Defined in: [types.ts:290](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L290)

Hierarchical key for tree navigation and localization lookup.

***

### type

> **type**: `"DIALOG"`

Defined in: [types.ts:288](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L288)

Block type determining behavior and rendering.

#### Overrides

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`type`](BlueprintBlockBase.md#type)

***

### userProperties?

> `optional` **userProperties?**: `Record`\<`string`, `string` \| `number` \| `boolean`\>

Defined in: [types.ts:254](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L254)

User-defined custom properties dictionary set by the narrative designer.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`userProperties`](BlueprintBlockBase.md#userproperties)

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:244](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L244)

Unique block identifier.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`uuid`](BlueprintBlockBase.md#uuid)

================================================================================

[LSDE Dialog Engine](../index.md) / DialogContext

# Interface: DialogContext

Defined in: [types.ts:629](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L629)

Context for DIALOG block handlers.

## Extends

- [`BaseBlockContext`](BaseBlockContext.md)

## Properties

### character

> **character**: [`BlockCharacter`](BlockCharacter.md) \| `undefined`

Defined in: [types.ts:623](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L623)

Character resolved by the `onResolveCharacter` callback for this block, or `undefined` if none.

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`character`](BaseBlockContext.md#character)

***

### preventGlobalHandler

> **preventGlobalHandler**: () => `void`

Defined in: [types.ts:625](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L625)

Prevent the global (Tier 1) handler from executing after this scene handler.

#### Returns

`void`

#### Inherited from

[`BaseBlockContext`](BaseBlockContext.md).[`preventGlobalHandler`](BaseBlockContext.md#preventglobalhandler)

***

### resolveCharacterPort

> **resolveCharacterPort**: (`characterUuid`) => `void`

Defined in: [types.ts:631](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L631)

When portPerCharacter is enabled, specify which character port to follow.

#### Parameters

##### characterUuid

`string`

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / Dictionary

# Interface: Dictionary

Defined in: [types.ts:475](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L475)

Dictionary group defining reusable key-value pairs for conditions and actions.

## Properties

### id

> **id**: `string`

Defined in: [types.ts:479](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L479)

Developer-defined identifier, used as prefix in condition keys (e.g. `"groupId.rowKey"`).

***

### rows

> **rows**: [`DictionaryRow`](DictionaryRow.md)[]

Defined in: [types.ts:481](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L481)

All entries in this dictionary group.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:477](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L477)

Unique identifier for this dictionary group.

================================================================================

[LSDE Dialog Engine](../index.md) / DictionaryRow

# Interface: DictionaryRow

Defined in: [types.ts:469](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L469)

A single entry in a dictionary group.

## Properties

### key

> **key**: `string`

Defined in: [types.ts:471](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L471)

Key identifier referenced in conditions and action parameters.

================================================================================

[LSDE Dialog Engine](../index.md) / ExportAction

# Interface: ExportAction

Defined in: [types.ts:71](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L71)

Action triggered during block execution.

## Properties

### actionId

> **actionId**: `string`

Defined in: [types.ts:77](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L77)

Action type identifier matching an `ActionSignature.id` (e.g. "set_flag", "play_sound"). The dev maps this to game-side functions.

***

### params

> **params**: (`string` \| `number` \| `boolean`)[]

Defined in: [types.ts:79](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L79)

Ordered parameter values for the action, as defined by the matching `ActionSignature.params`.

***

### signatureUuid?

> `optional` **signatureUuid?**: `string`

Defined in: [types.ts:75](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L75)

UUID of the `ActionSignature` this action references.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:73](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L73)

Unique identifier for this action instance.

================================================================================

[LSDE Dialog Engine](../index.md) / ExportCondition

# Interface: ExportCondition

Defined in: [types.ts:57](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L57)

Condition evaluated to control dialogue flow or choice visibility.

## Remarks

Conditions are evaluated **left-to-right with no operator precedence**. The `chain` field
on each condition determines how it combines with the accumulated result:

- Empty array → `true` (no conditions = pass)
- First condition → its raw boolean result (`chain` is ignored)
- `chain = '&'` or absent → AND with the accumulated result
- `chain = '|'` → OR with the accumulated result

This means `A AND B OR C` evaluates as `(A AND B) OR C`, not `A AND (B OR C)`.

The developer is responsible for interpreting `key`, `operator`, and `value` against
the game state via the `onCondition` handler — the engine only handles the chaining logic.

## See

 - [ConditionBlock](ConditionBlock.md) for condition blocks
 - [ChoiceItem.visibilityConditions](ChoiceItem.md#visibilityconditions) for choice filtering

## Properties

### chain?

> `optional` **chain?**: "\|" \| `"&"`

Defined in: [types.ts:63](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L63)

Logical chaining with the previous condition: `'|'` (OR) or `'&'` (AND). Defaults to AND if omitted. Ignored on the first condition in a chain.

***

### key

> **key**: `string`

Defined in: [types.ts:61](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L61)

State key to evaluate (e.g. "has_item", "player_level"). Interpreted by the `onCondition` handler.

***

### operator

> **operator**: `string`

Defined in: [types.ts:65](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L65)

Comparison operator (e.g. "==", "!=", ">", "<", ">=", "<="). Interpretation is up to the `onCondition` handler.

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:59](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L59)

Unique identifier for this condition instance.

***

### value

> **value**: `string`

Defined in: [types.ts:67](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L67)

Value to compare against. Always a string — the developer is responsible for type coercion.

================================================================================

[LSDE Dialog Engine](../index.md) / IDialogueEngine

# Interface: IDialogueEngine

Defined in: [types.ts:955](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L955)

Public interface for the dialogue engine facade.

## Remarks

This is the top-level entry point for the LSDEDE runtime. It manages blueprint loading,
global handler registration, and scene creation. Use [SceneHandle](SceneHandle.md) for per-scene control.

## See

[SceneHandle](SceneHandle.md) for per-scene runtime control

## Methods

### getActiveScenes()

> **getActiveScenes**(): [`SceneHandle`](SceneHandle.md)[]

Defined in: [types.ts:1027](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1027)

Get all currently active scene handles.

#### Returns

[`SceneHandle`](SceneHandle.md)[]

***

### getCurrentBlocks()

> **getCurrentBlocks**(): [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)[]

Defined in: [types.ts:1029](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1029)

Get the current block of every active scene.

#### Returns

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md)[]

***

### getSceneConnections()

> **getSceneConnections**(`sceneId`): [`BlueprintConnection`](BlueprintConnection.md)[]

Defined in: [types.ts:1031](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1031)

Get connections for a scene (for inter-scene navigation).

#### Parameters

##### sceneId

`string`

#### Returns

[`BlueprintConnection`](BlueprintConnection.md)[]

***

### init()

> **init**(`options`): [`DiagnosticReport`](DiagnosticReport.md)

Defined in: [types.ts:959](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L959)

Validate blueprint data, build internal graph, return diagnostic report.

#### Parameters

##### options

[`InitOptions`](InitOptions.md)

#### Returns

[`DiagnosticReport`](DiagnosticReport.md)

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [types.ts:1025](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1025)

True if at least one scene is active.

#### Returns

`boolean`

***

### onAction()

> **onAction**(`handler`): `void`

Defined in: [types.ts:984](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L984)

Register a global handler for ACTION blocks. The developer MUST handle execution in this handler.

#### Parameters

##### handler

[`ActionHandler`](../type-aliases/ActionHandler.md)

#### Returns

`void`

***

### onBeforeBlock()

> **onBeforeBlock**(`handler`): `void`

Defined in: [types.ts:973](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L973)

Register a handler called before every block. Must call resolve() to continue.

#### Parameters

##### handler

[`BeforeBlockHandler`](../type-aliases/BeforeBlockHandler.md)

#### Returns

`void`

***

### onChoice()

> **onChoice**(`handler`): `void`

Defined in: [types.ts:980](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L980)

Register a global handler for CHOICE blocks. All choices are provided, tagged with `visible` when `onResolveCondition()` is configured.

#### Parameters

##### handler

[`ChoiceHandler`](../type-aliases/ChoiceHandler.md)

#### Returns

`void`

***

### onCondition()

> **onCondition**(`handler`): `void`

Defined in: [types.ts:982](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L982)

Register a global handler for CONDITION blocks. The developer MUST handle evaluation in this handler.

#### Parameters

##### handler

[`ConditionHandler`](../type-aliases/ConditionHandler.md)

#### Returns

`void`

***

### onDialog()

> **onDialog**(`handler`): `void`

Defined in: [types.ts:978](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L978)

Register a global handler for DIALOG blocks. May return a cleanup function.

#### Parameters

##### handler

[`DialogHandler`](../type-aliases/DialogHandler.md)

#### Returns

`void`

***

### onInvalidateBlock()

> **onInvalidateBlock**(`handler`): `void`

Defined in: [types.ts:968](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L968)

Register a handler called when a block fails validation.

#### Parameters

##### handler

[`InvalidateBlockHandler`](../type-aliases/InvalidateBlockHandler.md)

#### Returns

`void`

***

### onResolveCharacter()

> **onResolveCharacter**(`fn`): `void`

Defined in: [types.ts:989](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L989)

Register a global character resolver. Called for every block with `metadata.characters`.

#### Parameters

##### fn

(`characters`) => [`BlockCharacter`](BlockCharacter.md) \| `undefined`

#### Returns

`void`

***

### onResolveCondition()

> **onResolveCondition**(`evaluator`): `void`

Defined in: [types.ts:1003](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1003)

Install a unified condition evaluator for both choice visibility and condition block pre-evaluation.
The engine handles `choice:` conditions internally via choice history — this callback
evaluates game-state conditions only.

When installed:
- Choice blocks: each choice is tagged with `visible: true | false` based on its `visibilityConditions`.
- Condition blocks: each group is pre-evaluated and the result is available in `context.groups[i].result`
  and `context.evaluation`.

#### Parameters

##### evaluator

(`condition`) => `boolean`

#### Returns

`void`

***

### onSceneEnter()

> **onSceneEnter**(`handler`): `void`

Defined in: [types.ts:1011](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1011)

Register a handler called when any scene starts.

#### Parameters

##### handler

[`SceneLifecycleHandler`](../type-aliases/SceneLifecycleHandler.md)

#### Returns

`void`

***

### onSceneExit()

> **onSceneExit**(`handler`): `void`

Defined in: [types.ts:1013](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1013)

Register a handler called when any scene ends (natural or cancelled).

#### Parameters

##### handler

[`SceneLifecycleHandler`](../type-aliases/SceneLifecycleHandler.md)

#### Returns

`void`

***

### onValidateNextBlock()

> **onValidateNextBlock**(`handler`): `void`

Defined in: [types.ts:966](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L966)

Register a handler called before each block to validate it.

#### Parameters

##### handler

[`ValidateNextBlockHandler`](../type-aliases/ValidateNextBlockHandler.md)

#### Returns

`void`

***

### scene()

> **scene**(`sceneId`): [`SceneHandle`](SceneHandle.md)

Defined in: [types.ts:1018](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1018)

Create a scene handle. Does NOT start the flow — call handle.start().

#### Parameters

##### sceneId

`string`

#### Returns

[`SceneHandle`](SceneHandle.md)

***

### ~~setChoiceFilter()~~

> **setChoiceFilter**(`evaluator`): `void`

Defined in: [types.ts:1006](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1006)

#### Parameters

##### evaluator

(`condition`) => `boolean`

#### Returns

`void`

#### Deprecated

Use [onResolveCondition](#onresolvecondition) instead.

***

### setLocale()

> **setLocale**(`locale`): `void`

Defined in: [types.ts:961](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L961)

Set the active locale for text resolution.

#### Parameters

##### locale

`string`

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [types.ts:1023](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1023)

Stop all active scenes.

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / InitOptions

# Interface: InitOptions

Defined in: [types.ts:602](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L602)

Options passed to `engine.init()`.

## Properties

### check?

> `optional` **check?**: [`CheckOptions`](CheckOptions.md)

Defined in: [types.ts:604](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L604)

***

### data

> **data**: [`BlueprintExport`](BlueprintExport.md)

Defined in: [types.ts:603](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L603)

================================================================================

[LSDE Dialog Engine](../index.md) / InvalidateBlockArgs

# Interface: InvalidateBlockArgs

Defined in: [types.ts:806](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L806)

Arguments for the onInvalidateBlock handler.

## Properties

### reason

> **reason**: `string`

Defined in: [types.ts:808](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L808)

***

### scene

> **scene**: [`SceneHandle`](SceneHandle.md)

Defined in: [types.ts:807](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L807)

================================================================================

[LSDE Dialog Engine](../index.md) / NativeProperties

# Interface: NativeProperties

Defined in: [types.ts:144](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L144)

LSDE native execution properties controlling how a block is dispatched by the engine.

## Remarks

These properties affect the engine's execution flow, not the block's content:

- **Async tracks**: When `isAsync = true`, the block runs on a parallel track independent
  of the main flow. Async tracks skip `onBeforeBlock`, follow only one connection, and are
  automatically cancelled when the scene ends.

- **waitForBlocks**: When set, the block defers its advance until ALL listed block UUIDs
  have been visited in the scene. This enables precise synchronization between parallel
  async branches (e.g. a character waits for another to finish before reacting).

- **delay**: Consumed by `onBeforeBlock` — the engine does not enforce it automatically.
  Your `onBeforeBlock` handler should read `block.nativeProperties.delay` and call
  `resolve()` after the delay.

- **portPerCharacter**: Creates one output port per character in `metadata.characters`.
  The DIALOG handler must call `context.resolveCharacterPort(character.uuid)` to pick which port
  to follow.

## See

 - [DialogBlock](DialogBlock.md) for portPerCharacter usage
 - [BeforeBlockArgs](BeforeBlockArgs.md) for delay handling

## Properties

### debug?

> `optional` **debug?**: `boolean`

Defined in: [types.ts:152](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L152)

Enable debug mode for this block (editor use).

***

### delay?

> `optional` **delay?**: `number`

Defined in: [types.ts:148](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L148)

Delay in seconds before the block is executed. Applied by the `onBeforeBlock` handler.

***

### enableDispatcher?

> `optional` **enableDispatcher?**: `boolean`

Defined in: [types.ts:178](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L178)

Dispatcher mode for CONDITION blocks. When `true`, all condition groups are evaluated
and every matching group fires its port as an async track. The `default`/`false` port
becomes the main continuation track (always executed).
When `false` or absent, the standard switch behavior applies: first matching group wins.

***

### isAsync?

> `optional` **isAsync?**: `boolean`

Defined in: [types.ts:146](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L146)

Execute this block on a separate async track running in parallel with the main flow.

***

### portPerCharacter?

> `optional` **portPerCharacter?**: `boolean`

Defined in: [types.ts:154](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L154)

One output port per character in `metadata.characters`. The handler calls `resolveCharacterPort()` to pick which port to follow.

***

### skipIfMissingActor?

> `optional` **skipIfMissingActor?**: `boolean`

Defined in: [types.ts:156](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L156)

Skip this block entirely if the assigned actor/character is missing at runtime.

***

### timeout?

> `optional` **timeout?**: `number`

Defined in: [types.ts:150](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L150)

Timeout in seconds for block execution.

***

### waitForBlocks?

> `optional` **waitForBlocks?**: `string`[]

Defined in: [types.ts:164](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L164)

UUIDs of blocks that must have been visited before this block can progress.
When `next()` is called and not all listed blocks are in `visitedBlocks`,
the block defers its advance. Once the last required block is visited
anywhere in the scene (main or async track), the deferred advance fires.
Enables precise synchronization of parallel async branches.

***

### waitInput?

> `optional` **waitInput?**: `boolean`

Defined in: [types.ts:171](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L171)

Passive flag indicating this block should wait for explicit player input
or an engine-specific signal before proceeding. The engine does NOT
interpret this flag — it is exposed as-is to game handlers.
Use case: second player controller, custom input events, etc.

================================================================================

[LSDE Dialog Engine](../index.md) / NoteBlock

# Interface: NoteBlock

Defined in: [types.ts:418](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L418)

Note block — designer documentation, never executed at runtime.

## Extends

- [`BlueprintBlockBase`](BlueprintBlockBase.md)

## Properties

### isStartBlock?

> `optional` **isStartBlock?**: `boolean`

Defined in: [types.ts:260](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L260)

When true, this block is the entry point of the scene. Only one per scene.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`isStartBlock`](BlueprintBlockBase.md#isstartblock)

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:248](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L248)

Display label assigned in the editor.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`label`](BlueprintBlockBase.md#label)

***

### metadata?

> `optional` **metadata?**: [`BlockMetadata`](BlockMetadata.md)

Defined in: [types.ts:258](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L258)

Non-logic metadata for display and organization.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`metadata`](BlueprintBlockBase.md#metadata)

***

### nativeProperties?

> `optional` **nativeProperties?**: [`NativeProperties`](NativeProperties.md)

Defined in: [types.ts:256](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L256)

LSDE native execution properties (async, delay, portPerCharacter, etc.).

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`nativeProperties`](BlueprintBlockBase.md#nativeproperties)

***

### parentLabels?

> `optional` **parentLabels?**: `string`[]

Defined in: [types.ts:250](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L250)

Hierarchy of parent folder labels providing structural context.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`parentLabels`](BlueprintBlockBase.md#parentlabels)

***

### properties

> **properties**: [`BlockProperty`](BlockProperty.md)[]

Defined in: [types.ts:252](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L252)

Custom key-value properties defined by block configuration.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`properties`](BlueprintBlockBase.md#properties)

***

### type

> **type**: `"NOTE"`

Defined in: [types.ts:419](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L419)

Block type determining behavior and rendering.

#### Overrides

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`type`](BlueprintBlockBase.md#type)

***

### userProperties?

> `optional` **userProperties?**: `Record`\<`string`, `string` \| `number` \| `boolean`\>

Defined in: [types.ts:254](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L254)

User-defined custom properties dictionary set by the narrative designer.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`userProperties`](BlueprintBlockBase.md#userproperties)

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:244](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L244)

Unique block identifier.

#### Inherited from

[`BlueprintBlockBase`](BlueprintBlockBase.md).[`uuid`](BlueprintBlockBase.md#uuid)

================================================================================

[LSDE Dialog Engine](../index.md) / PortResolutionInput

# Interface: PortResolutionInput

Defined in: [types.ts:1037](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1037)

Input data for port resolution.

## Properties

### actionRejected?

> `optional` **actionRejected?**: `boolean`

Defined in: [types.ts:1052](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1052)

ACTION blocks only — if `true`, the resolver looks for a `catch` port before falling back to `then`.

***

### block

> **block**: [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

Defined in: [types.ts:1039](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1039)

The block whose output port is being resolved. Its `type` determines the routing rules.

***

### characterPortIndex?

> `optional` **characterPortIndex?**: `number`

Defined in: [types.ts:1054](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1054)

DIALOG blocks with `portPerCharacter` — character index in metadata.characters to match against `connection.fromPortIndex`.

***

### conditionResult?

> `optional` **conditionResult?**: `number` \| `boolean` \| `number`[]

Defined in: [types.ts:1050](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1050)

CONDITION blocks only — evaluation result.
- `boolean`: `true` → port index 0, `false` → port index 1 (legacy single-group).
- `number`: `>= 0` follows matching case port, `< 0` follows `default`/`false` (switch mode).
- `number[]`: all matching case indices + `default` (dispatcher mode).

***

### connections

> **connections**: [`BlueprintConnection`](BlueprintConnection.md)[]

Defined in: [types.ts:1041](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1041)

All outgoing connections from this block. The resolver picks the one to follow.

***

### selectedChoiceUuid?

> `optional` **selectedChoiceUuid?**: `string`

Defined in: [types.ts:1043](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1043)

CHOICE blocks only — UUID of the selected choice. Matches `connection.fromPort`.

================================================================================

[LSDE Dialog Engine](../index.md) / PortResolutionResult

# Interface: PortResolutionResult

Defined in: [types.ts:1058](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1058)

Result of port resolution — all matching connections.

## Properties

### connections

> **connections**: [`BlueprintConnection`](BlueprintConnection.md)[]

Defined in: [types.ts:1059](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L1059)

================================================================================

[LSDE Dialog Engine](../index.md) / RuntimeChoiceItem

# Interface: RuntimeChoiceItem

Defined in: [types.ts:100](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L100)

Choice item with runtime visibility tag, set by the engine when `onResolveCondition()` is configured.
Use `choices.filter(c => c.visible !== false)` to get visible choices.

## Extends

- [`ChoiceItem`](ChoiceItem.md)

## Properties

### dialogueText?

> `optional` **dialogueText?**: `Record`\<`string`, `string`\>

Defined in: [types.ts:91](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L91)

Localized text map: `{ locale -> text }`.

#### Inherited from

[`ChoiceItem`](ChoiceItem.md).[`dialogueText`](ChoiceItem.md#dialoguetext)

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:89](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L89)

Display label for editor reference.

#### Inherited from

[`ChoiceItem`](ChoiceItem.md).[`label`](ChoiceItem.md#label)

***

### structureKey

> **structureKey**: `string`

Defined in: [types.ts:87](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L87)

Hierarchical key for localization lookup.

#### Inherited from

[`ChoiceItem`](ChoiceItem.md).[`structureKey`](ChoiceItem.md#structurekey)

***

### uuid

> **uuid**: `string`

Defined in: [types.ts:85](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L85)

Unique identifier for this choice.

#### Inherited from

[`ChoiceItem`](ChoiceItem.md).[`uuid`](ChoiceItem.md#uuid)

***

### visibilityConditions?

> `optional` **visibilityConditions?**: [`ExportCondition`](ExportCondition.md)[]

Defined in: [types.ts:93](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L93)

Conditions controlling whether this choice is visible. If all pass (or none set), the choice is shown.

#### Inherited from

[`ChoiceItem`](ChoiceItem.md).[`visibilityConditions`](ChoiceItem.md#visibilityconditions)

***

### visible?

> `optional` **visible?**: `boolean`

Defined in: [types.ts:102](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L102)

`true` = visible, `false` = hidden, `undefined` = no filter installed (treat as visible).

================================================================================

[LSDE Dialog Engine](../index.md) / RuntimeConditionGroup

# Interface: RuntimeConditionGroup

Defined in: [types.ts:110](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L110)

A condition group with an optional pre-evaluated result, set by the engine
when [onResolveCondition()](IDialogueEngine.md#onresolvecondition) is configured.
Mirrors how [RuntimeChoiceItem](RuntimeChoiceItem.md) extends ChoiceItem with a `visible` tag.

## Properties

### conditions

> **conditions**: [`ExportCondition`](ExportCondition.md)[]

Defined in: [types.ts:112](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L112)

The raw conditions for this group. Chained with `&` (AND) / `|` (OR).

***

### portIndex

> **portIndex**: `number`

Defined in: [types.ts:114](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L114)

Port index this group maps to (case_0 = 0, case_1 = 1, ...). Pass to `resolve()` for routing.

***

### result?

> `optional` **result?**: `boolean`

Defined in: [types.ts:116](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L116)

Pre-evaluated result. `true` if the group matches, `false` if not, `undefined` if no resolver is installed.

================================================================================

[LSDE Dialog Engine](../index.md) / SceneContext

# Interface: SceneContext

Defined in: [types.ts:677](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L677)

Context passed to scene lifecycle handlers.

================================================================================

[LSDE Dialog Engine](../index.md) / SceneHandle

# Interface: SceneHandle

Defined in: [types.ts:892](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L892)

Public interface for controlling a running scene.

## Remarks

Obtain a `SceneHandle` by calling `engine.scene(sceneUuid)`. Use it to register
scene-specific (Tier 2) handlers, then call `start()` to begin traversal from the
scene's entry block.

**Lifecycle**:
1. `start()` → `onSceneEnter` fires → first block is dispatched
2. Blocks are dispatched sequentially, following connections via port resolution
3. Scene ends when: no more connections, or `cancel()` is called
4. All async tracks are cancelled → current block cleanup runs → `onSceneExit` fires

Scene-level handlers (`onDialog`, `onChoice`, etc.) are called **before** global handlers.
Both tiers execute unless the scene handler calls `context.preventGlobalHandler()`.
Use `onBlock(uuid, handler)` for a block-specific handler that takes highest priority.

## Example

```ts
const handle = engine.scene(sceneId);
handle.onDialog(({ block, context, next }) => {
  showText(block.dialogueText?.['en']);
  next();
});
handle.onExit(({ scene }) => {
  console.log('Scene finished, visited:', scene.getVisitedBlocks().size);
});
handle.start();
```

## See

 - [BlockHandlerArgs](BlockHandlerArgs.md) for handler arguments
 - [BlueprintScene](BlueprintScene.md) for the scene data structure

## Methods

### cancel()

> **cancel**(): `void`

Defined in: [types.ts:896](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L896)

Cancel the scene flow.

#### Returns

`void`

***

### evaluateCondition()

> **evaluateCondition**(`condition`): `boolean`

Defined in: [types.ts:939](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L939)

Evaluate a condition. Handles `choice:` conditions via internal choice history. Returns `false` for non-choice conditions.

#### Parameters

##### condition

[`ExportCondition`](ExportCondition.md)

#### Returns

`boolean`

***

### getActiveTracks()

> **getActiveTracks**(): `number`

Defined in: [types.ts:929](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L929)

Get the number of async tracks currently running in parallel.

#### Returns

`number`

***

### getChoice()

> **getChoice**(`blockUuid`): readonly `string`[] \| `undefined`

Defined in: [types.ts:936](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L936)

Get the choice(s) selected at a specific block. Returns undefined if block never visited as choice.

#### Parameters

##### blockUuid

`string`

#### Returns

readonly `string`[] \| `undefined`

***

### getChoiceHistory()

> **getChoiceHistory**(): `ReadonlyMap`\<`string`, readonly `string`[]\>

Defined in: [types.ts:934](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L934)

Get the full choice history for this scene. Keys are block UUIDs, values are arrays of selected choice UUIDs.

#### Returns

`ReadonlyMap`\<`string`, readonly `string`[]\>

***

### getCurrentBlock()

> **getCurrentBlock**(): [`BlueprintBlock`](../type-aliases/BlueprintBlock.md) \| `null`

Defined in: [types.ts:923](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L923)

Get the block currently being executed.

#### Returns

[`BlueprintBlock`](../type-aliases/BlueprintBlock.md) \| `null`

***

### getTrackInfos()

> **getTrackInfos**(): readonly [`TrackInfo`](TrackInfo.md)[]

Defined in: [types.ts:931](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L931)

Get detailed info for all currently running async tracks. Useful for debug, rendering, and validation.

#### Returns

readonly [`TrackInfo`](TrackInfo.md)[]

***

### getVisitedBlocks()

> **getVisitedBlocks**(): `ReadonlySet`\<`string`\>

Defined in: [types.ts:925](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L925)

Get UUIDs of all blocks visited so far.

#### Returns

`ReadonlySet`\<`string`\>

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [types.ts:927](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L927)

Check if the scene flow is currently active.

#### Returns

`boolean`

***

### onAction()

> **onAction**(`handler`): `void`

Defined in: [types.ts:920](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L920)

Override all ACTION blocks for this scene.

#### Parameters

##### handler

[`ActionHandler`](../type-aliases/ActionHandler.md)

#### Returns

`void`

***

### onActionId()

> **onActionId**(`blockUuid`, `handler`): `void`

Defined in: [types.ts:912](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L912)

Override a specific ACTION block by UUID (type-safe).

#### Parameters

##### blockUuid

`string`

##### handler

[`ActionHandler`](../type-aliases/ActionHandler.md)

#### Returns

`void`

***

### onBlock()

> **onBlock**(`blockUuid`, `handler`): `void`

Defined in: [types.ts:904](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L904)

Override a specific block by UUID.

#### Parameters

##### blockUuid

`string`

##### handler

[`BlockHandler`](../type-aliases/BlockHandler.md)\<[`BlueprintBlock`](../type-aliases/BlueprintBlock.md), [`BaseBlockContext`](BaseBlockContext.md)\>

#### Returns

`void`

***

### onChoice()

> **onChoice**(`handler`): `void`

Defined in: [types.ts:916](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L916)

Override all CHOICE blocks for this scene.

#### Parameters

##### handler

[`ChoiceHandler`](../type-aliases/ChoiceHandler.md)

#### Returns

`void`

***

### onChoiceId()

> **onChoiceId**(`blockUuid`, `handler`): `void`

Defined in: [types.ts:908](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L908)

Override a specific CHOICE block by UUID (type-safe).

#### Parameters

##### blockUuid

`string`

##### handler

[`ChoiceHandler`](../type-aliases/ChoiceHandler.md)

#### Returns

`void`

***

### onCondition()

> **onCondition**(`handler`): `void`

Defined in: [types.ts:918](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L918)

Override all CONDITION blocks for this scene.

#### Parameters

##### handler

[`ConditionHandler`](../type-aliases/ConditionHandler.md)

#### Returns

`void`

***

### onConditionId()

> **onConditionId**(`blockUuid`, `handler`): `void`

Defined in: [types.ts:910](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L910)

Override a specific CONDITION block by UUID (type-safe).

#### Parameters

##### blockUuid

`string`

##### handler

[`ConditionHandler`](../type-aliases/ConditionHandler.md)

#### Returns

`void`

***

### onDialog()

> **onDialog**(`handler`): `void`

Defined in: [types.ts:914](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L914)

Override all DIALOG blocks for this scene.

#### Parameters

##### handler

[`DialogHandler`](../type-aliases/DialogHandler.md)

#### Returns

`void`

***

### onDialogId()

> **onDialogId**(`blockUuid`, `handler`): `void`

Defined in: [types.ts:906](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L906)

Override a specific DIALOG block by UUID (type-safe).

#### Parameters

##### blockUuid

`string`

##### handler

[`DialogHandler`](../type-aliases/DialogHandler.md)

#### Returns

`void`

***

### onEnter()

> **onEnter**(`handler`): `void`

Defined in: [types.ts:899](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L899)

Override the global onSceneEnter for this scene.

#### Parameters

##### handler

[`SceneLifecycleHandler`](../type-aliases/SceneLifecycleHandler.md)

#### Returns

`void`

***

### onExit()

> **onExit**(`handler`): `void`

Defined in: [types.ts:901](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L901)

Override the global onSceneExit for this scene.

#### Parameters

##### handler

[`SceneLifecycleHandler`](../type-aliases/SceneLifecycleHandler.md)

#### Returns

`void`

***

### onResolveCharacter()

> **onResolveCharacter**(`fn`): `void`

Defined in: [types.ts:941](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L941)

Override character resolution for this scene. Defaults to engine-level resolver.

#### Parameters

##### fn

(`characters`) => [`BlockCharacter`](BlockCharacter.md) \| `undefined`

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [types.ts:894](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L894)

Start the scene flow from the entry block.

#### Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / SceneLifecycleArgs

# Interface: SceneLifecycleArgs

Defined in: [types.ts:826](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L826)

Arguments for scene lifecycle handlers.

## Properties

### context

> **context**: [`SceneContext`](SceneContext.md)

Defined in: [types.ts:828](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L828)

***

### scene

> **scene**: [`SceneHandle`](SceneHandle.md)

Defined in: [types.ts:827](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L827)

================================================================================

[LSDE Dialog Engine](../index.md) / SignatureParam

# Interface: SignatureParam

Defined in: [types.ts:485](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L485)

Parameter definition for an action signature.

## Properties

### dictionaryGroupUuid?

> `optional` **dictionaryGroupUuid?**: `string`

Defined in: [types.ts:491](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L491)

UUID of the dictionary group this parameter references. Only when `type` is `"dictionary"`.

***

### enumOptions?

> `optional` **enumOptions?**: `object`[]

Defined in: [types.ts:493](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L493)

Available options when `type` is `"enum"`.

#### id

> **id**: `string`

#### label?

> `optional` **label?**: `string`

***

### label?

> `optional` **label?**: `string`

Defined in: [types.ts:487](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L487)

Display label for this parameter.

***

### type

> **type**: `"string"` \| `"number"` \| `"boolean"` \| `"enum"` \| `"dictionary"`

Defined in: [types.ts:489](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L489)

Data type of this parameter.

================================================================================

[LSDE Dialog Engine](../index.md) / TrackInfo

# Interface: TrackInfo

Defined in: [types.ts:843](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L843)

Read-only snapshot of an async track's state.
Returned by [SceneHandle.getTrackInfos](SceneHandle.md#gettrackinfos) for debug, rendering, and validation.

Track IDs are auto-incremented integers starting at 1. The main track is implicit (id 0)
and never appears in the track info list.

## Properties

### currentBlockUuid

> `readonly` **currentBlockUuid**: `string` \| `null`

Defined in: [types.ts:851](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L851)

UUID of the block currently being processed, or `null` if the track has ended.

***

### id

> `readonly` **id**: `number`

Defined in: [types.ts:845](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L845)

Unique auto-incremented identifier for this track within the scene. Main track is implicit (id 0).

***

### parentTrackId

> `readonly` **parentTrackId**: `number` \| `null`

Defined in: [types.ts:847](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L847)

ID of the track that spawned this one. `null` means spawned directly by the main track.

***

### running

> `readonly` **running**: `boolean`

Defined in: [types.ts:853](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L853)

Whether this track is still actively executing.

***

### startBlockUuid

> `readonly` **startBlockUuid**: `string`

Defined in: [types.ts:849](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L849)

UUID of the first block that started this track's execution.

================================================================================

[LSDE Dialog Engine](../index.md) / ValidateNextBlockArgs

# Interface: ValidateNextBlockArgs

Defined in: [types.ts:789](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L789)

Arguments for the onValidateNextBlock handler.

## Remarks

Called before each block is executed. Provides the resolved character for both
the upcoming block (`nextContext`) and the previously executed block (`fromContext`).
This enables game-side validation such as character authorization, status checks,
or transition rules between characters.

`fromContext` is `null` for the first block of a scene (no previous block exists).

## Example

```ts
engine.onValidateNextBlock(({ nextBlock, nextContext, fromContext }) => {
  const { character } = nextContext;
  if (!character) return { valid: false, reason: 'no_character' };
  if (game.characterHasStatus(character, 'stunned'))
    return { valid: false, reason: 'character_stunned' };
  return { valid: true };
});
```

## See

 - [ValidateNextBlockContext](ValidateNextBlockContext.md) for per-block context details
 - [BlockCharacter](BlockCharacter.md) for character data

## Properties

### fromBlock

> **fromBlock**: [`BlueprintBlock`](../type-aliases/BlueprintBlock.md) \| `null`

Defined in: [types.ts:793](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L793)

The block that was just executed, or `null` for the first block of the scene.

***

### fromContext

> **fromContext**: [`ValidateNextBlockContext`](ValidateNextBlockContext.md) \| `null`

Defined in: [types.ts:797](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L797)

Context for the previous block, or `null` if this is the first block.

***

### nextBlock

> **nextBlock**: [`BlueprintBlock`](../type-aliases/BlueprintBlock.md)

Defined in: [types.ts:791](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L791)

The block about to be executed.

***

### nextContext

> **nextContext**: [`ValidateNextBlockContext`](ValidateNextBlockContext.md)

Defined in: [types.ts:795](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L795)

Context for the upcoming block (character, etc.).

***

### port

> **port**: `string` \| `null`

Defined in: [types.ts:799](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L799)

The port that was followed to reach `nextBlock` (reserved for future use).

================================================================================

[LSDE Dialog Engine](../index.md) / ValidateNextBlockContext

# Interface: ValidateNextBlockContext

Defined in: [types.ts:759](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L759)

Context attached to a block inside [ValidateNextBlockArgs](ValidateNextBlockArgs.md).

## Remarks

The character is resolved by the `onResolveCharacter` callback **before** the
validation handler is invoked. If the block has no characters in its metadata,
or the resolver returns nothing, `character` will be `undefined`.

## See

 - [BlockCharacter](BlockCharacter.md) for character data
 - [ValidateNextBlockArgs](ValidateNextBlockArgs.md) for usage

## Properties

### character

> **character**: [`BlockCharacter`](BlockCharacter.md) \| `undefined`

Defined in: [types.ts:761](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L761)

Character resolved for this block, or `undefined` if none.

================================================================================

[LSDE Dialog Engine](../index.md) / ValidationResult

# Interface: ValidationResult

Defined in: [types.ts:608](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L608)

Result of block validation.

## Properties

### reason?

> `optional` **reason?**: `string`

Defined in: [types.ts:612](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L612)

Reason for validation failure. Passed to `InvalidateBlockArgs.reason` when `valid` is `false`.

***

### valid

> **valid**: `boolean`

Defined in: [types.ts:610](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L610)

Whether the block passed validation. When `false`, the `onInvalidateBlock` handler is called.

================================================================================

[LSDE Dialog Engine](../index.md) / ActionHandler

# Type Alias: ActionHandler

> **ActionHandler** = [`BlockHandler`](BlockHandler.md)\<[`ActionBlock`](../interfaces/ActionBlock.md), [`ActionContext`](../interfaces/ActionContext.md)\>

Defined in: [types.ts:746](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L746)

Handler for ACTION blocks. Shorthand for `BlockHandler<ActionBlock, ActionContext>`.

================================================================================

[LSDE Dialog Engine](../index.md) / BeforeBlockHandler

# Type Alias: BeforeBlockHandler

> **BeforeBlockHandler** = (`args`) => `void`

Defined in: [types.ts:823](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L823)

Handler called before every block. Must call resolve() to continue.

## Parameters

### args

[`BeforeBlockArgs`](../interfaces/BeforeBlockArgs.md)

## Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / BlockHandler

# Type Alias: BlockHandler\<B, C\>

> **BlockHandler**\<`B`, `C`\> = (`args`) => [`CleanupFn`](CleanupFn.md) \| `void`

Defined in: [types.ts:737](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L737)

A block handler function. May return a cleanup function.

## Type Parameters

### B

`B` *extends* [`BlueprintBlock`](BlueprintBlock.md)

### C

`C` *extends* [`BaseBlockContext`](../interfaces/BaseBlockContext.md)

## Parameters

### args

[`BlockHandlerArgs`](../interfaces/BlockHandlerArgs.md)\<`B`, `C`\>

## Returns

[`CleanupFn`](CleanupFn.md) \| `void`

## Remarks

The handler is called when the engine dispatches a block of the matching type. It **must**
call `next()` exactly once to advance the flow to the next block.

If the handler returns a function, it is stored as a **cleanup function** and called when
the engine moves to the next block — use this to tear down UI, stop timers, etc.

## Example

```ts
engine.onDialog(({ block, next }) => {
  const el = showDialogUI(block);
  next();
  return () => el.remove(); // cleanup when leaving this block
});
```

## See

 - [CleanupFn](CleanupFn.md) for the cleanup function type
 - [BlockHandlerArgs](../interfaces/BlockHandlerArgs.md) for handler arguments

================================================================================

[LSDE Dialog Engine](../index.md) / BlockType

# Type Alias: BlockType

> **BlockType** = `"DIALOG"` \| `"CHOICE"` \| `"CONDITION"` \| `"ACTION"` \| `"NOTE"`

Defined in: [types.ts:11](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L11)

All possible block types in a blueprint.

================================================================================

[LSDE Dialog Engine](../index.md) / BlueprintBlock

# Type Alias: BlueprintBlock

> **BlueprintBlock** = [`DialogBlock`](../interfaces/DialogBlock.md) \| [`ChoiceBlock`](../interfaces/ChoiceBlock.md) \| [`ConditionBlock`](../interfaces/ConditionBlock.md) \| [`ActionBlock`](../interfaces/ActionBlock.md) \| [`NoteBlock`](../interfaces/NoteBlock.md)

Defined in: [types.ts:423](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L423)

Discriminated union of all block types. Narrow on the `type` field.

================================================================================

[LSDE Dialog Engine](../index.md) / ChoiceHandler

# Type Alias: ChoiceHandler

> **ChoiceHandler** = [`BlockHandler`](BlockHandler.md)\<[`ChoiceBlock`](../interfaces/ChoiceBlock.md), [`ChoiceContext`](../interfaces/ChoiceContext.md)\>

Defined in: [types.ts:742](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L742)

Handler for CHOICE blocks. Shorthand for `BlockHandler<ChoiceBlock, ChoiceContext>`.

================================================================================

[LSDE Dialog Engine](../index.md) / CleanupFn

# Type Alias: CleanupFn

> **CleanupFn** = () => `void`

Defined in: [types.ts:616](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L616)

Cleanup function returned by a block handler, called when leaving the block.

## Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / ConditionHandler

# Type Alias: ConditionHandler

> **ConditionHandler** = [`BlockHandler`](BlockHandler.md)\<[`ConditionBlock`](../interfaces/ConditionBlock.md), [`ConditionContext`](../interfaces/ConditionContext.md)\>

Defined in: [types.ts:744](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L744)

Handler for CONDITION blocks. Shorthand for `BlockHandler<ConditionBlock, ConditionContext>`.

================================================================================

[LSDE Dialog Engine](../index.md) / DialogHandler

# Type Alias: DialogHandler

> **DialogHandler** = [`BlockHandler`](BlockHandler.md)\<[`DialogBlock`](../interfaces/DialogBlock.md), [`DialogContext`](../interfaces/DialogContext.md)\>

Defined in: [types.ts:740](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L740)

Handler for DIALOG blocks. Shorthand for `BlockHandler<DialogBlock, DialogContext>`.

================================================================================

[LSDE Dialog Engine](../index.md) / InvalidateBlockHandler

# Type Alias: InvalidateBlockHandler

> **InvalidateBlockHandler** = (`args`) => `void`

Defined in: [types.ts:812](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L812)

Handler called when a block fails validation.

## Parameters

### args

[`InvalidateBlockArgs`](../interfaces/InvalidateBlockArgs.md)

## Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / SceneLifecycleHandler

# Type Alias: SceneLifecycleHandler

> **SceneLifecycleHandler** = (`args`) => `void`

Defined in: [types.ts:832](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L832)

Handler for scene enter/exit events.

## Parameters

### args

[`SceneLifecycleArgs`](../interfaces/SceneLifecycleArgs.md)

## Returns

`void`

================================================================================

[LSDE Dialog Engine](../index.md) / ValidateNextBlockHandler

# Type Alias: ValidateNextBlockHandler

> **ValidateNextBlockHandler** = (`args`) => [`ValidationResult`](../interfaces/ValidationResult.md)

Defined in: [types.ts:803](https://github.com/jonlepage/LS-Dialog-Editor-Engine/blob/e96e93f5c89d219993f6c274b86646648a12f4ac/lsde-ts/src/types.ts#L803)

Handler for block validation.

## Parameters

### args

[`ValidateNextBlockArgs`](../interfaces/ValidateNextBlockArgs.md)

## Returns

[`ValidationResult`](../interfaces/ValidationResult.md)

================================================================================
