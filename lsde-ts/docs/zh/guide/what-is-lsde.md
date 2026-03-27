# 什么是 LSDEDE？

**LSDE**（LS Dialog Editor）是一款面向游戏和软件开发者的免费工具，集成了可视化对话图编辑、AI翻译、语音生成、i18n代码集成和项目诊断等功能。更多信息请参阅 [lepasoft.com/zh/software/ls-dialog-editor](https://lepasoft.com/zh/software/ls-dialog-editor)。LSDE 将对话图导出为 JSON blueprint，其中包含 scene、block、connection、dictionary 和 action signature。

**LSDEDE**（LSDE Dialog Engine）是加载并执行这些 blueprint 的多运行时 engine。它提供多种语言版本，可原生集成到各种游戏引擎或框架中。

## 可用运行时

| 运行时 | 语言 | 目标 | 源码 |
|---------|------|------|------|
| **TypeScript** | TypeScript / JavaScript | 参考实现 | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, 自定义引擎 | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |

所有运行时共享相同的 blueprint 格式，并通过一套通用的跨语言测试套件（42 个测试用例）。

## 架构

每个运行时都遵循相同的**回调驱动图调度器**模式：

1. **Blueprint** — 从 LSDE 导出的 JSON 文件，包含 scene、block 和 connection。
2. **Engine** — 验证 blueprint，构建内部图，并将 block 分发给已注册的 handler。
3. **Handler** — 由开发者编写的函数，用于响应每种 block 类型（dialog、choice、condition、action）。
4. **宿主应用程序** — condition、action 和角色解析由 handler callback 处理。

```
  Blueprint (JSON)
        │
        ▼
     Engine ◄── next() ──┐
        │                 │
     dispatch             │
        │                 │
        ▼                 │
     Handlers ────────────┘
```

## 设计原则

- **零依赖** — 任何语言版本都没有运行时依赖。
- **框架无关** — 可与任何游戏引擎或 UI 框架配合使用。
- **回调驱动** — 没有内部渲染循环。在准备好时调用 `next()` 即可。
- **双层 handler** — 全局（engine 级别）和 scene 级别 handler，支持 `preventGlobalHandler()`。
- **跨语言一致性** — 所有运行时对相同的 blueprint 产生相同的输出。
