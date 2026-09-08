# Blueprints & Scènes

## Structure du blueprint

Un `BlueprintExport` est le fichier JSON exporté de l'éditeur [LSDE](https://lepasoft.com/fr/software/ls-dialog-editor "Lepasoft Dialog Editor"). Il contient toutes les données dont le engine a besoin.

<!--@include: ../../_shared/blueprint-export-type.md-->

## Scenes

Une scene est une séquence de dialogue autonome — une conversation, une cinématique, un tutoriel, une interaction de shop. Dans un jeu, les scenes sont généralement déclenchées par des événements scriptés : le joueur parle à un NPC, entre dans une zone, ou ramasse un objet.

Chaque scene a son propre block d'entrée, son propre flow et son propre état. Plusieurs scenes peuvent tourner en parallèle (ex: un dialogue principal et un overlay de tutoriel). Les scenes sont définies par l'interface [`BlueprintScene`](/api-ref/type-aliases/BlueprintScene) :

<!--@include: ../../_shared/blueprint-scene-type.md-->

## Connections

Les connections sont les fils entre les blocks — elles définissent quel block mène à quel autre. **Il n'y a pas de table de connexions dans l'export** : chaque block porte ses propres fils sortants dans `block.next`, et un fil ne dit que par quel port il part et où il va.

Un fil n'a **jamais** traversé une scène, dans aucune version du format : `to` désigne toujours un block de la même scène.

[`BlueprintConnection`](/api-ref/type-aliases/BlueprintConnection) est la vue **aplatie** de ces fils, celle que rend `engine.getSceneConnections(sceneRef)` — un fil auquel on a rattaché le block dont il part :

<!--@include: ../../_shared/blueprint-connection-type.md-->

Vous n'aurez normalement pas besoin de les inspecter — le engine gère le routing en interne. `engine.getSceneConnections(sceneRef)` les expose pour de l'**inspection de graphe** : une vue de debug qui montre le câblage sans jouer la scène.

## Dictionaries

Les dictionaries décrivent les registres de votre jeu — switches, variables, inventaire. Le développeur les déclare dans [LSDE](https://lepasoft.com/fr/software/ls-dialog-editor "Lepasoft Dialog Editor") pour exposer au narrative designer les variables disponibles dans le moteur. Au runtime, le développeur mappe chaque dictionnaire vers le système correspondant de son jeu. Les [`conditions`](/api-ref/interfaces/ConditionTest) et [`onResolveCondition`](/api-ref/classes/DialogueEngine#onresolvecondition) utilisent ces clés pour évaluer l'état du jeu. Définis par [`DictionaryDefinition`](/api-ref/interfaces/DictionaryDefinition) :

<!--@include: ../../_shared/blueprint-dictionary-type.md-->

## Functions

Les functions décrivent les actions que votre jeu sait exécuter — `set_flag`, `play_sound`, `give_item`. Le développeur les déclare dans [LSDE](https://lepasoft.com/fr/software/ls-dialog-editor "Lepasoft Dialog Editor") pour que le narrative designer compose des séquences avec des paramètres typés. Au runtime, c'est l'`id` de la function que le développeur mappe vers ses propres systèmes : un block ACTION le cite dans `call.fn`, et ses arguments arrivent **par nom** dans `call.args`. Définies par [`FunctionDefinition`](/api-ref/interfaces/FunctionDefinition) :

<!--@include: ../../_shared/blueprint-signature-type.md-->
