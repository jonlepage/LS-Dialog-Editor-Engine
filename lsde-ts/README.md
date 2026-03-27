![LSDE Dialog Engine — TypeScript](banner.png)

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
import { DialogueEngine } from '@lsde/dialog-engine';
import type { StateBridge } from '@lsde/dialog-engine';

const engine = new DialogueEngine();
const report = engine.init({ data: blueprintJson });

engine.setLocale('en');
engine.setStateBridge({
  evaluateCondition: (c) => true,
  executeAction: (a) => {},
  resolveDictionary: (group, key) => '',
});

engine.onDialog(({ block, context, next }) => {
  const text = block.dialogueText?.['en'] ?? '';
  console.log(`${context.character?.name}: ${text}`);
  next();
});

engine.onChoice(({ context, next }) => {
  // Show choices to the player, then:
  context.selectChoice(context.choices[0].uuid);
  next();
});

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
└── utils.ts              # Type guards, helpers
```

---

## API Overview

### Engine Lifecycle

| Method | Description |
|--------|-------------|
| `engine.init({ data })` | Validate blueprint, build graph. Returns `DiagnosticReport`. |
| `engine.setLocale(locale)` | Set active locale for text resolution. |
| `engine.setStateBridge(bridge)` | Connect engine to game state. |
| `engine.scene(sceneId)` | Create a scene handle (does not start). |
| `engine.stop()` | Cancel all active scenes. |

### Handler Registration (Tier 1 — Global)

| Method | Description |
|--------|-------------|
| `engine.onDialog(handler)` | Handle DIALOG blocks. |
| `engine.onChoice(handler)` | Handle CHOICE blocks (choices pre-filtered by visibility). |
| `engine.onCondition(handler)` | Handle CONDITION blocks. Auto-evaluates via StateBridge if absent. |
| `engine.onAction(handler)` | Handle ACTION blocks. Auto-executes via StateBridge if absent. |
| `engine.onBeforeBlock(handler)` | Pre-execution gate. Must call `resolve()` to continue. |
| `engine.onValidateNextBlock(handler)` | Validate before entering a block. |

### Scene Handle (Tier 2 — Per-Scene)

| Method | Description |
|--------|-------------|
| `handle.start()` | Begin traversal from the entry block. |
| `handle.cancel()` | Stop the scene and all async tracks. |
| `handle.onDialog(handler)` | Override global DIALOG handler for this scene. |
| `handle.onBlock(uuid, handler)` | Override handler for a specific block by UUID. |
| `handle.getVisitedBlocks()` | Set of all visited block UUIDs. |
| `handle.isRunning()` | Whether the scene is still active. |

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

---

## Cross-Language Tests

This runtime shares 42 JSON-based test specifications with all other ports:

- `tests/test-cases.json` — Flow tests (linear, choice, condition, action, async, mixed)
- `tests/test-port-routing.json` — Port resolution for all block types
- `tests/test-init-validation.json` — Blueprint validation error/warning codes

---

## License

Proprietary — distributed under the LSDE license.
