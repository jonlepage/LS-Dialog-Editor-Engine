# Parsing & import

## Vue d'ensemble

Le engine est **agnostique du format** — `engine.init({ data })` reçoit un objet `BlueprintExport` désérialisé, pas un fichier ni une string brute. Le engine ne lit jamais de fichiers et n'a aucune dépendance sur une librairie de sérialisation.

L'[éditeur LSDE](https://lepasoft.com) exporte les blueprints en plusieurs formats :

| Format | Graphe complet? | Usage |
|--------|----------------|-------|
| **JSON** | Oui | Par défaut — support le plus large sur toutes les plateformes |
| **XML** | Oui | Pipelines XML, outils de localisation (XLIFF), systèmes legacy |
| **YAML** | Oui | Édition humaine, diffs git lisibles, workflows config-driven |
| **CSV** | Non (plat) | Localisation / traduction — export vers Excel ou Google Sheets |

Le CSV exporte un tableau plat de textes par locale. Il ne contient **pas** de connections, conditions ni actions — il ne peut pas être utilisé avec le runtime engine.

## Parseurs recommandés

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

## Dispatch polymorphe

`BlueprintScene.blocks` est un tableau de `BlueprintBlock` — une **union discriminée** avec 5 sous-types identifiés par le champ `type` :

| `type` | Sous-type | Champs spécifiques |
|--------|-----------|-------------------|
| `DIALOG` | `DialogBlock` | `dialogueText`, `content`, `structureKey` |
| `CHOICE` | `ChoiceBlock` | `choices` |
| `CONDITION` | `ConditionBlock` | `conditions` |
| `ACTION` | `ActionBlock` | `actions` |
| `NOTE` | `NoteBlock` | *(aucun)* |

Les **langages dynamiques** (TypeScript, GDScript) gèrent ça automatiquement — les objets parsés contiennent déjà tous les champs.

Les **langages typés** (C#, C++) ont besoin d'un converter custom qui lit le champ `type` et construit le bon sous-type. Sans ça, les champs spécifiques comme `dialogueText` ou `choices` sont silencieusement perdus.

::: info Packages compagnons
Si vous utilisez `LsdeDialogEngine.Newtonsoft` ou `LsdeDialogEngine.SystemTextJson`, ces converters sont déjà inclus — appelez simplement `LsdeJson.Parse(json)`. Le code ci-dessous est pour l'intégration manuelle uniquement.
:::

<!--@include: ../../_shared/parsing-polymorphic.md-->
