# Getting Started

## Installation

```bash
npm install @lsde/dialog-engine
```

## Minimal Usage

```ts
import { DialogueEngine } from '@lsde/dialog-engine';
import type { BlueprintExport, StateBridge } from '@lsde/dialog-engine';

// 1. Load the blueprint exported from the editor
import blueprintJson from './blueprint.json';
const data = blueprintJson as BlueprintExport;

// 2. Create and initialize the engine
const engine = new DialogueEngine();
const report = engine.init({ data });

if (report.errors.length > 0) {
  console.error('Invalid blueprint:', report.errors);
  // Do not proceed — the engine is not initialized
}

// 3. Set the locale
engine.setLocale('en');

// 4. Connect the StateBridge
const bridge: StateBridge = {
  evaluateCondition: (cond) => {
    // Evaluate the condition against game state
    return true;
  },
  executeAction: (action, signature) => {
    // Execute the action in the game
  },
  resolveDictionary: (group, key) => {
    // Resolve a dictionary value
    return `${group}.${key}`;
  },
};
engine.setStateBridge(bridge);

// 5. Register handlers
engine.onDialog(({ block, context, next }) => {
  const text = block.dialogueText?.['en'] ?? '';
  const char = context.character;
  console.log(`${char?.name ?? '???'}: ${text}`);
  next(); // Advance to next block
});

engine.onChoice(({ context, next }) => {
  console.log('Available choices:', context.choices);
  // Select a choice
  context.selectChoice(context.choices[0].uuid);
  next();
});

// 6. Run a scene
const sceneId = data.scenes[0].uuid;
const handle = engine.scene(sceneId);
handle.start();
```

## Blueprint Validation

`engine.init()` returns a `DiagnosticReport` containing:

| Field | Type | Description |
|-------|------|-------------|
| `errors` | `DiagnosticEntry[]` | Blocking errors — the engine does not initialize |
| `warnings` | `DiagnosticEntry[]` | Non-blocking warnings |
| `stats` | `DiagnosticStats` | Counts: scenes, blocks, connections |

You can also provide `check` to cross-validate against your game's capabilities:

```ts
engine.init({
  data,
  check: {
    signatures: ['set_flag', 'play_sound'],
    dictionaries: { items: ['sword', 'shield'] },
    characters: ['Alice', 'Bob'],
  },
});
```
