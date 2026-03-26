---
layout: home

hero:
  name: LSDEDE
  text: LSDE Dialog Engine
  tagline: Multi-runtime, callback-driven graph dispatcher for interactive dialogue blueprints
  actions:
    - theme: brand
      text: Getting Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api-ref/

features:
  - title: Visual Blueprints
    details: Consume JSON exports from the LSDE editor — scenes, blocks, connections, dictionaries, signatures.
  - title: Multi-Runtime
    details: Available in TypeScript, C#, C++, and GDScript. Same blueprint format, same test suite, native integration.
  - title: Callback-driven
    details: No internal render loop. The engine dispatches blocks to your handlers and you control the flow.
  - title: Zero Magic
    details: The engine is a pure graph traversal machine. Your 4 handlers give meaning to each block — no hidden fallbacks, no auto-evaluation.
---

## Runtimes

| Runtime | Language | Target | Source |
|---------|----------|--------|--------|
| **TypeScript** | TypeScript | Reference implementation | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, custom engines | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |
