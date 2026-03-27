---
layout: home

hero:
  name: LSDEDE
  text: LSDE Dialog Engine
  tagline: 多运行时、回调驱动的图调度器，用于交互式对话 blueprint
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/guide/getting-started
    - theme: alt
      text: API 参考
      link: /api-ref/

features:
  - title: 可视化 Blueprint
    details: 使用 LSDE 编辑器导出的 JSON 文件 — 包含 scene、block、connection、dictionary 和 signature。
  - title: 多运行时
    details: 提供 TypeScript、C#、C++ 和 GDScript 版本。相同的 blueprint 格式、相同的测试套件、原生集成。
  - title: 回调驱动
    details: 没有内部渲染循环。engine 将 block 分发给你的 handler，由你来控制流程。
  - title: 零魔法
    details: engine 是一个纯粹的图遍历机器。你的 4 个 handler 赋予每个 block 以意义 — 没有隐式回退，没有自动求值。
---

## 运行时

| 运行时 | 语言 | 目标 | 源码 |
|---------|------|------|------|
| **TypeScript** | TypeScript | 参考实现 | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, 自定义引擎 | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |
