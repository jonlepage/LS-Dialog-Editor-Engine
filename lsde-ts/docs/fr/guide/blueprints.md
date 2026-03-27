# Blueprints & Scènes

## Structure du blueprint

Un `BlueprintExport` est le fichier JSON exporté de l'éditeur LS-Dialog. Il contient toutes les données dont le engine a besoin.

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

Chaque scene est un sous-graphe indépendant avec un point d'entrée :

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

Les connections lient les output ports d'un block aux input ports du suivant :

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

Les dictionaries définissent des ensembles de valeurs nommés utilisés par les conditions et les paramètres d'action :

```ts
interface Dictionary {
  uuid: string;
  label?: string;
  valueType: 'string' | 'number' | 'boolean';
  rows: DictionaryRow[];
}
```

## Action Signatures

Les signatures décrivent des types d'action réutilisables avec leurs paramètres :

```ts
interface ActionSignature {
  uuid: string;
  id: string;                  // Unique identifier (e.g. "set_flag")
  label?: string;
  params: SignatureParam[];
}
```
