# Blueprints & Scènes

## Structure du blueprint

Un `BlueprintExport` est le fichier JSON exporté de l'éditeur [LSDE](https://lepasoft.com/fr/software/ls-dialog-editor "Lepasoft Dialog Editor"). Il contient toutes les données dont le engine a besoin.

<!--@include: ../../_shared/blueprint-export-type.md-->

## Scenes

Une scene est une séquence de dialogue autonome — une conversation, une cinématique, un tutoriel, une interaction de shop. Dans un jeu, les scenes sont généralement déclenchées par des événements scriptés : le joueur parle à un NPC, entre dans une zone, ou ramasse un objet.

Chaque scene a son propre block d'entrée, son propre flow et son propre état. Plusieurs scenes peuvent tourner en parallèle (ex: un dialogue principal et un overlay de tutoriel). Les scenes sont définies par l'interface [`BlueprintScene`](/api-ref/interfaces/BlueprintScene) :

<!--@include: ../../_shared/blueprint-scene-type.md-->

## Connections

Les connections sont les fils entre les blocks — elles définissent quel block mène à quel autre. Dans l'éditeur, on les dessine visuellement; dans l'export, elles deviennent une liste plate de liens source → cible définis par l'interface [`BlueprintConnection`](/api-ref/interfaces/BlueprintConnection) :

<!--@include: ../../_shared/blueprint-connection-type.md-->

Vous n'aurez normalement pas besoin d'inspecter les connections directement — le engine gère le routing en interne. Elles sont toutefois accessibles via [`onValidateNextBlock`](/api-ref/classes/DialogueEngine#onvalidatenextblock) si nécessaire.

## Dictionaries

Les dictionaries décrivent les registres de votre jeu — switches, variables, inventaire. Le développeur les déclare dans [LSDE](https://lepasoft.com/fr/software/ls-dialog-editor "Lepasoft Dialog Editor") pour exposer au narrative designer les variables disponibles dans le moteur. Au runtime, le développeur mappe chaque dictionnaire vers le système correspondant de son jeu. Les [`conditions`](/api-ref/interfaces/ExportCondition) et [`setChoiceFilter`](/api-ref/classes/DialogueEngine#setchoicefilter) utilisent ces clés pour évaluer l'état du jeu. Définis par [`Dictionary`](/api-ref/interfaces/Dictionary) :

<!--@include: ../../_shared/blueprint-dictionary-type.md-->

## Action Signatures

Les signatures décrivent les types d'actions disponibles dans votre jeu — `set_flag`, `play_sound`, `give_item`. Le développeur les déclare dans [LSDE](https://lepasoft.com/fr/software/ls-dialog-editor "Lepasoft Dialog Editor") pour que le narrative designer compose des séquences d'actions avec des paramètres typés. Au runtime, le `id` de la signature est ce que le développeur mappe vers ses propres systèmes. Définis par [`ActionSignature`](/api-ref/interfaces/ActionSignature) :

<!--@include: ../../_shared/blueprint-signature-type.md-->
