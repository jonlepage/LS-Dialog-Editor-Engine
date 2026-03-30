# Intégration avec un game engine

Le LSDE engine est une pure machine de traversée de graphe — il walk les nodes et call les handlers enregistrés. **Les handlers sont le pont entre le engine et le jeu.** Cette page montre comment les brancher dans de vrais game engines.

## Le pattern

Chaque intégration suit la même danse en 3 étapes :

1. **Initialiser** — feed le engine le blueprint JSON
2. **Connecter** — plug les 4 handlers dans les systèmes de jeu (UI, state, audio...)
3. **Starter** — le engine call les handlers, le code exécute la logique

Le engine ne touche jamais à l'UI, au state ou à l'audio. Il indique juste *ce qui* s'est passé. Le code décide *comment* réagir. C'est comme un directeur qui lit les directions de scène — le jeu c'est le cast, le crew et la scène.

## Afficher le dialogue

Quand le engine atteint un block de type dialog, il appelle le handler `onDialog` en lui fournissant les données du block : texte, personnage, propriétés natives.

C'est au développeur de récupérer ces données et de les exploiter dans son moteur de jeu — afficher une bulle de dialogue, animer un personnage, jouer une voix.

L'appel à `next()` signale au engine que le block est traité et qu'il peut passer au suivant. Le moment de cet appel appartient entièrement au jeu : après un input joueur, à la fin d'une animation, au terme d'un délai.

L'exemple suivant suppose un jeu qui affiche du dialogue textuel et progresse quand le joueur appuie sur un input.

<!--@include: ../../_shared/integration-dialog.md-->

## Présenter des choix

Spawner des éléments UI dynamiquement, laisser le joueur choisir, et indiquer au engine ce qui a été sélectionné.

<!--@include: ../../_shared/integration-choice.md-->

## Évaluer les conditions

Le game state, les règles du jeu. Le engine a juste besoin d'un `true` ou `false`.

<!--@include: ../../_shared/integration-condition.md-->

## Exécuter des actions

C'est ici que le jeu prend vie — jouer des sons, donner des items, set des flags, trigger des cutscenes.

<!--@include: ../../_shared/integration-action.md-->

## Ce qui connecte où

| Handler | Ce que le engine communique | Ce que le handler fait |
|---|---|---|
| `onDialog` | "Affiche ce texte de ce personnage" | Afficher l'UI, jouer la voix, attendre l'input |
| `onChoice` | "Voici les options (taggées visible/hidden)" | Spawn des boutons, gérer la sélection |
| `onCondition` | "Évalue ces conditions" | Checker le game state, retourner true/false |
| `onAction` | "Exécute ces effets" | Set des flags, donner des items, jouer des sons |
| `onResolveCharacter` | "Quel personnage est actif?" | Système de party, formation de bataille |
| `setChoiceFilter` | "Est-ce que cette condition est vraie pour la visibilité?" | Checker inventaire, flags, state des quêtes |
| `onValidateNextBlock` | "Ce block est le prochain — est-il autorisé ?" | Character gating, vérification de statut, règles de transition |
| `onBeforeBlock` | "Un block est sur le point de s'exécuter" | Gérer les delays, transitions, fade-ins |

## Pro Tips

- **`next()` est la télécommande.** L'appeler instantanément pour du dialogue rapide, ou le garder en réserve jusqu'à ce qu'une animation finisse. Le engine attend — il n'a aucun concept du temps.
- **Les fonctions de cleanup c'est du housekeeping gratuit.** En retourner une de n'importe quel handler et le engine va l'appeler quand il move au prochain block. Parfait pour cacher l'UI, stopper l'audio ou free des nodes spawnés.
- **`onBeforeBlock` gère les delays.** Le engine n'enforce pas `delay` — c'est le handler `onBeforeBlock` qui lit `nativeProperties.delay` et appelle `resolve()` après un timer. Full control.
- **Les async tracks sont des storylines parallèles.** Si une cutscene a besoin de dialogue et de mouvements de caméra en même temps, marquer les blocks comme `isAsync` dans l'éditeur. Chaque track run indépendamment.
