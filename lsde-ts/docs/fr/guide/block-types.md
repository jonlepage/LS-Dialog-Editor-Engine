# Types de blocks

Les blocks sont les briques d'une scène de dialogue — chaque nœud dans le graphe de l'éditeur est un block. Le engine route le flow de block en block et appelle le handler correspondant à chaque type.

Il existe 5 types : **Dialog**, **Choice**, **Condition**, **Action** et **Note**. Les quatre premiers sont des blocks de contenu avec un handler dédié (`onDialog`, `onChoice`, `onCondition`, `onAction`) — les quatre sont **required** et validés à l'appel de `start()`. Les blocks Note sont automatiquement ignorés.

Les handlers se déclinent en deux niveaux : les **global handlers** (enregistrés sur le engine) couvrent toutes les scènes et suffisent pour la plupart des jeux. Les **scene handlers** (enregistrés sur un [`SceneHandle`](/api-ref/interfaces/SceneHandle)) peuvent compléter ou remplacer les globaux pour une scène spécifique. Voir [Handlers](/fr/guide/handlers) pour le détail.

## DIALOG

Un block dialog représente une réplique — un personnage qui parle, un narrateur, un texte à l'écran. Le engine résout le personnage via le callback `onResolveCharacter` et l'expose dans `context.character`. Un handler dialog typique crée une instance de texte dans le jeu (textbox, bulle, sous-titre…), attend que le joueur ou une animation termine, puis appelle `next()` pour avancer le engine. La fonction de cleanup optionnelle permet de nettoyer les effets de bord quand le engine passe au bloc suivant.

<!--@include: ../../_shared/block-dialog.md-->

Quand le narrative designer assigne un output dédié par personnage ([`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)), le handler doit appeler `resolveCharacterPort()` pour indiquer au engine quel chemin suivre lors du `next()`.

## CHOICE

Un block choice représente un embranchement où le joueur choisit — un menu de réponses, des options de dialogue. Le `context.options` contient toutes les options disponibles. Quand [`onResolveCondition()`](/fr/guide/choice-visibility) est configuré, chaque option est taggée `visible: true | false` — le handler filtre et affiche celles qu'il veut. Après l'interaction du joueur, `selectChoice(optionId)` indique au engine quel chemin suivre — **l'id de l'option EST le port** par lequel le flow sort (`C1`, `C2`…) — puis `next()` avance le flow.

<!--@include: ../../_shared/block-choice.md-->

Voir [Choice Visibility](/fr/guide/choice-visibility) pour le système complet de tagging opt-in.

## CONDITION

Un block condition est un aiguillage invisible — il consulte l'état du jeu et envoie le flow sur un chemin sans que le joueur le voie.

**Le engine ne compare rien lui-même.** Il ne lit aucun dictionnaire, ne sait pas ce que contient `credits`, n'implémente pas `greaterOrEqual`. Il passe chaque test à [`onResolveCondition()`](/fr/guide/choice-visibility) et assemble les réponses. Chaque test n'est demandé **qu'une seule fois**, quel que soit le mode.

Quand un resolver est installé, le engine connaît déjà le port de sortie avant d'appeler le handler : `onCondition` devient facultatif, et sert alors à journaliser ou à forcer une sortie. Le handler reçoit `context.cases`, chaque cas portant son `port` et son `result` déjà évalué. Pour forcer une sortie, `context.resolve(port)` prend un **nom de port** — `"out"`, `"default"` ou un port de cas (`"K1"`).

Il y a **deux modes, et deux seulement** :

- **`portPerCase` absent** — tous les cas doivent tenir. S'ils tiennent, le flow sort par `out` ; sinon par `default`.
- **`portPerCase: true`** — le **premier** cas qui tient sort par **son propre port** (`K1`, `K2`…). Si aucun ne tient, `default`.

Un cas sans `when` est toujours vrai, et rend inatteignables les cas en dessous de lui en mode `portPerCase`. C'est le dessin du writer, pas une erreur à signaler. Un block sans aucun cas sort par `out` : rien n'a été demandé, donc rien n'a échoué.

`default` veut dire « aucun cas n'a tenu » — **pas** « la sortie choisie n'a pas de fil ». Un port sans fil termine le flow, ce qui est une fin légitime.

Un test dont le dictionnaire est le mot réservé **`choice`** interroge une réponse déjà donnée par le joueur : `{ dict: "choice", entry: "CHOICE-001", value: "C1" }`. Le engine y répond **lui-même**, depuis l'historique de la scène — la question n'atteint jamais le jeu. Voir aussi `scene.getChoice(blockId)` et `scene.evaluateCondition(test)`.

<!--@include: ../../_shared/block-condition.md-->

## ACTION

Un block action déclenche des effets de bord dans le jeu — donner un item, jouer un son, activer un flag. `context.calls` porte les appels : chacun cite l'`fn` d'une [function](/fr/guide/blueprints#functions) déclarée, et ses `args` arrivent **par nom**, jamais par position. Le handler les exécute puis appelle `context.resolve()` pour suivre le port `then`, ou `context.reject()` pour suivre le port `catch` — et si le designer n'a câblé aucun `catch`, le flow repart par `then` plutôt que de laisser le joueur en plan.

<!--@include: ../../_shared/block-action.md-->

## NOTE

Un block note est un pense-bête pour le narrative designer — commentaires, rappels, contexte. Il est automatiquement ignoré pendant la traversée. Il est techniquement possible d'intercepter un block note via [`onBeforeBlock`](/fr/guide/lifecycle), mais c'est déconseillé — le block action devrait couvrir tous vos besoins en effets de bord.

## Propriétés communes

Tous les blocks partagent ces champs de base ([`BlueprintBlockBase`](/api-ref/type-aliases/BlueprintBlock)) :

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string` | Identité **relative à sa scène** — `DIALOG-002`. Les ids se répètent d'une scène à l'autre. |
| `key` | `string` | La clé i18n complète, telle que les fichiers de localisation la portent |
| `type` | `BlockType` | `dialog`, `choice`, `condition`, `action` ou `note` |
| `label` | `string?` | Nom lisible, quand le writer en a mis un |
| `parentLabels` | `string[]?` | Hiérarchie des dossiers parents dans l'éditeur |
| `note` | `string?` | Le pense-bête du writer |
| `actors` | `string[]?` | Les **ids de cards** que le block cite, dans l'ordre du fichier |
| `emotion` | `string?` | L'id de card de l'émotion — elle appartient au **block**, pas à chaque acteur |
| `intensity` | `number?` | L'intensité de cette émotion |
| `text` | `TextByLocale?` | Le texte par locale, si l'export est en mode inline |
| `props` | `PropertyBag?` | **Un seul sac** : les natives et les propriétés du writer, par id nu |
| `options` | `Option[]?` | CHOICE uniquement |
| `cases` | `ConditionCase[]?` | CONDITION uniquement |
| `calls` | `ActionCall[]?` | ACTION uniquement |
| `next` | `Link[]?` | **Les fils sortants du block.** Il n'y a pas de table de connexions en v2 |

Le block d'entrée n'est pas marqué sur le block : c'est la **scène** qui le nomme, dans `scene.start`. Une scène ne peut donc pas en déclarer deux.

### NativeProperties

Les neuf propriétés que le **engine** lit, prises dans `props`. Les ids ne peuvent pas entrer en collision — LSDE refuse une propriété de projet portant un nom natif — donc les distinguer est une simple recherche.

| Champ | Type | Description |
|-------|------|-------------|
| `isAsync` | `boolean?` | **Ouvre une piste parallèle** sur ce block au lieu de continuer la piste courante |
| `waitForBlocks` | `string[]?` | Ids de blocks **de cette scène**. Le block est **retenu avant d'être dispatché** tant qu'ils ne sont pas tous **terminés** — aucun handler n'est appelé |
| `delay` | `number?` | **MILLISECONDES** avant que le block joue. Appliqué par `onBeforeBlock`, jamais par le engine |
| `timeout` | `number?` | **MILLISECONDES** pendant lesquelles le block RESTE après que sa réplique a été dite, puis il repart de lui-même — une auto-avance pour les blocks. **Prime sur `waitInput`**. Passé tel quel ; le engine n'impose rien |
| `waitInput` | `boolean?` | Attendre une entrée joueur. Passé tel quel, jamais interprété — **`timeout` prime sur lui** |
| `debug` | `boolean?` | Flag de debug pour l'éditeur. Passé tel quel |
| `portPerCharacter` | `boolean?` | Le block sort par un port **nommé par l'id de card** de l'acteur, au lieu de `out` |
| `skipIfMissingActor` | `boolean?` | Passé tel quel — c'est le jeu qui décide |
| `portPerCase` | `boolean?` | CONDITION : chaque cas sort par **son propre port** (`K1`…) au lieu de partager `out` |

::: warning `delay` et `timeout` sont en MILLISECONDES en v2
Ils étaient en secondes en v1, et **rien ne le signale à l'exécution** : un projet migré transforme une pause de 3 secondes en 3 ms.
:::

::: tip `timeout` est une auto-avance pour les blocks — on compte depuis la FIN de la réplique
Le compte à rebours part quand la réplique a été **dite**, pas quand le block est arrivé. Ce que l'auteur règle, c'est le temps qu'elle RESTE à l'écran une fois son dernier caractère tapé (ou sa dernière syllabe prononcée) ; ensuite le block repart de lui-même.

Compter depuis l'arrivée est l'erreur qui se lit bien et qui joue mal : 2500 ms sur une réplique de 120 caractères la tronquent au milieu.

Il **prime sur `waitInput`**, et il prime sur le départ immédiat. Les trois disent QUAND on quitte le block, et celui que l'auteur a écrit sur la carte est la réponse la plus précise. Un clic ne peut donc qu'**accélérer la révélation**, jamais congédier le block — presser une réplique qui joue son temps n'a pas de sens, l'accélérer en a un, et c'est cette accélération qui arme le compte à rebours.

Et comme quitter un block est ce qui le marque **terminé**, un `timeout` est aussi ce qui libère un [`waitForBlocks`](/fr/guide/async-tracks) qui le nomme.
:::

Seules **deux** de ces propriétés changent quelque chose au parcours : `isAsync` et `waitForBlocks`. Les sept autres sont transmises intactes au jeu, qui décide de ce qu'il en fait.
