![LSDE Dialog Engine — TypeScript](https://raw.githubusercontent.com/jonlepage/LS-Dialog-Editor-Engine/master/lsde-ts/banner.png)

# LSDE Dialog Engine — TypeScript

> Reference implementation of the LSDE callback-driven dialogue graph dispatcher.

This is the **source of truth**. All other runtimes (C#, C++, GDScript) are ports validated against the same cross-language test suite. If there is any ambiguity in the specification, the TypeScript behavior is authoritative.

---

## Quick Start

```bash
npm install
npm run build
```

```typescript
import { DialogueEngine, LsdeUtils } from '@lsde/dialog-engine';

const engine = new DialogueEngine();
const report = engine.init({ data: blueprintJson });

engine.setLocale('en');

// Character resolver (optional — default: first character in list)
engine.onResolveCharacter((chars) => chars[0]);

// Unified condition resolver — handles choice visibility + condition block pre-evaluation.
// choice: conditions are handled internally by the engine via choice history.
engine.onResolveCondition((condition) => {
  return gameState.evaluate(condition);
});

// ─── 3 Required Handlers (onCondition is optional with onResolveCondition) ──

engine.onDialog(({ block, context, next }) => {
  const text = LsdeUtils.getLocalizedText(block.dialogueText);
  console.log(`${context.character?.name}: ${text ?? '—'}`);
  next();
  return () => { /* cleanup when leaving this block */ };
});

engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter((c) => c.visible !== false);
  context.selectChoice(visible[0].uuid);
  next();
});

// onCondition is OPTIONAL — the engine auto-routes from pre-evaluated groups.
// Add it only for logging, UI feedback, or to override the auto-resolved result.
engine.onCondition(({ block, context, next }) => {
  const { conditionGroups } = context;
  const matched = conditionGroups.filter((g) => g.result).map((g) => g.portIndex);
  const isDispatcher = !!block.nativeProperties?.enableDispatcher;
  context.resolve(isDispatcher ? matched : (matched[0] ?? -1));
  next();
});

engine.onAction(({ block, context, next }) => {
  for (const a of block.actions) {
    console.log(`Action: ${a.actionId}`);
  }
  context.resolve();
  next();
});

// ─── Run ─────────────────────────────────────────────────────────

const handle = engine.scene('scene-uuid');
handle.start();
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm run test` | Run 216 unit + integration tests |
| `npm run lint` | Type-check |
| `npm run playground` | Run interactive playground against a real blueprint |
| `npm run docs` | Generate API docs (TypeDoc + VitePress) |

---

## Architecture

```
src/
├── engine.ts             # Public facade — init, handlers, scene()
├── scene-handle.ts       # Traversal loop + AsyncTrack (multi-track)
├── handler-registry.ts   # Two-tier handler resolution
├── port-resolver.ts      # Output port routing (critical algorithm)
├── block-context.ts      # Context factories per block type
├── condition-evaluator.ts # AND/OR chain evaluation
├── graph.ts              # Scene + Blueprint indexing
├── validator.ts          # Blueprint validation + diagnostics
├── types.ts              # All interfaces and type definitions
├── lsde-utils.ts         # Localization, condition helpers, type guards
└── utils.ts              # Internal utilities
```

---

## API Overview

### Engine Lifecycle

| Method | Description |
|--------|-------------|
| `engine.init({ data })` | Validate blueprint, build graph. Returns `DiagnosticReport`. |
| `engine.setLocale(locale)` | Set active locale for text resolution. |
| `engine.scene(sceneId)` | Create a scene handle (does not start). |
| `engine.stop()` | Cancel all active scenes. |
| `engine.isRunning()` | True if at least one scene is active. |
| `engine.getActiveScenes()` | Get all running scene handles. |
| `engine.getCurrentBlocks()` | Get current block of every active scene. |
| `engine.getSceneConnections(sceneId)` | Get all connections for a scene. |

### Handler Registration (Tier 1 — Global)

All 4 type handlers are **required** — the engine will throw if a scene starts without them.

| Method | Description |
|--------|-------------|
| `engine.onDialog(handler)` | Handle DIALOG blocks. |
| `engine.onChoice(handler)` | Handle CHOICE blocks (choices tagged with `visible` when `onResolveCondition` is set). |
| `engine.onCondition(handler)` | Handle CONDITION blocks. **Optional** when `onResolveCondition` is installed. |
| `engine.onAction(handler)` | Handle ACTION blocks. Developer **must** call `context.resolve()` or `context.reject()`. |

### Optional Handlers

| Method | Description |
|--------|-------------|
| `engine.onResolveCharacter(fn)` | Character resolver. Default: first character in the list. |
| `engine.onResolveCondition(fn)` | Unified condition resolver (choice visibility + condition pre-evaluation). |
| ~~`engine.setChoiceFilter(fn)`~~ | _Deprecated — use `onResolveCondition` instead._ |
| `engine.onBeforeBlock(handler)` | Pre-execution gate. Must call `resolve()` to continue. |
| `engine.onValidateNextBlock(handler)` | Validate before entering a block. |
| `engine.onInvalidateBlock(handler)` | Called when a block fails validation. |
| `engine.onSceneEnter(handler)` | Called when any scene starts. |
| `engine.onSceneExit(handler)` | Called when any scene ends. |

### Scene Handle (Tier 2 — Per-Scene)

| Method | Description |
|--------|-------------|
| `handle.start()` | Begin traversal from the entry block. |
| `handle.cancel()` | Stop the scene and all async tracks. |
| `handle.onDialog(handler)` | Override global DIALOG handler for this scene. |
| `handle.onChoice(handler)` | Override global CHOICE handler for this scene. |
| `handle.onCondition(handler)` | Override global CONDITION handler for this scene. |
| `handle.onAction(handler)` | Override global ACTION handler for this scene. |
| `handle.onBlock(uuid, handler)` | Override handler for a specific block by UUID. |
| `handle.onDialogId(uuid, handler)` | Override a specific DIALOG block by UUID (type-safe). |
| `handle.onChoiceId(uuid, handler)` | Override a specific CHOICE block by UUID (type-safe). |
| `handle.onConditionId(uuid, handler)` | Override a specific CONDITION block by UUID (type-safe). |
| `handle.onActionId(uuid, handler)` | Override a specific ACTION block by UUID (type-safe). |
| `handle.onEnter(handler)` | Override global `onSceneEnter` for this scene. |
| `handle.onExit(handler)` | Override global `onSceneExit` for this scene. |
| `handle.onResolveCharacter(fn)` | Override character resolver for this scene. |
| `handle.getCurrentBlock()` | Get the block currently being executed, or `null`. |
| `handle.getVisitedBlocks()` | Set of visited block UUIDs. |
| `handle.getChoiceHistory()` | Map of block UUID → selected choice UUIDs. |
| `handle.getChoice(blockUuid)` | Get choice(s) selected at a specific block. |
| `handle.evaluateCondition(cond)` | Evaluate a `choice:` condition against history. |
| `handle.isRunning()` | Whether the scene is still active. |
| `handle.getActiveTracks()` | Number of active async tracks. |
| `handle.getTrackInfos()` | Snapshot of all track states. |

### Handler Pattern

Every handler receives `{ scene, block, context, next }` and may return a cleanup function:

```typescript
engine.onDialog(({ block, context, next }) => {
  // Display dialogue...
  next(); // Advance to next block

  return () => {
    // Called when leaving this block (cleanup)
  };
});
```

### Utilities (`LsdeUtils`)

| Method | Description |
|--------|-------------|
| `LsdeUtils.locale` | Current locale, synced by `engine.setLocale()`. |
| `LsdeUtils.isDialogBlock(block)` | Type guard: true if block is a `DialogBlock`. |
| `LsdeUtils.isChoiceBlock(block)` | Type guard: true if block is a `ChoiceBlock`. |
| `LsdeUtils.isConditionBlock(block)` | Type guard: true if block is a `ConditionBlock`. |
| `LsdeUtils.isActionBlock(block)` | Type guard: true if block is an `ActionBlock`. |
| `LsdeUtils.isNoteBlock(block)` | Type guard: true if block is a `NoteBlock`. |
| `LsdeUtils.getBlockLabel(block)` | Block label, or first 8 chars of UUID as fallback. |
| `LsdeUtils.getLocalizedText(dialogueText, locale?)` | Lookup localized text. Uses engine locale by default. |
| `LsdeUtils.isChoiceCondition(condition)` | True if condition references a previous choice (`choice:<uuid>`). |
| `LsdeUtils.getChoiceConditionBlockUuid(condition)` | Extract block UUID from a choice condition. |
| `LsdeUtils.evaluateConditionChain(conditions, evaluator)` | Evaluate AND/OR condition chain. Empty = `true`. |
| `LsdeUtils.filterVisibleChoices(choices, evaluator, scene?)` | Filter choices by visibility conditions. |

---

## Cross-Language Tests

This runtime shares 42 JSON-based test specifications with all other ports:

- `tests/test-cases.json` — Flow tests (linear, choice, condition, action, async, mixed)
- `tests/test-port-routing.json` — Port resolution for all block types
- `tests/test-init-validation.json` — Blueprint validation error/warning codes

---

## License

Proprietary — distributed under the LSDE license.
