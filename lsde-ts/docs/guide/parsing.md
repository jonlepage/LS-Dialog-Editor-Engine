# Parsing & Import

## Overview

The engine is **format-agnostic** — `engine.init({ data })` receives a deserialized `BlueprintExport` object, not a file or raw string. The engine never reads files and has no dependency on any serialization library.

The [LSDE editor](https://lepasoft.com) exports blueprints in multiple formats:

| Format | Full graph? | Use case |
|--------|------------|----------|
| **JSON** | Yes | Default — widest parser support across all platforms |
| **XML** | Yes | XML-based pipelines, localization tools (XLIFF), legacy systems |
| **YAML** | Yes | Human-readable editing, git-friendly diffs, config-driven workflows |
| **CSV** | No (flat) | Localization / translation — export to Excel or Google Sheets |

CSV exports a flat table of dialogue text by locale. It does **not** contain connections, conditions, or actions — it cannot be used with the engine runtime.

## Recommended Parsers

<!--@include: ../_shared/parsing-table.md-->

## Unity

<!--@include: ../_shared/parsing-unity.md-->

## Unreal Engine

<!--@include: ../_shared/parsing-unreal.md-->

## Godot

<!--@include: ../_shared/parsing-godot.md-->

## TypeScript (TS/JS)

<!--@include: ../_shared/parsing-typescript.md-->

## CSharp (C#)

<!--@include: ../_shared/parsing-csharp.md-->

## CPP (C++)

<!--@include: ../_shared/parsing-cpp.md-->

## Polymorphic Dispatch

`BlueprintScene.blocks` is an array of `BlueprintBlock` — a **discriminated union** with 5 subtypes identified by the `type` field:

| `type` | Subtype | Specific fields |
|--------|---------|----------------|
| `DIALOG` | `DialogBlock` | `dialogueText`, `content`, `structureKey` |
| `CHOICE` | `ChoiceBlock` | `choices` |
| `CONDITION` | `ConditionBlock` | `conditions` |
| `ACTION` | `ActionBlock` | `actions` |
| `NOTE` | `NoteBlock` | *(none)* |

**Dynamically-typed languages** (TypeScript, GDScript) handle this automatically — parsed objects already contain all fields.

**Statically-typed languages** (C#, C++) need a custom converter that reads the `type` field and constructs the correct subtype. Without it, subtype-specific fields like `dialogueText` or `choices` are silently lost.

::: info Companion packages
If you use `LsdeDialogEngine.Newtonsoft` or `LsdeDialogEngine.SystemTextJson`, these converters are already included — just call `LsdeJson.Parse(json)`. The code below is for manual integration only.
:::

<!--@include: ../_shared/parsing-polymorphic.md-->
