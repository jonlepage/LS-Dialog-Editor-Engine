# Block Types

The engine supports 5 block types. Each has a dedicated handler and specific context.

## DIALOG

Displays text spoken by a character.

```ts
interface DialogBlock {
  type: 'DIALOG';
  structureKey?: string;
  content?: string;
  dialogueText?: Record<string, string>; // Text per locale
  // + common fields (uuid, label, properties, metadata, nativeProperties)
}
```

**Handler:**

```ts
engine.onDialog(({ block, context, next }) => {
  const char = context.character;       // BlockCharacter | null
  const text = block.dialogueText?.['en'];

  // If portPerCharacter is enabled:
  if (block.nativeProperties?.portPerCharacter && char) {
    context.resolveCharacterPort(char.name);
  }

  next();
});
```

## CHOICE

Presents selectable options to the player.

```ts
interface ChoiceBlock {
  type: 'CHOICE';
  choices?: ChoiceItem[];
  note?: string;
}
```

**Handler:**

```ts
engine.onChoice(({ context, next }) => {
  // context.choices contains only visible choices
  console.log(context.choices);

  // Select a choice by UUID
  context.selectChoice(context.choices[0].uuid);
  next();
});
```

## CONDITION

Evaluates logic to branch the flow. If no handler is registered, the engine uses `StateBridge.evaluateCondition()` automatically.

```ts
interface ConditionBlock {
  type: 'CONDITION';
  conditions?: ExportCondition[];
  note?: string;
}
```

**Handler:**

```ts
engine.onCondition(({ block, context, next }) => {
  // true → port index 0, false → port index 1
  context.resolve(true);
  next();
});
```

## ACTION

Triggers game state changes. If no handler is registered, the engine uses `StateBridge.executeAction()` automatically.

```ts
interface ActionBlock {
  type: 'ACTION';
  actions?: ExportAction[];
  note?: string;
}
```

**Handler:**

```ts
engine.onAction(({ block, context, next }) => {
  context.resolve();   // Success → "then" port
  // or context.reject(error); → "catch" port (fallback "then")
  next();
});
```

## NOTE

Documentation block for the designer. Never executed by the engine.

## Common Properties

All blocks share `BlueprintBlockBase`:

| Field | Type | Description |
|-------|------|-------------|
| `uuid` | `string` | Unique identifier |
| `type` | `BlockType` | Discriminant type |
| `label` | `string?` | Human-readable name |
| `parentLabels` | `string[]?` | Parent labels (hierarchy) |
| `properties` | `BlockProperty[]` | Key-value properties |
| `userProperties` | `Record<...>?` | Free-form user properties |
| `nativeProperties` | `NativeProperties?` | Execution properties (async, delay, etc.) |
| `metadata` | `BlockMetadata?` | Display metadata |
| `isStartBlock` | `boolean?` | Marks the entry block |

### NativeProperties

| Field | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | Execute on an async track |
| `delay` | `number?` | Delay before execution (seconds) |
| `timeout` | `number?` | Execution timeout |
| `debug` | `boolean?` | Debug mode |
| `portPerCharacter` | `boolean?` | One output port per character |
| `skipIfMissingActor` | `boolean?` | Skip if actor is missing |
| `followNarrative` | `boolean?` | Async track follows the main narrative |
