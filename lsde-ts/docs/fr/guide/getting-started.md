# Pour commencer

## Installation

<!--@include: ../../_shared/install-tabs.md-->

## Usage minimal

Le engine est une machine de traversée de graphe — il dispatch les blocks aux handlers enregistrés qui leur donnent un sens. Sans handlers, le engine n'a aucun output.

<!--@include: ../../_shared/getting-started-usage.md-->

## Validation du blueprint

`engine.init()` retourne un [rapport de diagnostic](/api-ref/interfaces/DiagnosticReport) avec erreurs, warnings et stats. L'option `check` permet de cross-valider avec les capabilities du jeu :

<!--@include: ../../_shared/getting-started-validation.md-->

