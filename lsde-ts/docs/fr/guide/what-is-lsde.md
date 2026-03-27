# C'est quoi LSDEDE?

**LSDE** (LepaSoft Dialogue Editor) est l'éditeur visuel pour designer des systèmes de dialogue interactifs. Il exporte les graphes de dialogue en blueprints JSON contenant des scenes, blocks, connections, dictionaries et action signatures.

**LSDEDE** (LSDE Dialog Engine) est le engine multi-runtime qui load et exécute ces blueprints. Il est disponible en plusieurs langages pour que tu puisses l'intégrer nativement dans ton game engine ou framework de choix.

## Runtimes disponibles

| Runtime | Langage | Cible | Source |
|---------|---------|-------|--------|
| **TypeScript** | TypeScript / JavaScript | Implémentation de référence | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, engines custom | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |

Tous les runtimes partagent le même format de blueprint et passent une suite de tests cross-language commune (42 cas de test).

## Architecture

Chaque runtime suit le même pattern de **callback-driven graph dispatcher** :

1. **Blueprint** — Un fichier JSON exporté de LSDE, contenant les scenes, blocks et connections.
2. **Engine** — Valide le blueprint, build le graphe interne et dispatch les blocks à tes handlers.
3. **Handlers** — Tes fonctions qui réagissent à chaque type de block (dialog, choice, condition, action).
4. **Ton jeu** — Les conditions, actions et la résolution de personnages sont gérées par tes handler callbacks.

```
Blueprint JSON → engine.init() → engine.scene(id).start()
                                        ↓
                              onDialog / onChoice / ...
                                        ↓
                                  next() → next block
```

## Principes de design

- **Zero-dependency** — Aucune dépendance runtime dans aucun langage.
- **Framework-agnostic** — Fonctionne avec n'importe quel game engine ou UI framework.
- **Callback-driven** — Pas de render loop interne. Tu call `next()` quand t'es prêt.
- **Two-tier handlers** — Handlers globaux (engine-level) et scene-level avec `preventGlobalHandler()`.
- **Conformité cross-language** — Tous les runtimes produisent un output identique pour le même blueprint.
