# Blueprints & Scenes

## Blueprint Structure

A `BlueprintExport` is the JSON file exported from the [LSDE](https://lepasoft.com/en/software/ls-dialog-editor "Lepasoft Dialog Editor") editor. It contains all the data the engine needs.

<!--@include: ../_shared/blueprint-export-type.md-->

## Scenes

A scene is a self-contained dialogue sequence — a conversation, a cutscene, a tutorial prompt, a shop interaction. In a game, scenes are typically triggered by script events: the player talks to an NPC, enters a zone, or picks up an item.

Each scene has its own entry block, its own flow, and its own state. Multiple scenes can run in parallel (e.g. a main dialogue and a tutorial overlay). Scenes are defined by the [`BlueprintScene`](/api-ref/interfaces/BlueprintScene) interface:

<!--@include: ../_shared/blueprint-scene-type.md-->

## Connections

Connections are the wires between blocks — they define which block leads to which. In the editor, you draw them visually; in the export, they become a flat list of source → target links defined by the [`BlueprintConnection`](/api-ref/interfaces/BlueprintConnection) interface:

<!--@include: ../_shared/blueprint-connection-type.md-->

You won't typically need to inspect connections directly — the engine handles routing internally. They are however exposed in [`onValidateNextBlock`](/api-ref/classes/DialogueEngine#onvalidatenextblock) if needed.

## Dictionaries

Dictionaries describe the registers of your game — switches, variables, inventory. The developer declares them in the [LSDE](https://lepasoft.com/en/software/ls-dialog-editor "Lepasoft Dialog Editor") editor to expose available game variables to the narrative designer. At runtime, the developer maps each dictionary to the corresponding system in their game. [`Conditions`](/api-ref/interfaces/ExportCondition) and [`onResolveCondition`](/api-ref/classes/DialogueEngine#onresolvecondition) use these keys to evaluate game state. Defined by the [`Dictionary`](/api-ref/interfaces/Dictionary) interface:

<!--@include: ../_shared/blueprint-dictionary-type.md-->

## Action Signatures

Signatures describe the action types available in your game — `set_flag`, `play_sound`, `give_item`. The developer declares them in the [LSDE](https://lepasoft.com/en/software/ls-dialog-editor "Lepasoft Dialog Editor") editor so that narrative designers can compose action sequences with typed parameters. At runtime, the signature `id` is what the developer maps to their own systems. Defined by the [`ActionSignature`](/api-ref/interfaces/ActionSignature) interface:

<!--@include: ../_shared/blueprint-signature-type.md-->
