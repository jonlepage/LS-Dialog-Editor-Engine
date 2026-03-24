# Démarrage rapide

## Installation

```bash
npm install @lsde/dialog-engine
```

## Usage minimal

```ts
import { DialogueEngine } from '@lsde/dialog-engine';
import type { BlueprintExport, StateBridge } from '@lsde/dialog-engine';

// 1. Charger le blueprint exporté depuis l'éditeur
import blueprintJson from './blueprint.json';
const data = blueprintJson as BlueprintExport;

// 2. Créer et initialiser le moteur
const engine = new DialogueEngine();
const report = engine.init({ data });

if (report.errors.length > 0) {
  console.error('Blueprint invalide:', report.errors);
  // Ne pas continuer — le moteur n'est pas initialisé
}

// 3. Configurer la locale
engine.setLocale('fr');

// 4. Brancher le StateBridge
const bridge: StateBridge = {
  evaluateCondition: (cond) => {
    // Évaluer la condition contre l'état du jeu
    return true;
  },
  executeAction: (action, signature) => {
    // Exécuter l'action dans le jeu
  },
  resolveDictionary: (group, key) => {
    // Résoudre une valeur de dictionnaire
    return `${group}.${key}`;
  },
};
engine.setStateBridge(bridge);

// 5. Enregistrer les handlers
engine.onDialog(({ block, context, next }) => {
  const text = block.dialogueText?.['fr'] ?? '';
  const char = context.character;
  console.log(`${char?.name ?? '???'}: ${text}`);
  next(); // Avancer au bloc suivant
});

engine.onChoice(({ context, next }) => {
  console.log('Choix disponibles:', context.choices);
  // Sélectionner un choix
  context.selectChoice(context.choices[0].uuid);
  next();
});

// 6. Lancer une scène
const sceneId = data.scenes[0].uuid;
const handle = engine.scene(sceneId);
handle.start();
```

## Validation du blueprint

`engine.init()` retourne un `DiagnosticReport` contenant :

| Champ | Type | Description |
|-------|------|-------------|
| `errors` | `DiagnosticEntry[]` | Erreurs bloquantes — le moteur ne s'initialise pas |
| `warnings` | `DiagnosticEntry[]` | Avertissements non-bloquants |
| `stats` | `DiagnosticStats` | Compteurs : scènes, blocs, connexions |

Vous pouvez aussi fournir `check` pour cross-valider contre les capacités de votre jeu :

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
