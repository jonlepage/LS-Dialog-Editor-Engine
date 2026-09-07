# Async Tracks

Quand un block a `props.isAsync = true`, le engine crée un **track parallèle** qui s'exécute indépendamment du flow principal.

## Comment les tracks sont créés

Pendant la résolution des ports, si plusieurs connections sortantes existent :
- La **première connection non-async** devient la continuation du flow courant
- Les **autres connections** (vers des blocks avec `isAsync`) deviennent des tracks parallèles

Ceci s'applique au main track **et** aux async tracks — un async track peut créer des sub-tracks depuis ses propres connections async, formant une hiérarchie d'exécution parallèle.

## Cycle de vie des tracks

- `onBeforeBlock` est appelé pour **tous les blocks** (main et async tracks) — voir [Lifecycle](./lifecycle) pour le détail de `resolve()`
- Les async tracks séparent les connections sortantes en main vs async, comme le main track
- Les tracks sont automatiquement annulés quand la scène se termine ou que `cancel()` est appelé
- Quand un track se termine naturellement (plus de connections), ses sub-tracks **continuent de vivre** indépendamment
- Quand un track est explicitement annulé (`cancel()`), l'annulation **cascade** vers tous les tracks enfants

## waitForBlocks — attendre une autre piste

`props.waitForBlocks` retient un bloc tant que les blocs qu'il nomme n'ont pas été visités. C'est la moitié « jonction » de l'embranchement qu'ouvre `isAsync` : une branche part en parallèle, et un bloc en aval attend qu'elle soit arrivée quelque part avant de jouer.

**Le bloc est retenu AVANT d'être dispatché.** Aucun handler n'est appelé, donc votre jeu n'apprend jamais que le bloc existe tant que l'attente n'est pas levée — rien de lui ne peut arriver à l'écran trop tôt. C'est une décision du moteur, pas un choix d'affichage que vous pourriez faire autrement : `waitForBlocks` est une propriété **native**, le designer la coche dans LSDE, et le moteur la lui doit.

La règle est la même sur **toutes** les pistes, celle que le joueur regarde comprise.

- Les ids nomment des blocs **de cette scène**. Un fil n'a jamais franchi de frontière de scène.
- Il faut que **tous** aient été visités, pas seulement un.
- Visiter un bloc libère tout ce qui l'attendait, en chaîne.
- Un bloc jamais visité gare sa piste pour de bon. `init()` signale `UNKNOWN_WAIT_BLOCK` quand un id n'est pas un bloc de la scène.

La séquence pour un bloc portant à la fois `waitForBlocks` et `delay` :

```
waitForBlocks gate → onBeforeBlock (delay) → handler → next()
```

## waitInput — Flag d'input joueur

`props.waitInput` est un **flag passif** — le engine l'expose mais ne l'interprète pas. Votre handler de jeu le lit pour décider s'il faut attendre un input explicite du joueur.

## API TrackInfo — Observabilité

Utilisez `scene.getTrackInfos()` pour inspecter les async tracks en cours. Retourne un snapshot readonly de l'état de chaque track :

::: code-group
```ts [TypeScript]
const tracks = scene.getTrackInfos();
for (const track of tracks) {
  console.log(`Track ${track.id} (parent: ${track.parentTrackId}) at block ${track.currentBlockUuid}`);
}
```
```csharp [C#]
var tracks = scene.GetTrackInfos();
foreach (var track in tracks)
{
    Console.WriteLine($"Track {track.Id} (parent: {track.ParentTrackId}) at block {track.CurrentBlockUuid}");
}
```
```cpp [C++]
auto tracks = scene->getTrackInfos();
for (const auto& track : tracks) {
    std::cout << "Track " << track.id
              << " (parent: " << track.parentTrackId << ")"
              << " at block " << track.currentBlockUuid << "\n";
}
```
```gdscript [GDScript]
var tracks = scene.get_track_infos()
for track in tracks:
    print("Track %d (parent: %s) at block %s" % [
        track["id"], str(track["parentTrackId"]), track["currentBlockUuid"]])
```
:::

Chaque `TrackInfo` contient : `id`, `parentTrackId`, `startBlockUuid`, `currentBlockUuid`, `running`.

## Ce qui fonctionne dans les async tracks (et ce qui ne fonctionne pas)

Les async tracks sont conçus pour du contenu qui se déroule *en parallèle* de la conversation principale — effets ambient, animations parallèles, réactions de compagnons. Mais il y a des limites.

**Contenu parallèle — cas d'usage valides :**
| Cas d'utilisation | Pourquoi ça fonctionne |
|---|---|
| Dialogue ambient de NPC ("barks") | Blocks dialog sur un async track — les NPCs commentent ou réagissent pendant que la conversation principale continue |
| Réactions de personnages synchronisées | Utilisez `waitForBlocks` pour déclencher une réaction quand un block spécifique est atteint |
| Jouer des sons ambient ou de la musique | Block action, pas d'interaction joueur nécessaire |
| Mouvements de caméra parallèles | Block action, s'exécute en parallèle |
| Effets avec timing précis | Combinez `waitForBlocks` + `delay` pour un timing précis |

**Interaction joueur ou branching — à éviter :**
| Cas d'utilisation | Pourquoi c'est problématique |
|---|---|
| Block CHOICE dans un async track | Le joueur est déjà en interaction avec le main track — qui répond au choice async? |
| Changements critiques de game state | Si le async track est annulé (la scène se termine), l'action ne s'exécute jamais |

::: warning Choices dans les async tracks
Un block CHOICE dans un async track implique que le joueur devrait faire une sélection pendant qu'il est déjà engagé avec le dialogue principal. Le scénario le plus courant est un "choix" piloté par l'IA (ex. un compagnon NPC auto-sélectionne basé sur sa personnalité). Si un async track atteint un block CHOICE sans scene-level handler qui auto-sélectionne, le flow va se bloquer silencieusement.
:::

## Plusieurs scènes en parallèle

Le engine supporte l'exécution de plusieurs scènes en même temps. Chaque `SceneHandle` a son propre state, ses blocks visités et ses async tracks. Les handlers globaux (Tier 1) sont partagés — utilisez l'argument `scene` pour identifier quelle scène appelle :

<!--@include: ../../_shared/async-dialog-track.md-->

::: tip Routing par scène
Avec plusieurs scènes concurrentes, il est préférable d'enregistrer des handlers scene-level (Tier 2) sur chaque handle au lieu de router dans le handler global. Meilleure séparation, pas de chaînes `if/else`.
:::

## Référence visuelle

```mermaid
flowchart LR
    A["[A]"] --> B["[B]"]
    B --> C["[C]"]
    A -- async --> D["[D]"]
    D --> E["[E]"]
    D -- async --> F["[F]"]

    style A fill:#4a9,stroke:#333
    style B fill:#4a9,stroke:#333
    style C fill:#4a9,stroke:#333
    style D fill:#69b,stroke:#333
    style E fill:#69b,stroke:#333
    style F fill:#c7a,stroke:#333
```

- Main track: A → B → C
- Track 1 (parallèle): D → E
- Track 2 (sub-track de D): F
- Scene cancel → tous les tracks annulés
- Track D se termine naturellement → F continue
