---
layout: home

hero:
  name: LSDEDE
  text: LSDE Dialog Engine
  tagline: Dispatcher de graphes multi-runtime, callback-driven, pour blueprints de dialogues interactifs
  actions:
    - theme: brand
      text: Pour commencer
      link: /fr/guide/getting-started
    - theme: alt
      text: Référence API
      link: /api-ref/

features:
  - title: Blueprints visuels
    details: Consomme les exports JSON de l'éditeur LSDE — scenes, blocks, connections, dictionaries, signatures.
  - title: Multi-Runtime
    details: Disponible en TypeScript, C#, C++ et GDScript. Même format de blueprint, même suite de tests, intégration native.
  - title: Callback-driven
    details: Pas de render loop interne. Le engine dispatch les blocks aux handlers enregistrés — le code appelant contrôle le flow.
  - title: Zero Magic
    details: Le engine est une pure machine de traversée de graphe. Les 4 handlers donnent un sens à chaque block — pas de fallbacks cachés, pas d'auto-évaluation.
---

## Runtimes

| Runtime | Langage | Cible | Source |
|---------|---------|-------|--------|
| **TypeScript** | TypeScript | Implémentation de référence | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, engines custom | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |
