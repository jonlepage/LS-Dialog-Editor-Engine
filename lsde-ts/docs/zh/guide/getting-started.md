# 快速入门

## 安装

<!--@include: ../../_shared/install-tabs.md-->

## 基本用法

engine 是一个图遍历机器 — 它将 block 分发给已注册的 handler，由 handler 赋予其意义。没有 handler 的话，engine 不会产生任何输出。

<!--@include: ../../_shared/getting-started-usage.md-->

::: tip 为什么 4 个 handler 是必需的？
engine 是一个纯粹的图遍历机器 — 它遍历节点并调用已注册的 handler。没有 handler 的话，block 会被静默访问而没有任何输出。`start()` 的验证机制会提前捕获这个问题，避免出现运行但无任何输出的 scene。
:::

## Blueprint 验证

`engine.init()` 返回一个诊断报告，包含：

| 字段 | 类型 | 描述 |
|------|------|------|
| `errors` | `DiagnosticEntry[]` | 阻断性错误 — engine 不会初始化 |
| `warnings` | `DiagnosticEntry[]` | 非阻断性警告 |
| `stats` | `DiagnosticStats` | 计数：scene、block、connection |

还可以提供 `check` 选项，与宿主应用程序的功能进行交叉验证：

<!--@include: ../../_shared/getting-started-validation.md-->

## 下一步

- [Block 类型](/zh/guide/block-types) — 每种 block 类型和 handler 的详细参考
- [Choice 可见性](/zh/guide/choice-visibility) — 可选的标记和过滤系统
- [Handler 与生命周期](/zh/guide/handlers) — 双层系统、清理函数、异步轨道
