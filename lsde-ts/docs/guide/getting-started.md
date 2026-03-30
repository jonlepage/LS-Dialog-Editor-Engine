# Getting Started

## Installation

<!--@include: ../_shared/install-tabs.md-->

## Minimal Usage

The engine is a graph traversal machine — it dispatches blocks to registered handlers, which give them meaning. Without handlers, the engine has no output.

<!--@include: ../_shared/getting-started-usage.md-->

## Blueprint Validation

`engine.init()` returns a [diagnostic report](/api-ref/interfaces/DiagnosticReport) with errors, warnings, and stats. The `check` option cross-validates against the host application's capabilities:

<!--@include: ../_shared/getting-started-validation.md-->

