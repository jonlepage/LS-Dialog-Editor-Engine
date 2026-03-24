# Blueprints & Scènes

## Structure d'un blueprint

Un `BlueprintExport` est le fichier JSON exporté depuis l'éditeur LS-Dialog. Il contient toutes les données nécessaires au moteur.

```ts
interface BlueprintExport {
  version: string;
  exportDate: string;
  projectName?: string;
  primaryLanguage?: string;
  locales: string[];           // Langues disponibles
  dictionaries?: Dictionary[]; // Groupes de valeurs nommées
  signatures?: ActionSignature[]; // Signatures d'actions réutilisables
  scenes: BlueprintScene[];    // Les scènes du dialogue
}
```

## Scènes

Chaque scène est un sous-graphe indépendant avec un point d'entrée :

```ts
interface BlueprintScene {
  uuid: string;
  label: string;
  note?: string;
  entryBlockId?: string;       // Premier bloc à exécuter
  date: string;
  blocks: BlueprintBlock[];    // Tous les blocs de la scène
  connections: BlueprintConnection[]; // Les arêtes du graphe
}
```

## Connexions

Les connexions relient les ports de sortie d'un bloc aux ports d'entrée du suivant :

```ts
interface BlueprintConnection {
  id: string;
  fromId: string;              // UUID du bloc source
  toId: string;                // UUID du bloc cible
  fromPort: string;            // Nom du port de sortie
  toPort: string;              // Nom du port d'entrée
  fromPortIndex?: number;      // Index du port (portPerCharacter)
}
```

## Dictionnaires

Les dictionnaires définissent des ensembles de valeurs nommées utilisés par les conditions et paramètres d'actions :

```ts
interface Dictionary {
  uuid: string;
  label?: string;
  valueType: 'string' | 'number' | 'boolean';
  rows: DictionaryRow[];
}
```

## Signatures d'actions

Les signatures décrivent les types d'actions réutilisables avec leurs paramètres :

```ts
interface ActionSignature {
  uuid: string;
  id: string;                  // Identifiant unique (ex: "set_flag")
  label?: string;
  params: SignatureParam[];
}
```
