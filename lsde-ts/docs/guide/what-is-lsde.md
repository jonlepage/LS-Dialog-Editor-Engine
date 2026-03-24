# Qu'est-ce que LSDE?

**LSDE Dialog Engine** est le runtime TypeScript de référence pour exécuter les blueprints de dialogues créés avec l'éditeur LS-Dialog.

## Architecture

Le moteur fonctionne comme un **graph dispatcher callback-driven** :

1. **Blueprint** — Un fichier JSON exporté depuis l'éditeur, contenant des scènes, blocs et connexions.
2. **Engine** — Valide le blueprint, construit le graphe interne et dispatch les blocs vers vos handlers.
3. **Handlers** — Vos fonctions qui réagissent à chaque type de bloc (dialogue, choix, condition, action).
4. **StateBridge** — Le pont entre le moteur et l'état de votre jeu.

```
Blueprint JSON → engine.init() → engine.scene(id).start()
                                        ↓
                              onDialog / onChoice / ...
                                        ↓
                                  next() → bloc suivant
```

## Principes de design

- **Zero-dependency** — Aucune dépendance runtime.
- **Framework-agnostic** — Fonctionne avec n'importe quel moteur de jeu ou framework UI.
- **Callback-driven** — Pas de boucle de rendu interne. Vous appelez `next()` quand vous êtes prêt.
- **Two-tier handlers** — Handlers globaux (engine-level) et handlers de scène (scene-level) avec `preventGlobalHandler()`.
