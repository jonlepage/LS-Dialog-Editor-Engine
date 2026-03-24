# Blueprints & Scenes

## Blueprint Structure

A `BlueprintExport` is the JSON file exported from the LS-Dialog editor. It contains all the data the engine needs.

```ts
interface BlueprintExport {
  version: string;
  exportDate: string;
  projectName?: string;
  primaryLanguage?: string;
  locales: string[];           // Available languages
  dictionaries?: Dictionary[]; // Named value groups
  signatures?: ActionSignature[]; // Reusable action signatures
  scenes: BlueprintScene[];    // Dialogue scenes
}
```

## Scenes

Each scene is an independent subgraph with an entry point:

```ts
interface BlueprintScene {
  uuid: string;
  label: string;
  note?: string;
  entryBlockId?: string;       // First block to execute
  date: string;
  blocks: BlueprintBlock[];    // All blocks in the scene
  connections: BlueprintConnection[]; // Graph edges
}
```

## Connections

Connections link output ports of a block to input ports of the next:

```ts
interface BlueprintConnection {
  id: string;
  fromId: string;              // Source block UUID
  toId: string;                // Target block UUID
  fromPort: string;            // Output port name
  toPort: string;              // Input port name
  fromPortIndex?: number;      // Port index (portPerCharacter)
}
```

## Dictionaries

Dictionaries define named value sets used by conditions and action parameters:

```ts
interface Dictionary {
  uuid: string;
  label?: string;
  valueType: 'string' | 'number' | 'boolean';
  rows: DictionaryRow[];
}
```

## Action Signatures

Signatures describe reusable action types with their parameters:

```ts
interface ActionSignature {
  uuid: string;
  id: string;                  // Unique identifier (e.g. "set_flag")
  label?: string;
  params: SignatureParam[];
}
```
