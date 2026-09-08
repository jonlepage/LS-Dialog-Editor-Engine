# Intégration moteur

LSDE est agnostique — aucune dépendance sur un moteur de jeu, un framework UI ou un système audio. Il traverse un graphe et appelle vos handlers. Cette page montre comment le brancher dans les moteurs les plus courants.

Pour l'implémentation détaillée de chaque type de handler, voir [Types de blocks](./block-types) et [Handlers](./handlers).

## Intégration complète

L'exemple suivant montre une façon d'intégrer LSDE dans chaque moteur. Il couvre les 4 handlers requis — dialog, choice, condition, action — dans une seule classe, comme point de départ.

Chaque jeu a ses propres besoins. Adaptez la structure, le découpage et l'UI à votre projet.

<!--@include: ../../_shared/integration-complete.md-->

## Les 4 handlers

Chaque handler reçoit les données du block et un callback `next()`. C'est au développeur de traiter ces données dans son moteur, puis d'appeler `next()` quand le block est terminé. Le moment de cet appel appartient entièrement au jeu.

- **Dialog** — texte, personnage, propriétés natives. Affichez le dialogue dans votre UI, attendez l'input joueur ou un délai, puis appelez `next()`. Retournez une fonction de cleanup pour masquer l'UI quand le engine passe au block suivant.

- **Choice** — liste de choix tagués `visible` quand `onResolveCondition()` est installé. Le engine vous rend **toutes** les options, taguées ; filtrez sur `visible !== false`. Créez les éléments UI correspondants — boutons, liste, radial menu. Au choix du joueur, `selectChoice(optionId)` indique la branche à suivre, puis `next()` avance le flow.

- **Condition** — cas définis dans le block. Installez `onResolveCondition()` une fois et le engine les pré-évalue : `onCondition` devient facultatif. Pour forcer une sortie, `context.resolve(port)` prend un **nom de port** — `"out"`, `"default"`, ou le port d'un cas (`"K1"`).

- **Action** — les appels du block, dans `context.calls` : un `fn` et ses `args` **par nom**. Exécutez-les dans votre moteur — jouer un son, donner un item, déclencher une cinématique. `context.resolve()` sort par `then`, `context.reject()` sort par `catch` (et retombe sur `then` si aucun `catch` n'est câblé).

## Tips

- **`next()` est la télécommande.** L'appeler instantanément pour du dialogue rapide, ou le garder en réserve jusqu'à ce qu'une animation finisse. Le engine attend — il n'a aucun concept du temps.
- **Les fonctions de cleanup nettoient derrière vous.** Retournez une fonction depuis n'importe quel handler — le engine l'appelle quand il passe au block suivant. Idéal pour masquer l'UI, stopper l'audio ou libérer des nodes.
- **`onBeforeBlock` gère les delays.** Le engine n'impose pas `props.delay` — c'est `onBeforeBlock` qui le lit et appelle `resolve()` après un timer. Contrôle total.
- **Les tracks async sont des flux parallèles.** Quand une cutscene a besoin de dialogue et de mouvement de caméra en simultané, les blocks marqués `isAsync` dans l'éditeur s'exécutent sur des tracks indépendantes.
