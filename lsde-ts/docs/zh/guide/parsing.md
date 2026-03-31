# 解析与导入

## 概述

engine 是**格式无关的** — `engine.init({ data })` 接收一个已反序列化的 `BlueprintExport` 对象，而不是文件或原始字符串。engine 不读取文件，也不依赖任何序列化库。

[LSDE 编辑器](https://lepasoft.com)以多种格式导出蓝图：

| 格式 | 完整图？ | 用途 |
|------|---------|------|
| **JSON** | 是 | 默认 — 所有平台支持最广泛 |
| **XML** | 是 | XML 管线、本地化工具 (XLIFF)、旧系统 |
| **YAML** | 是 | 人类可读编辑、git diff 友好、配置驱动工作流 |
| **CSV** | 否（扁平） | 本地化/翻译 — 导出到 Excel 或 Google Sheets |

CSV 导出按区域设置的对话文本扁平表。它**不包含**连接、条件或动作 — 不能用于 engine 运行时。

## 推荐解析器

<!--@include: ../../_shared/parsing-table.md-->

## Unity

<!--@include: ../../_shared/parsing-unity.md-->

## Unreal Engine

<!--@include: ../../_shared/parsing-unreal.md-->

## Godot

<!--@include: ../../_shared/parsing-godot.md-->

## TypeScript (TS/JS)

<!--@include: ../../_shared/parsing-typescript.md-->

## CSharp (C#)

<!--@include: ../../_shared/parsing-csharp.md-->

## CPP (C++)

<!--@include: ../../_shared/parsing-cpp.md-->

## 多态分发

`BlueprintScene.blocks` 是 `BlueprintBlock` 的数组 — 一个通过 `type` 字段标识的**可辨识联合类型**，包含 5 个子类型：

| `type` | 子类型 | 特有字段 |
|--------|-------|---------|
| `DIALOG` | `DialogBlock` | `dialogueText`, `content`, `structureKey` |
| `CHOICE` | `ChoiceBlock` | `choices` |
| `CONDITION` | `ConditionBlock` | `conditions` |
| `ACTION` | `ActionBlock` | `actions` |
| `NOTE` | `NoteBlock` | *（无）* |

**动态类型语言**（TypeScript、GDScript）自动处理 — 解析后的对象已包含所有字段。

**静态类型语言**（C#、C++）需要自定义转换器来读取 `type` 字段并构造正确的子类型。否则，`dialogueText` 或 `choices` 等子类型特有字段将被静默丢失。

<!--@include: ../../_shared/parsing-polymorphic.md-->
