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

### Les vingt-cinq diagnostics

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
| `EMPTY_FUNCTION` | Une action a un appel sans fonction choisie. Le jeu reçoit un appel qu'il ne peut pas exécuter |
| `UNDECLARED_FUNCTION` | Une action appelle une fonction que l'export ne déclare pas — un id v1 resté dans le projet, par exemple. Avant, ça chargeait en silence et échouait en jeu |
| `UNDECLARED_ARGUMENT` | Un appel passe un argument que la fonction ne déclare pas |
| `UNDECLARED_DICTIONARY_KEY` | Un argument `dictionaryKey` n'est pas une entrée du dictionnaire que nomme son paramètre |
| `UNDECLARED_DICTIONARY` | Une condition teste un dictionnaire que l'export ne déclare pas |
| `UNDECLARED_ENTRY` | Une condition teste une entrée que son dictionnaire ne déclare pas |
| `UNKNOWN_CHOICE_BLOCK` | Un test sur le dictionnaire réservé `choice` nomme un block qui n'est pas un CHOICE de cette scène |
| `UNKNOWN_CHOICE_OPTION` | Un test sur le dictionnaire réservé `choice` nomme une option que ce CHOICE n'a pas |
| `UNKNOWN_FUNCTION` | Une action appelle un id de fonction que votre `check.functions` ne liste pas |
| `UNKNOWN_DICTIONARY` | Une condition teste un id de dictionnaire que votre `check.dictionaries` ne liste pas |
| `UNKNOWN_DICTIONARY_ENTRY` | Le dictionnaire est connu, la clé d'entrée non |
| `UNKNOWN_CARD` | Un block cite un NOM de carte d'acteur que votre `check.cards` ne liste pas |

Les quatre derniers n'apparaissent que si vous passez `check` — sans lui le engine n'a rien à quoi comparer.
Les huit au-dessus sont toujours actifs : ils comparent ce que les blocks UTILISENT à ce que l'export
DÉCLARE lui-même, donc sans `check`.

Un diagnostic trouvé dans une scène porte `sceneId` — l'id stable (`sc_…`), celui que rend
`handle.getSceneId()` — et `scenePath`, plus `blockId` quand il vise un block.


