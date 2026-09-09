# Pour commencer

## Installation

<!--@include: ../../_shared/install-tabs.md-->

## Usage minimal

Le engine est une machine de traversée de graphe — il dispatch les blocks aux handlers enregistrés qui leur donnent un sens. Sans handlers, le engine n'a aucun output.

::: tip Agnostique du format
Le engine consomme un objet `BlueprintExport`, pas un fichier. Vous pouvez charger votre blueprint depuis JSON, XML ou YAML avec n'importe quel parseur adapté à votre plateforme. Voir [Parsing & import](./parsing) pour les recommandations.
:::

<!--@include: ../../_shared/getting-started-usage.md-->

## Validation du blueprint

`engine.init()` retourne un [rapport de diagnostic](/api-ref/interfaces/DiagnosticReport) avec erreurs, warnings et stats. L'option `check` permet de cross-valider avec les capabilities du jeu :

<!--@include: ../../_shared/getting-started-validation.md-->

### Les dix-sept diagnostics

**Erreurs — le payload est refusé et rien ne joue.** `errors` n'est pas vide et `engine.scene()` n'a rien à vous rendre.

| Code | Ce qui s'est passé |
|---|---|
| `MISSING_DATA` | Aucun `data` n'a été passé à `init()` |
| `MISMATCHED_EXPORTS` | Plusieurs fichiers fusionnés qui viennent d'exports différents — `project` ou `exportedAt` divergent. Passez les fichiers d'UN seul export |
| `WRONG_NAMING_CONVENTION` | Exporté en `snake_case` ou `PascalCase` ; le engine lit du camelCase. Paramètres du projet › Exporteurs › Convention de nommage |
| `INVALID_FORMAT` | `format` n'est pas `lsde-blueprints`. C'est aussi ce que rapportent C# et C++ pour le cas ci-dessus : ils valident un objet typé, les noms de clés d'origine ont déjà disparu |
| `UNSUPPORTED_FORMAT_VERSION` | `version` n'est pas `1`. Un projet encore sur LSDE 1.6 appartient au engine 0.3.x — il n'y a pas de lecteur double |
| `NO_SCENES` | Le payload ne porte aucune scène |
| `DUPLICATE_SCENE` | Deux scènes partagent un path ou un id stable |
| `MISSING_SCENE_PATH` | Une scène n'a pas de path |
| `DUPLICATE_BLOCK_ID` | Deux blocks de la MÊME scène partagent un id. D'une scène à l'autre c'est légal et attendu — un block est (scène, id) |
| `INVALID_START_BLOCK` | La scène nomme un block de départ qui n'est pas l'un de ses blocks |
| `BROKEN_LINK` | Un fil pointe vers un block absent de la scène. La traversée n'aurait simplement nulle part où aller |

**Avertissements — ça joue, et quelque chose ne marchera pas en silence.** Lisez-les ; aucun n'est du bruit.

| Code | Ce que ça vous coûte |
|---|---|
| `NO_START_BLOCK` | La scène n'a pas de block de départ, donc `start()` n'a nulle part où commencer |
| `UNKNOWN_WAIT_BLOCK` | Un id de `waitForBlocks` n'est pas un block de la scène, donc cette piste se gare **pour de bon**. La vérification ne peut pas aller plus loin : un id qui existe peut n'être jamais joué |
| `UNKNOWN_FUNCTION` | Une action appelle un id de fonction que votre `check.functions` ne liste pas |
| `UNKNOWN_DICTIONARY` | Une condition teste un id de dictionnaire que votre `check.dictionaries` ne liste pas |
| `UNKNOWN_DICTIONARY_ENTRY` | Le dictionnaire est connu, la clé d'entrée non |
| `UNKNOWN_CARD` | Un block cite un NOM de carte d'acteur que votre `check.cards` ne liste pas |

Les quatre derniers n'apparaissent que si vous passez `check` — sans lui le engine n'a rien à quoi comparer.


