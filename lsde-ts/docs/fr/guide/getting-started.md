# Pour commencer

## Installation

<!--@include: ../../_shared/install-tabs.md-->

## Usage minimal

Le engine est une machine de traversée de graphe — il dispatch les blocks aux handlers enregistrés qui leur donnent un sens. Sans handlers, le engine n'a aucun output.

<!--@include: ../../_shared/getting-started-usage.md-->

::: tip Pourquoi les 4 handlers sont required?
Le engine est une pure machine de traversée de graphe — il walk les nodes et call le code des handlers. Sans handlers, les blocks seraient visités en silence sans aucun output. La validation au `start()` catch ça early pour éviter qu'une scene run sans produire aucun résultat.
:::

## Validation du blueprint

`engine.init()` retourne un rapport de diagnostic contenant :

| Champ | Type | Description |
|-------|------|-------------|
| `errors` | `DiagnosticEntry[]` | Erreurs bloquantes — le engine ne s'initialise pas |
| `warnings` | `DiagnosticEntry[]` | Warnings non-bloquants |
| `stats` | `DiagnosticStats` | Compteurs : scenes, blocks, connections |

Il est aussi possible de fournir `check` pour cross-valider avec les capabilities du jeu :

<!--@include: ../../_shared/getting-started-validation.md-->

## La suite

- [Types de blocks](/fr/guide/block-types) — Référence détaillée pour chaque type de block et son handler
- [Choice Visibility](/fr/guide/choice-visibility) — Système opt-in de tagging et filtrage
- [Handlers & Lifecycle](/fr/guide/handlers) — Système two-tier, cleanup, async tracks
