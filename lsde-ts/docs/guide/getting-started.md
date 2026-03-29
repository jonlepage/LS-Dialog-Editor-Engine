# Getting Started

## Installation

<!--@include: ../_shared/install-tabs.md-->

## Minimal Usage

The engine is a graph traversal machine — it dispatches blocks to registered handlers, which give them meaning. Without handlers, the engine has no output.

<!--@include: ../_shared/getting-started-usage.md-->

::: tip Why are the 4 handlers required?
The engine is a pure graph traversal machine — it walks the nodes and calls handler code. Without handlers, blocks would be visited silently with no output. The `start()` validation catches this early so there is never a scene that runs but does nothing.
:::

## Blueprint Validation

`engine.init()` returns a diagnostic report containing:

| Field | Type | Description |
|-------|------|-------------|
| `errors` | `DiagnosticEntry[]` | Blocking errors — the engine does not initialize |
| `warnings` | `DiagnosticEntry[]` | Non-blocking warnings |
| `stats` | `DiagnosticStats` | Counts: scenes, blocks, connections |

The `check` option can also be provided to cross-validate against the host application's capabilities:

<!--@include: ../_shared/getting-started-validation.md-->

## What's Next

- [Block Types](/guide/block-types) — Detailed reference for each block type and handler
- [Choice Visibility](/guide/choice-visibility) — Opt-in tagging and filtering
- [Handlers & Lifecycle](/guide/handlers) — Two-tier system, cleanup, async tracks
