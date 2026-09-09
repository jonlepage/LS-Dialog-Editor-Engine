# Migration du moteur vers LSDE v2

Les 2 exports de référence sont dans
D:\Users\jonle\Documents\DEV\projets\LEPASOFT\LS-Dialog-Editor-Engine\mock\blueprints
D:\Users\jonle\Documents\DEV\projets\LEPASOFT\LS-Dialog-Editor-Engine\mock\multi

> **Ce fichier est la mémoire du chantier.** Il existe parce qu'une session d'agent se compacte et
> perd le détail des discussions.
>
> **Un numéro = un problème à régler.** Rien d'autre ne prend de numéro. Le contexte, les relevés et
> l'historique vivent dans les sections sans numéro, en fin de fichier.
>
> **On ajoute, on ne réécrit pas.** Une décision qui change ne remplace pas l'ancienne : elle la barre
> et dit pourquoi. Sans la raison, une décision se re-discute trois semaines plus tard et on refait le
> même chemin.

---

# Les problèmes

## 1. Le moteur refuse d'ouvrir un fichier v2

**LIVRÉ le 2026-09-07** — `lsde-ts` seulement. Voir *Ce qui a été livré* plus bas.

**Tranché — à faire en premier.**

Deux causes, et la seconde est pire que la première.

**Les identifiants de bloc se répètent entre scènes.** Le compteur repart à 1 dans chaque scène, donc
`DIALOG-001` existe légitimement dans deux scènes à la fois. Le moteur range les blocs dans une liste
unique — héritée de la v1 où les UUID étaient globaux — et refuse le fichier avec
`DUPLICATE_BLOCK_UUID_GLOBAL`.

**Le moteur ne lit ni `format` ni `version`.** Il ouvre le fichier et fonce. Un fichier qu'il ne sait
pas lire ne provoque donc pas d'erreur : il produit une scène qui s'arrête en silence au milieu.

### Ce qu'on fait

1. Lire `format` et `version` **avant tout le reste**, refuser net ce qui n'est pas `lsde-blueprints`
   v1, avec un message qui nomme la version attendue
2. Indexer les blocs par **(scène, id)** au lieu d'un identifiant global
3. Remplacer `DUPLICATE_BLOCK_UUID_GLOBAL` par « unique dans sa scène »
4. Retirer les diagnostics devenus inexprimables : `MULTIPLE_START_BLOCKS` (le `start` est au niveau
   scène), `MISSING_SCENE_LABEL` (le label est optionnel)

**Critère de fin :** `init()` avale `mock/blueprints/*.json` sans erreur.
**Fichiers :** `lsde-ts/src/types.ts` · `graph.ts` · `validator.ts`

### Relevé

Quatre ids partagés dans l'export de référence : `ACTION-001`, `DIALOG-001`, `DIALOG-002`,
`CHOICE-001`.

### Ce qui a été livré (2026-09-07)

Critère de fin atteint et prouvé : `lsde-ts/src/blueprint-loading.test.ts`, **43 tests au vert**,
sur les trois fichiers que LSDE a réellement écrits — aucune charge fabriquée à la main.

Les quatre points du plan, plus trois que le code a imposés :

1. `format` et `version` lus **avant tout le reste**, refus net et nommé. Le refus s'arrête là :
   une seule cause, pas vingt conséquences.
2. Blocs indexés par (scène, id). Il n'y a plus **aucun** index global de blocs dans `graph.ts`.
3. `DUPLICATE_BLOCK_UUID_GLOBAL` retiré, `DUPLICATE_BLOCK_ID` le remplace (dans la scène).
4. `MULTIPLE_START_BLOCKS` et `MISSING_SCENE_LABEL` retirés — inexprimables en v2.
5. **Les fils viennent des blocs.** Plus de table `connections` : `getOutgoingLinks()` est une
   lecture de champ. `getSceneConnections()` aplatit les `next` en y remettant le bloc de départ
   (problème 15, fait ici parce que `graph.ts` ne compilait pas autrement).
6. **`getSceneGraph()` accepte le chemin ou le `sceneId`** — le problème 7, quatre lignes, au même
   endroit. Ne pas le faire aurait voulu dire choisir une clé arbitraire et y revenir.
7. **Diagnostics : `id` d'abord, puis la `note`** (problème 17). `label` passe devant si un export
   en porte un.

Nouveaux codes : `INVALID_FORMAT`, `UNSUPPORTED_FORMAT_VERSION`, `DUPLICATE_SCENE`,
`DUPLICATE_BLOCK_ID`, `MISSING_SCENE_PATH`, `INVALID_START_BLOCK`, `NO_START_BLOCK` (warning —
une scène sans entrée se charge, elle ne joue pas), `BROKEN_LINK`, `UNKNOWN_FUNCTION`,
`UNKNOWN_DICTIONARY`, `UNKNOWN_DICTIONARY_ENTRY`, `UNKNOWN_CARD`.

`CheckOptions` suit : `signatures` → `functions`, `characters` → `cards` (sur le **nom** de la
fiche, jamais sur `var1`).

**`validator.test.ts` et `graph.test.ts` sont supprimés.** Ils décrivaient le format v1 sur des
charges écrites à la main. Leur couverture est reprise dans `blueprint-loading.test.ts`, contre
les vrais fichiers — sauf trois cas qui n'existent plus : deux `isStartBlock`, le repli
`entryBlockId`, et un `fromId` cassé (un fil part forcément d'un bloc qui existe, puisque c'est
lui qui le porte).

---

## 2. Le routage des sorties ne fonctionne plus

**Tranché.**

`fromPortIndex` n'existe plus dans le format. Or c'est lui que le port-resolver interroge pour le
dialogue à sortie par personnage, pour la branche vraie d'un aiguillage, et pour le mode switch.

Et les noms de ports ont changé : une condition en mode `if` sort par `out` (vrai) et `default`
(faux), plus par `true` / `false`.

**C'est ce qui cause la panne muette.** Un moteur v1 sur une charge v2 ne trouve *aucune* connexion
sur ces blocs : la scène s'arrête sans erreur, là où le joueur attendait une branche.

### Les ports de la v2

| Type de bloc | Sorties |
|---|---|
| Dialogue | `out` · avec `portPerCharacter` : un port par **id de fiche**, `out` en repli |
| Choix | l'id de l'option (`C1`, `C2`…) — **aucun `out`** |
| Condition, mode `if` | `out` = vrai · `default` = faux |
| Condition, mode switch | `K1`, `K2`… · `default` |
| Action | `then` · `catch` |

### Ce qu'on fait

Réécrire tout le routage sur des **noms de ports**. Tests exhaustifs avant de porter quoi que ce soit
dans les trois autres runtimes.

**Fichiers :** `port-resolver.ts`

---

## 3. Le bloc condition a changé de modèle

**Tranché.**

Trois changements en même temps :

1. Le tableau 2D (`ExportCondition[][]`) devient une **liste de cas**, chacun portant son port. Le
   moteur n'a plus à déduire un index : le cas dit par où il sort.
2. La comparaison change de forme. `key: "inventory.carrot"` se scinde en `dict` + `entry` ;
   l'opérateur `">="` devient `"greaterOrEqual"` ; la valeur prend le type du dictionnaire ; le
   chaînage `"&"` / `"|"` devient `join: "and"` / `"or"`.
3. « Toujours vrai » s'écrit par **l'absence** de `when`, jamais par une liste vide.

### Les deux modes, et deux seulement

| Mode | Règle | Sortie |
|---|---|---|
| **`portPerCase` absent** | toutes les cases doivent être vraies | `out` si oui, `default` sinon |
| **`portPerCase: true`** | la première case vraie, dans l'ordre | son port (`K1`…), `default` si aucune |

À l'intérieur d'une case, les tests se chaînent de gauche à droite **sans priorité** — c'est le moteur
du jeu qui décide s'il fait passer le ET avant le OU.

Le contrat de LSDE2 porte déjà tout ceci :

- `Out` — *« the true exit of an if-style condition »*
- `Default` — *« the fallback exit of a condition block: no case matched »*
- `ConditionCase.port` — *« the exit port of this case (K1…), or the block's out when cases share one exit »*
- `ConditionCase.when` — *« absent = always true. Such a case makes every following case unreachable »*

### Ce qu'on fait

Réécrire l'évaluateur sur ce modèle.

**Fichiers :** `condition-evaluator.ts`

---

## 4. Le dispatcher n'a plus de sens

**Tranché — on le retire.**

La v1 avait un troisième mode : `enableDispatcher` faisait partir **tous** les cas vrais en même
temps, en parallèle, `default` devenant le fil principal. Plus rien ne l'active en v2.

### Pourquoi c'est un bon débarras

Un aiguillage choisit UN chemin, un dispatcher les prend TOUS — deux concepts opposés dans le même
bloc, distingués par une case à cocher. Un designer voyait trois fils sortir d'un bloc condition et
croyait lire un choix ; c'était trois lancements simultanés, et rien dans le dessin ne le disait.

Trois autres signes que le découpage était mauvais :

- le moteur devait accepter `resolve(bool | number | number[])` — trois formes pour une méthode ;
- les cibles **devaient** être des blocs async, sans que le format puisse l'exprimer ;
- c'était le seul endroit du graphe capable de créer du parallélisme, alors que `isAsync` existe déjà
  pour ça sur n'importe quel bloc.

Le besoin réel se couvre déjà : un bloc d'action enchaîne plusieurs appels, et pour du conditionnel
trois blocs en série se lisent d'un coup d'œil.

### Ce qu'on fait

Retirer `resolve(number[])` et la moitié dispatcher de `evaluateConditionGroups` en 1.0.0.

Si le besoin revient un jour, ce sera **un nouveau type de bloc**, pas une case à cocher sur
l'aiguillage.

---

## 5. La distribution passe par une table de références

**Tranché.**

`metadata.characters` (des objets complets) devient `actors: ["var1"]` — des identifiants à résoudre
par la table `cards` de l'en-tête. L'émotion suit le même chemin, et elle est portée par le **bloc**,
plus par chaque personnage.

### Deux pièges

**Les fiches sortent avec les quatre rôles** — `characters`, `emotions`, `places`, `none`. Le moteur
doit filtrer par rôle, pas supposer que tout ce qui est dans `cards` est un personnage.

**L'ordre des acteurs est signifiant, mais son sens ne nous appartient pas.** LSDE refuse
délibérément de dire si c'est « qui parle » ou « qui est présent » — c'est le jeu qui tranche. Le
moteur garde la même neutralité : il expose la liste, il n'élit pas un premier comme il le fait
aujourd'hui.

**Fichiers :** `block-context.ts` · `scene-handle.ts`

---

## 6. Les propriétés de bloc sont dans un seul sac

**Tranché.**

`properties[]` + `userProperties` + `nativeProperties` deviennent un seul `props`, avec les
identifiants nus, natives et propriétés du designer mélangées.

Le moteur doit tenir la liste des huit natives pour les distinguer : `isAsync`, `delay`, `timeout`,
`waitInput`, `debug`, `portPerCharacter`, `skipIfMissingActor`, `portPerCase`.

### Le piège des unités

`delay` et `timeout` étaient en **secondes** en v1, ils sont en **millisecondes** en v2. Confirmé
dans l'export : `delay: 1000`, `timeout: 5000`.

Rien ne le signalera à l'exécution. Un projet migré verra ses pauses de 3 secondes devenir 3
millisecondes. À écrire noir sur blanc dans le guide de migration.

---

## 7. Un identifiant de scène ne survivait pas au renommage

**Tranché — corrigé côté LSDE2, livré.**

En v1 : `uuid` stable + `label` libre. En v2, le chemin (`reactor_breach`) était l'identité.

### Pourquoi c'était grave

Le premier raisonnement concluait « pas grave » : renommer une scène change le nom de la constante
générée, donc le code ne compile plus — échec visible, acceptable.

**Ce raisonnement était faux, et c'est Jonathan qui l'a corrigé.** Ce n'est pas là que vit une
référence de scène. Dans Unity, le dev expose un champ, l'inspecteur propose une liste, et la valeur
choisie est **sérialisée dans un `.asset`**. Aucun compilateur ne la regarde.

| Où vit la référence | v1 (uuid) | v2 (chemin) |
|---|---|---|
| dans le code | erreur de compilation | erreur de compilation |
| **sérialisée dans un asset** | **survit** | **casse en silence** |

### Ce que LSDE2 a livré

Un champ `id` sur la scène : `sc_u0vqg2g8` — huit caractères, unicité vérifiée à la création,
copiable par clic droit dans l'application.

Sur les blocs, rien : puisque l'id de bloc ne se renomme ni ne se recycle jamais, le couple
*(sceneId, DIALOG-002)* est déjà entièrement stable.

### Ce que le moteur doit faire

`engine.scene()` accepte le chemin **ou** l'identifiant stable. Le champ reste optionnel — un fichier
qui ne le porte pas se charge par le chemin.

### Ce qui casse quand même

Les fichiers de voix sont nommés d'après le chemin de clé. Renommer une scène renomme ses prises, et
le client doit réexporter son audio. Aucun identifiant n'y change rien — mais l'échec est visible
tout de suite : un fichier absent, pas un appel silencieux.

---

## 8. Les types de la charge sont écrits deux fois

**Tranché.**

LSDE2 génère déjà les types pour les quatre langages du moteur, depuis une description unique
(`EXPORT_CONTRACT`) tenue d'accord avec le JSON Schema par un test.

Le moteur en maintient sa propre copie à la main dans quatre langages — exactement la double écriture
que LSDE2 refuse partout chez lui, et la cause de la classe de bogues « le C# et le GDScript ont
divergé sur un champ ».

### Ce qu'on fait

On branche les fichiers générés.

Vérifié sur le fichier réel : `Engine-Conformance-Scene.blueprints.types.ts` est du TypeScript propre
et complet — six énumérations en double forme, onze interfaces, `TextByLocale`, `PropertyValue`,
`PropertyBag`, alias racine. **Consommable tel quel.**

C'est le seul changement du chantier qui rende la *prochaine* migration bon marché.

### LIVRÉ le 2026-09-07 — `lsde-ts` seulement

`lsde-ts/src/blueprint-types.ts` est la **copie verbatim** du fichier généré. Deux retouches, et
seulement deux : l'en-tête dit d'où il vient et comment le rafraîchir, et l'alias de fin nommé
d'après le projet (`EngineConformanceSceneBlueprints`) est retiré. Le corps n'est pas touché.

Il fallait le faire **avec** le problème 1 et non après : on ne valide pas un format sans ses
types. `types.ts` passe de 1060 à 630 lignes — toute la moitié « charge utile » a disparu, elle
est maintenant générée.

`types.ts` garde par-dessus ce que le générateur ne peut pas connaître : les noms de l'API du
moteur (`BlueprintExport` = `Blueprints`, `BlueprintScene` = `Scene`, `BlueprintBlock` = `Block`),
les raffinements par type de bloc dont les handlers sont génériques, `BlueprintConnection` (un
`Link` + son bloc de départ, une forme qui n'existe qu'en mémoire), et `NativeProperties` +
`NATIVE_PROPERTY_IDS` — la liste des neuf natives, seul moyen de trier le sac `props`.

**Ce qui reste au 8 :** le C#, le C++ et le GDScript ont chacun leur fichier généré dans
`mock/blueprints/`, à brancher au moment du portage.

---

## 9. Le nom des champs dépend d'un réglage du client

**Tranché — le moteur n'accepte que `camelCase`.**

Le client choisit `camelCase` (défaut), `snake_case` ou `PascalCase` à l'export, et ça **renomme les
champs du JSON** — jamais les identifiants ni les sacs de données (`text`, `props`, `args`).

Un moteur qui attend `toPort` face à un fichier qui écrit `to_port` ne lit rien.

### Ce qu'on fait

Le moteur exige `camelCase` — le défaut de LSDE2, et la convention naturelle du JSON. Il le vérifie
au chargement et refuse avec un message qui nomme le réglage à changer :

> ce fichier est exporté en `snake_case`, le moteur attend `camelCase` —
> Paramètres du projet › Exporters › Convention de nommage

C'est écrit dans le guide d'intégration, pas découvert à l'exécution.

### Pourquoi pas les trois

Le code serait facile — un parcours récursif qui renomme les clés. **Le risque ne l'est pas.**

Trois champs portent des clés qui sont des **données du client**, pas de la structure :

```
text  → { "fr": "…", "en": "…" }    les codes de langue
props → { "player_hp": 3 }           les ids de propriétés du designer
args  → { "fadeMs": 500 }            les noms de paramètres
```

Renommer là-dedans transforme `player_hp` en `playerHp` et casse le jeu du client en silence. La
liste des champs à ne pas toucher vit dans LSDE2 (`OPAQUE_FIELDS`) : le jour où un quatrième sac
apparaît, le moteur corrompt des données sans un mot. C'est exactement la double écriture qu'on
supprime au problème 8.

Et le besoin n'existe pas : une convention sert le confort du développeur **dans son code**, pas dans
le format d'échange. Son désérialiseur fait déjà la conversion — `System.Text.Json` a
`JsonNamingPolicy`, Newtonsoft aussi, et le runtime C# du moteur mappe déjà `camelCase` JSON vers des
propriétés `PascalCase`.

### À savoir

**C'était déjà cassé en v1** — le moteur n'a jamais géré que le camelCase, et le réglage existait
déjà. Bug préexistant, pas une régression.

---

## 10. Un export peut être découpé en plusieurs fichiers

**Tranché — on le supporte tout de suite.**

Le mode `perScene` écrit un fichier par scène. Le moteur n'a qu'un `init(data)` unique.

### L'export perScene a été vérifié, rien à retravailler côté LSDE2

`mock/multi/blueprints/` — trois propriétés le rendent simple à charger :

- **chaque fichier est autonome** : les 4 dictionnaires, 8 fonctions et 14 fiches sont dans les deux.
  Une scène se charge et se joue seule ;
- **les fichiers d'un même export se reconnaissent** : `project`, `exportedAt` et les trois tables
  sont *strictement identiques* d'un fichier à l'autre. Le moteur peut donc détecter qu'on lui donne
  deux morceaux d'exports différents, au lieu de fusionner n'importe quoi ;
- **le nom du fichier porte la scène** : `<Projet>.blueprints.<scene>.json`.

Un seul `ids.ts`, un seul `types.ts`, un seul schéma pour tout l'export — le bon choix : ils décrivent
le contrat, pas une scène.

### Ce qu'on fait

`init()` accepte un fichier **ou une liste**. Si liste : vérifier que `project` et `exportedAt`
concordent, prendre l'en-tête du premier, empiler les scènes.

**Déjà cassé en v1 aussi** — le mode existait et le moteur ne l'a jamais géré.

---

## 11. Une exception dans un handler disparaît, dans un cleanup non

**Tranché — aucune erreur silencieuse : tout remonte au développeur.**

Une exception levée par un **handler** est avalée en silence — c'est documenté dans
`docs/guide/lifecycle.md` : *« The error is silent — it is not logged or re-thrown. »*

Mais une exception levée par la **fonction de nettoyage** que ce même handler retourne **remonte**
jusqu'à l'appelant.

Même faute, même code du client, deux comportements opposés.

L'asymétrie est épinglée par deux tests dans `robustness.test.ts`.

### Et les quatre runtimes divergent déjà

**GDScript n'a pas de `try/catch`** — le langage n'en a pas. Les erreurs y remontent donc
naturellement, et il fait déjà ce qu'on veut. TypeScript, C# et C++ ont un `catch` explicite qui
avale. Personne ne l'avait vu.

### Ce qu'on fait

Le `catch` existe déjà partout : il relance au lieu d'avaler.

```ts
} catch (err) { this.endScene(); throw err; }      // TypeScript
```
```csharp
catch { EndScene(); throw; }                        // C# — throw; nu, pour garder la pile d'origine
```
```cpp
} catch (...) { endScene(); throw; }                // C++
```

GDScript : rien à faire.

**L'ordre compte, et c'est lui qui donne le comportement voulu.** On ferme la scène d'abord, on
relance ensuite. Quand l'erreur arrive chez le développeur : les nettoyages ont tourné, les pistes
parallèles sont annulées, `onSceneExit` a été tiré. Le dialogue s'est arrêté **proprement**, et le jeu
reçoit l'erreur là où il a appelé `start()` ou `next()`.

Il met son propre `try/catch` autour et décide : continuer sans le dialogue, afficher un écran, ou
laisser planter. C'est sa décision, pas celle du moteur.

### Ce que ça touche

Un test de `engine-critical.test.ts` encode l'avalement comme voulu, et `docs/guide/lifecycle.md` le
documente. Les deux changent avec.

---

## 12. Les données de test et les blueprints datent de la v1

**Tranché — à faire avant le portage des trois autres runtimes.**

`tests/test-cases.json`, `test-init-validation.json`, `test-port-routing.json` et tout le dossier
`blueprints/` décrivent le format v1.

Ils doivent être refaits **depuis de vrais exports LSDE v2**, pas à la main. Sans ça, les quatre
runtimes se porteront sur quatre lectures différentes du format.

---

## 13. La documentation du moteur décrit un moteur qui n'existe plus

**Tranché — à reprendre pendant la migration.**

Le `CLAUDE.md` de ce dépôt a divergé du code, indépendamment de la v2 :

- il annonce `PLAN.md` comme source de vérité unique — le fichier n'existe pas ;
- il documente un `setStateBridge()` à trois méthodes, remplacé depuis par `onResolveCondition()` et
  `onResolveCharacter()` ;
- sa table de résolution des ports donne `out` pour le bloc d'action, là où le code utilise `then`.

Réécrire la spec sur un contrat qui vient de bouger coûte à peine plus cher que la corriger.

S'y ajoutent les guides VitePress en quatre langues.

---

## 14. Les runtimes n'ont aucune intégration continue

**Tranché — on le monte APRÈS la migration.**

Seul `docs.yml` existe dans `.github/workflows/`. Les tests C#, C++ et GDScript ne tournent jamais
automatiquement. C'est ce qui a laissé les compteurs du README faux sur les quatre runtimes.

### Ce que ça a déjà coûté

Le README annonçait `40/42` pour le C++ — comme si deux tests échouaient depuis des mois. En réalité
89 passent, aucun échec. Personne n'avait relancé la suite. Idem pour les trois autres : 216 annoncés
en TS, 306 en réalité.

### Pourquoi après et pas maintenant

Le monter maintenant, c'est le faire tourner sur du code qu'on est en train de démolir. Le monter à
la fin, c'est le point de départ propre de la 1.0.

### Ce qu'il faudra

Un fichier YAML, ~60 lignes, quatre tâches : Node (TS), .NET (C#), CMake (C++), Godot headless
(GDScript).

**Avec un piège :** le runner GDScript ne démarre pas sur une machine fraîche — il dépend de
`.godot/global_script_class_cache.cfg`, qui est dans `.gitignore`. Sans un
`godot --headless --import` préalable, tous les `class_name` échouent à se résoudre. À mettre dans le
YAML une fois.

---

## 15. `getSceneConnections()` perd sa table, et sa doc était fausse

**Tranché — aucune fonctionnalité ne se perd. La méthode est reconstruite, la doc corrigée.**

### Ce que j'avais annoncé, et qui était faux

J'ai d'abord écrit que la v1 savait relier deux scènes et que la v2 le perdait. **Non.** Deux relevés
le démentent :

1. [getSceneConnections](lsde-ts/src/graph.ts#L120) rend `scene.connections` — **tous les fils DE la
   scène**, pas ceux qui en sortent. Le mot « inter-scènes » n'apparaît nulle part dans le code.
2. Le seul blueprint v1 réel du dépôt (`blueprints/blueprint.json`) : **1 scène, 11 fils, 0 hors
   scène**. Aucun export LSDE n'a jamais produit un fil qui traverse une scène.

C'était donc une ligne de documentation sans code derrière, pas une capacité expérimentée puis
abandonnée. Rien à récupérer, rien à demander à LSDE2.

### Ce qui reste vrai

La méthode est de l'**inspection de graphe** : elle sert à un outil de debug qui veut voir le câblage
d'une scène sans la jouer. Utile, et facile à garder — en v2 les fils sont sur les blocs, donc on
aplatit les `next` au lieu de lire une table.

### Ce qu'on fait

- Reconstruire `getSceneConnections()` sur les `next` des blocs, même signature, même rôle.
- Corriger les **deux lignes fausses** du `CLAUDE.md` (§3.9 et le tableau des décisions §13) qui
  présentent la méthode comme le moyen de naviguer entre scènes. Elles partent avec le problème 13.
- Enchainer deux scènes reste entièrement l'affaire du développeur — c'est ce qui était vrai depuis
  le début, la doc disait seulement le contraire.

---

## 16. L'émotion appartient au bloc, plus au personnage

**Tranché — le changement de LSDE2 est le bon. On s'aligne.**

En v1, `metadata.characters[]` portait un `emotion` et un `emotionIntensity` **par entrée**. En v2,
`emotion` et `intensity` sont sur le **bloc**, et `actors` n'est plus qu'une liste d'ids.

### Pourquoi c'est mieux

Un bloc est **une réplique**, et une réplique a **un ton**. C'est le bloc qui décide de l'émotion ;
`actors` dit ensuite qui peut la porter.

`DIALOG-003` de `reactor_breach` le dit lui-même dans sa note : *« Les deux le disent en même temps,
et aucun des deux ne veut être celui qui a parlé le premier »*. Deux acteurs, une phrase, une peur.
La v1 aurait exigé qu'on écrive deux fois la même émotion pour dire ça — et aurait autorisé de les
désynchroniser par accident.

Le pluriel de `actors` garde tout son sens : c'est le casting de la réplique, ce que `portPerCharacter`
transforme en ports et que [onResolveCharacter](lsde-ts/src/playground.ts#L46) tranche à l'exécution.
Le casting et le ton sont deux choses différentes ; la v1 les avait collées.

### Ce qu'on fait

[createDialogContext](lsde-ts/src/block-context.ts#L32) se réécrit autour d'un bloc qui porte une
émotion et une liste d'acteurs. Plus simple qu'avant, moins de champs à tenir cohérents.

---

## 17. Il n'y a pas de nom de bloc, et il n'en faut pas

**Tranché — le problème se referme. Rien à demander à LSDE2.**

J'avais ouvert ça parce que `label` et `parentLabels` sont absents des 22 blocs. La crainte : des
diagnostics illisibles. **Elle ne tient pas**, pour deux raisons vérifiées.

### 1. L'identité v2 est déjà lisible

En v1, un bloc s'appelait `a3f7c2e1-9b04-...`. En v2, il s'appelle `DIALOG-007`. Un diagnostic v2
**sans aucun label** est déjà meilleur qu'un diagnostic v1 avec.

### 2. Les 22 blocs portent une `note`, et elle vaut mieux qu'un nom

Pas un nom : une phrase. `DIALOG-007` porte *« Vesk se cache derrière le réservoir. Il ne parle que
si le joueur l'a déjà croisé »*. Aucun label de trois mots n'aurait dit ça.

### Et l'argument de fond est le bon

Nommer chaque bloc de chaque scène est un travail qui ne finit jamais et qui pourrit dès qu'on
retravaille la scène. On branche des blocs, jamais des noms. **Un nom obligatoire aurait été une
dette imposée à l'auteur pour le confort d'un message d'erreur.**

### Ce qu'on fait

Les diagnostics citent `id`, et ajoutent la `note` quand elle est là. Si un `label` arrive un jour
dans un export, il passe devant — le champ est optionnel dans les types, on le lit sans l'exiger.

---

## 18. Les textes séparés du blueprint

**Tranché — le mode séparé fonctionne déjà. Le moteur ne lit jamais un texte, donc il n'y a rien
à brancher. Reste deux petites choses de confort.**

### Le réglage existe, et il est explicite

Écran d'export de LSDE2, section **Scènes → Contenu** :

- ☑ **Texte des répliques** — son propre tooltip dit :
  *« Décoché, l'export ne porte que la structure du graphe — le jeu va chercher les textes dans les
  fichiers de langue. »*
- ☐ **Écrire les textes à part**

Ce n'est donc ni un doute ni un oubli : c'est un réglage documenté dans l'interface. J'avais posé la
question alors que la réponse était à l'écran.

### Pourquoi le mode séparé est la BONNE pratique

Ce n'est pas un cas marginal, c'est ce que la plupart des intégrations voudront :

- Un `text: { en, fr, es, de, ja, ... }` par bloc force le jeu à charger **toutes** les langues pour
  en jouer une seule. À 20 langues et quelques milliers de scènes, c'est absurde.
- Un jeu charge la langue **que le joueur a choisie**, et seulement celle-là. C'est exactement ce que
  le découpage `localization/<locale>/` permet.
- La logique et la traduction ne bougent pas au même rythme, ni par les mêmes personnes. Les tenir
  dans deux fichiers, c'est deux cycles de travail qui ne se marchent pas dessus.

Le mode en ligne est un confort de développement (c'est celui des exports du dépôt), pas la cible.

### Et le moteur le supporte DÉJÀ — relevé dans le code

`dialogueText` n'apparaît **nulle part** dans le moteur : ni [engine.ts](lsde-ts/src/engine.ts), ni
[scene-handle.ts](lsde-ts/src/scene-handle.ts), ni [block-context.ts](lsde-ts/src/block-context.ts).
Uniquement dans les types, dans l'utilitaire, et dans le playground.

[getLocalizedText](lsde-ts/src/lsde-utils.ts#L42) est une **méthode statique de `LsdeUtils`**, pas un
hook : elle prend un objet que le développeur lui passe. Le moteur, lui, remet le bloc entier au
handler et ne regarde jamais dedans.

**Conséquence : un export sans textes traverse déjà le moteur sans une ligne à changer.** Le
développeur reçoit le bloc avec son `id` et sa `key`, et va chercher sa réplique où il veut. C'est la
conséquence directe de *Ce que le moteur ne fait jamais* — la même règle qui explique `{{@a1}}`.

### Faut-il un callback `onResolveText` ? Non.

L'idée se défend — tout le reste du moteur marche par callbacks — mais ici elle n'achète rien :

- Un callback existe pour que le moteur puisse **demander** ce dont il a besoin. Le moteur n'a jamais
  besoin d'un texte : il ne l'affiche pas, ne le mesure pas, ne le valide pas.
- Le développeur a déjà le bloc dans son `onDialog`. Il appelle sa fonction. Un hook lui ferait faire
  le même travail, avec un aller-retour de plus.
- Un hook imposé sur un texte, c'est la porte ouverte à ce que le moteur commence à lire ce qu'il y
  a dedans.

**Le texte n'est pas un service du moteur, c'est une donnée du jeu.**

### Ce qui reste vraiment à faire

Deux points de confort, petits, sans urgence :

1. **`getLocalizedText()` ne sait lire que le mode en ligne.** Dans le mode séparé, l'utilitaire ne
   sert plus. Il faudrait un pendant qui navigue une table de langue : `scène → bloc`, et
   `scène → bloc → option` pour un choix — la forme de `localization/<locale>/__blueprints__.json`.
   Une utilité statique, pas un hook. Le développeur charge le fichier, le moteur ne fait pas d'IO.
2. **`getLocale` est du code mort.** Déclaré dans l'interface interne du scene handle
   ([scene-handle.ts](lsde-ts/src/scene-handle.ts#L27)), jamais appelé dans son corps. `setLocale()`
   garde son utilité (il valide le code contre `locales`), mais ce passe-plat part.

---

# L'ordre de traitement

| # | Problème | Dépend de | État |
|---|---|---|---|
| 1 | Charger et valider | — | **fait (ts)** |
| 8 | Brancher les types générés | — | **fait (ts)** |
| 2 | Le routage | 1 | **fait (ts)** |
| 3 | Les conditions | 1 | **fait (ts)** |
| 4 | Retirer le dispatcher | 3 | **fait (ts)** |
| 5 | La distribution | 1 | **fait (ts)** |
| 6 | Le sac `props` | 1 | **fait (ts)** |
| 7 | Le `sceneId` | 1 | **fait (ts)** |
| 12 | Les specs partagées | 2, 3 | **fait** — regénérées en v2 |
| 9, 10 | Convention de nommage, multi-fichiers | 1 | **fait (ts)** |
| 11 | Faire remonter les erreurs | — | **fait (ts)** |
| 16 | L'émotion sur le bloc | 1 | **fait (ts)** |
| 18 | Table de langue + retirer `getLocale` | — | **fait (ts)** |
| 15 | Reconstruire `getSceneConnections` | 1 | **fait (ts)** |
| 17 | — *refermé, rien à faire* | — | **fait (ts)** |
| — | **Porter C#, C++, GDScript** | tout ce qui précède | **fait — les quatre** |
| 13 | La documentation | tout | **fait** |
| 14 | Monter le CI | **tout** — c'est la dernière étape | **fait** |

**Le TypeScript est fini : 393 tests, `tsc --noEmit` propre, `npm run build` propre.** La
référence est en v2 ; les trois ports se font contre elle et contre `tests/*.json`.

---

# Le contexte

LSDE2 a réécrit son format d'export de fond en comble. Le moteur (`@lsde/dialog-engine`, quatre
runtimes, publié sur npm et NuGet) lit encore le format v1.

Un client qui exporte depuis LSDE2 aujourd'hui n'obtient rien qui fonctionne — et le moteur ne plante
pas, il joue mal, sans un message. Donc on ne publie rien tant que les deux ne sont pas d'accord.

Le moteur est en **0.3.0**, pas 1.0 : aucune promesse de compatibilité à briser. C'est le bon moment
pour casser.

**Deux décisions de cadrage :**

- **Rupture nette, pas de double lecteur.** Les deux formats n'ont aucun champ en commun : un lecteur
  double serait deux moteurs dans un paquet, pour servir un éditeur que les clients vont quitter. La
  0.3.x reste disponible pour les projets LSDE 1.6.
- ~~**Publication en 1.0.0.**~~ **Publication en 2.0.0** — décidé par Jonathan le 2026-09-07,
  appliqué. L'ancien raisonnement (« le format porte `version: 1`, donc moteur 1.x lit format 1 »)
  regardait le mauvais numéro : ce n'est pas le format que le client a sous les yeux, c'est LSDE.
  Il ouvre un éditeur qui affiche **2.0.3** et cherche le moteur qui va avec ; `2.x` le lui dit
  sans qu'il ait à savoir qu'un numéro de format existe. Le `"version": 1` du fichier reste ce que
  [validator.ts](lsde-ts/src/validator.ts) vérifie — les deux numéros ne parlent pas au même
  public. Ce qui tenait dans l'ancienne décision tient toujours : une 0.4.0 qui casse tout serait
  un mensonge poli.

**Les deux dépôts :**

| | Chemin | Rôle |
|---|---|---|
| LSDE2 | `../LSDE2` | l'éditeur — il ÉCRIT la charge utile |
| Le moteur | ce dépôt | il LIT la charge et dispatche vers les callbacks du jeu |

---

# L'export de référence

`mock/blueprints/Engine-Conformance-Scene.*` — écrit par LSDE **2.0.3** le 2026-09-07.

Deux scènes (`reactor_breach` 18 blocs, `docking_ring_brief` 4 blocs), les cinq types de bloc,
4 dictionnaires, 8 fonctions, 14 fiches, 3 langues, plus le JSON Schema et les quatre interfaces
typées.

C'est la **preuve unique** sur laquelle le moteur est porté et testé. On ne fabrique pas de charge à
la main : on vérifie ce que le logiciel produit.

## Ce qui a été ouvert et vérifié

- **La racine** — conforme, aucune surprise. `format`, `version: 1`, `generator 2.0.3`, `exportedAt`,
  `project`, `locales`, `referenceLocale`, et les trois tables complètes.
- **Les identifiants de bloc** — quatre collisions entre scènes (problème 1).
- **Le `sceneId`** — présent depuis le second export (problème 7).
- **`waitForBlocks`** — revenu, même forme qu'en v1 : `["DIALOG-012", "DIALOG-007"]`.
- **Les unités** — `delay: 1000`, `timeout: 5000` : millisecondes confirmées.
- **Le dictionnaire `choice`** — présent, et utilisé par `COND-004`.
- **Les types TypeScript générés** — consommables tels quels (problème 8).

## Ce qui reste à ouvrir

- [x] Les **ports** réels : `out` ×12, `then` ×3, `catch` ×3, `default` ×3, `C1..C4`, `K1..K3`,
      `var1`/`var2` pour les acteurs. Les six ports fixes et les trois familles nommées sont là.
- [x] Le sac **`props`** : 15 clés distinctes, dont les **huit natives de la v1**
      (`delay`, `timeout`, `debug`, `isAsync`, `portPerCharacter`, `skipIfMissingActor`,
      `waitForBlocks`, `waitInput`) plus la nouvelle `portPerCase`. Rien de perdu de ce côté.
- [ ] Les **options** d'un choix : `id` = port, `when`, option non branchée
- [ ] Les **appels d'action** : `args` par nom, `fn: ""` quand aucune fonction n'est choisie
- [ ] La **collision de propriété** : une propriété custom nommée « Delay » écrase-t-elle la native ?
- [ ] Le **bloc NOTE** et le fil qui le vise : le fil disparaît-il vraiment ?
- [ ] Un **port portant deux fils**
- [ ] Les interfaces **C# / GDScript / C++** : produisent-elles bien la même chose ?

---

# Ce que le moteur ne fait jamais

**Le moteur lit la structure. Jamais le contenu d'un texte.**

Il traverse des blocs, résout des ports, évalue des conditions et rend la chaîne brute au
développeur. Ce qu'il y a **dans** cette chaîne ne le regarde pas.

[playground.ts](lsde-ts/src/playground.ts#L57) le montre en deux lignes : `getLocalizedText()` prend
la bonne langue, et la ligne suivante affiche le résultat tel quel.

Donc `{{@a1}}`, `{:a2}`, `{|}`, `{{#ui.hud.airlock_label}}` dans un texte exporté : ce sont les
marqueurs **du jeu du client**, dans ses clés à lui, remplis par son propre système. Le moteur ne
les analyse pas, ne les valide pas, ne se plaint pas s'ils désignent quelque chose qu'il ne connaît
pas — il ne les voit même pas.

> **Pourquoi c'est écrit ici.** Le 2026-09-07 j'ai signalé `{{@a1}}` comme un défaut de l'export et
> demandé une correction côté LSDE2. C'était faux, et ça a coûté une correction inutile dans
> l'éditeur plus une demi-journée à se demander si le plan tenait encore. La règle est évidente
> quand on la relit ; elle ne l'est pas quand on a le nez dans un JSON depuis trois heures.

---

# La couverture v1 → v2, champ par champ

Relevé fait sur `blueprint.types.ts` (v1) contre `Engine-Conformance-Scene.blueprints.types.ts` (v2)
et l'export réel. **Rien de ce que le moteur exécute n'a disparu.** Les manques sont ailleurs.

## Ce qui manque et que le moteur lisait

Trois cas ouverts, **trois cas refermés après vérification.** Aucun n'est une perte :

- **Les fils inter-scènes** (15) — n'ont jamais existé. Une ligne de doc sans code derrière.
- **L'émotion par acteur** (16) — retirée volontairement, et c'est un gain. Un bloc, un ton.
- **Les noms de bloc** (17) — pas nécessaires : `DIALOG-007` bat un uuid, et la `note` bat un nom.

## Ce qui manque et que le moteur n'a jamais lu

Aucune action côté moteur. Consigné pour que personne ne le redécouvre comme un bug.

| Parti de la v2 | Le moteur s'en servait ? | Conséquence |
|---|---|---|
| `metadata.color`, `.tags`, `.screenShots`, `.others` | non — il ne lisait que `.characters` | perte côté client. `tags` est le seul qui pouvait porter de la logique de son côté |
| `SignatureParam.type: 'enum'` + `enumOptions` | non | `ValueType` n'a que 4 valeurs en v2. À vérifier : l'éditeur propose-t-il encore des paramètres enum ? |
| `Scene.note`, `Scene.date` | non | sans effet |
| `ExportCondition.uuid`, `ExportAction.uuid`, `signatureUuid` | non | l'id de fonction suffit |
| `operator` en chaîne libre → 6 valeurs fermées | non | le moteur ne compare jamais lui-même, il délègue à `onResolveCondition`. Le jeu d'opérateurs est l'affaire de l'éditeur |

## Ce que la v2 ajoute et qu'il faudra savoir lire

- **`text` déclaré optionnel** — devenu le **problème 18**. Réglage assumé de l'export, et le
  moteur le supporte déjà : il ne lit jamais un texte.
- **`cards`** — la table qui donne un `name` aux ids `var1`, `var2` (problème 5).
- **`Block.body`** pour le corps d'une note. Non utilisé dans l'export : les deux notes portent leur
  texte dans `note`. À signaler à LSDE2, sans importance pour le moteur — il ignore les notes.

---

# Le dictionnaire réservé `choice`

Le manque le plus important de la première passe est comblé. Une condition peut à nouveau porter sur
une réponse passée du joueur :

```json
{ "dict": "choice", "entry": "CHOICE-001", "op": "equals", "value": "C1" }
```

`entry` = un id de bloc CHOICE, `value` = un id d'Option de ce bloc. La mémoire commence et finit avec
la scène, et aucun dictionnaire de projet ne peut prendre cet identifiant.

C'est exactement ce que le moteur sait déjà faire avec son historique interne — il faut le rebrancher
sur la nouvelle forme.

**Détail de forme signalé à LSDE2 :** c'est déclaré dans la constante `Ports` alors que le commentaire
du fichier dit lui-même « NOT a port ». Quelqu'un qui itère `Ports` pour valider un `link.port`
acceptera `"choice"` comme port valide.

---

# Correctifs livrés avant la migration

## Trois bugs de robustesse, quatre runtimes *(2026-09-07)*

Aucun n'était couvert par un test. Chacun **prouvé par mutation** contre le commit précédent.

| Bug | Sur le code d'avant |
|---|---|
| Une NOTE bouclée faisait planter le moteur | TS : `RangeError` · **C# : plantage du processus** · C++ : mort du processus · GDScript : crash |
| `resolve()` de `onBeforeBlock` n'avait aucune garde | GDScript : `["b1","b2","b2","b1","b2","b2"]` pour deux blocs |
| Un `resolve()` tardif ressuscitait une scène terminée | `onSceneExit` tiré deux fois |

**Le cas C# était le plus grave :** un `StackOverflowException` n'est pas rattrapable en .NET. Une
note bouclée par un designer ne faisait pas échouer une scène, elle **tuait le jeu Unity entier**.

## État des tests

| Runtime | Tests (v1, avant migration) | Vérifié comment |
|---|---|---|
| TypeScript | 306 | `vitest` + `tsc --noEmit` |
| C# | 107 | `dotnet test`, 3 projets |
| C++ | 95 | MSVC + gtest |
| GDScript | 91 | Godot 4.3 headless |

Le README annonçait 216 / 42 / **40-sur-42** / 42. Les quatre étaient faux.

**Après la migration v2** — recomptés le 2026-09-07 :

| Runtime | Tests | Vérifié comment |
|---|---|---|
| TypeScript | **393** | `vitest` + `tsc --noEmit` propre |
| C# | **115** | `dotnet test`, 3 projets |
| C++ | **52** | MSVC + gtest (les suites regroupent, d'où le compte plus bas) |
| GDScript | **115** | Godot 4.6 headless |

---

# Journal

## 2026-09-07

- Audit complet du contrat v1 → v2 : correspondance champ par champ, 8 ruptures d'algorithme,
  4 capacités du moteur sans données.
- Trois bugs de robustesse corrigés dans les quatre runtimes, prouvés par mutation.
- Godot 4.3 téléchargé pour vérifier le GDScript — il ne l'était pas.
- Premier export de référence reçu (12h32). Racine vérifiée, collisions d'ids confirmées.
- **Discussion sur l'identité des scènes** : la conclusion « pas de régression » était fausse.
  Corrigée par Jonathan. Décision prise et livrée le jour même côté LSDE2 (problème 7).
- Second export reçu (13h21), déclaré final. Il apporte le `sceneId`, le retour de `waitForBlocks`,
  et confirme les millisecondes.
- **Discussion sur le bloc condition** : les deux modes verrouillés (problème 3), le dispatcher
  écarté définitivement (problème 4).
- Plan restructuré : un numéro = un problème, le reste en sections sans numéro.
- Problème 9 tranché : une seule convention, `camelCase`, vérifiée au chargement.
- Export `perScene` reçu (`mock/multi/`) et vérifié : autonome, cohérent, rien à retravailler.
  Problème 10 tranché : on le supporte tout de suite.
- Problème 11 tranché : aucune erreur silencieuse, tout remonte au développeur. Découvert au passage
  que GDScript, faute de `try/catch` dans le langage, faisait déjà ce qu'on veut — les quatre
  runtimes divergeaient sans que personne le sache.
- Problème 14 tranché : CI monté après la migration, pas pendant.
- **Les 14 problèmes sont tranchés.** Reste à ouvrir les blocs de l'export, puis à coder.
- **Fausse alerte corrigée** : j'avais signalé `{{@a1}}` dans les textes comme un défaut de l'export.
  C'était faux. C'est un placeholder du jeu du client, dans sa clé à lui. **Le moteur lit la
  structure, jamais le contenu d'un texte** — il passe la chaîne brute au développeur, qui la
  remplit. [playground.ts](lsde-ts/src/playground.ts#L57) le montre en deux lignes. Aucun des
  problèmes du plan ne portait sur le contenu d'un texte : l'erreur était isolée, rien à refaire.
- **Règle consignée** après la fausse alerte : *Ce que le moteur ne fait jamais*.
- **Passe de couverture v1 → v2 avant les travaux.** Champ par champ, contre l'export réel.
  Les huit propriétés natives de la v1 sont toutes présentes, les six ports fixes aussi : rien de ce
  que le moteur exécute n'a disparu.
- **Trois manques ouverts (15, 16, 17), les trois refermés le jour même.** Le 15 était une erreur de
  ma part : j'ai lu le `CLAUDE.md` au lieu du code. Les fils inter-scènes n'ont jamais existé —
  `getSceneConnections` rend les fils **de** la scène, et le seul blueprint v1 du dépôt n'a qu'une
  scène. Le 16 et le 17 sont des décisions de LSDE2 que la vérification confirme : un bloc a un ton,
  et `DIALOG-007` + sa `note` valent mieux qu'un nom qu'il faut maintenir.
- **Problème 18 ouvert puis tranché le même jour.** J'avais demandé à LSDE2 si un réglage pouvait
  retirer les textes des blocs — question inutile, la case et son tooltip sont à l'écran d'export, et
  Jonathan me l'avait déjà montré. Pire : `dialogueText` n'apparaît **nulle part** dans le moteur.
  Le mode séparé passe déjà sans une ligne à changer. Deuxième erreur de la journée à avoir la même
  cause que celle de `{{@a1}}` : oublier que le moteur ne touche jamais au texte.
- **Un callback `onResolveText` écarté** : le moteur n'a jamais besoin d'un texte, donc il n'a rien à
  demander. Un utilitaire suffit.
- **Les 18 problèmes sont tranchés. Plus aucune question en attente de LSDE2.** On peut coder.

### Les travaux commencent — problèmes 1 et 8 livrés en TypeScript

- **Le 1 et le 8 sont indissociables** et ont été faits ensemble. On ne valide pas un format sans
  ses types : dès que `types.ts` décrit la v2, il n'y a plus de v1 nulle part. Les faire l'un
  après l'autre aurait voulu dire écrire des types v2 à la main pour les jeter le lendemain.
- **Ce qui prouve le 1 :** `blueprint-loading.test.ts`, 43 tests, sur les trois fichiers que LSDE
  a écrits. Zéro erreur, **et zéro warning** — un warning sur l'export de référence voudrait dire
  que la règle qui l'a levé est fausse, pas le fichier.
- **Trois problèmes voisins sont tombés avec :** le 15 (`getSceneConnections` reconstruit sur les
  `next`), le 17 (les diagnostics citent l'id puis la note), et la moitié du 7
  (`getSceneGraph()` répond au chemin comme au `sceneId`). Aucun n'est du débordement : `graph.ts`
  ne compilait pas sans le 15, et le 7 aurait voulu dire choisir une clé de scène arbitraire pour
  y revenir plus tard.
- **Le dépôt TypeScript ne compile plus, et c'est attendu.** 135 erreurs de type dans huit modules,
  161 tests rouges sur sept fichiers : `port-resolver`, `condition-evaluator`, `block-context`,
  `scene-handle`, `engine`, `handler-registry`, `index`, `lsde-utils`. Ce sont exactement les
  problèmes 2, 3, 5, 6, 12 — l'ordre du plan les enchaîne juste après. Les quatre fichiers du
  périmètre (`blueprint-types`, `types`, `graph`, `validator`) sont propres au `tsc`.
- **Le C#, le C++ et le GDScript n'ont pas été touchés** et restent verts sur la v1.
  `blueprints/blueprint.json` (v1) n'a pas bougé : leurs playgrounds et leurs tests le lisent, et
  le remplacer maintenant les casserait tous les trois pour rien. Il part avec le portage.
- **Question tranchée : le numéro de version du paquet.** Le plan avait tranché
  **1.0.0** (« moteur 1.x lit format 1 »), et l'export confirme le raisonnement — le fichier porte
  bien `"version": 1`. **Jonathan a tranché : 2.0.0**, pour que le client voie tout de suite que le
  moteur s'aligne sur LSDE 2.x. Appliqué dans les cinq fichiers (`lsde-ts/package.json`, les trois
  `.csproj`, `CMakeLists.txt`) — à la main, jamais par `publish.sh` qui écrit dans l'historique.

### La référence TypeScript est en v2 — les 16 problèmes qui la concernaient sont livrés

Fait dans l'ordre du plan, chaque module avec sa suite réécrite. **393 tests, zéro erreur `tsc`.**

| Problème | Ce qui a changé |
|---|---|
| **2** — le routage | `port-resolver.ts` route sur des **noms de ports**. `fromPortIndex` n'existe plus. 31 tests exhaustifs : c'est le fichier que les trois ports copient. |
| **3** — les conditions | Liste de cas portant leur port. `evaluateConditionCases()` remplace `evaluateConditionGroups()` et rend un port, plus un index. |
| **4** — le dispatcher | Retiré. Un test prouve qu'aucun chemin ne peut plus rendre deux ports. |
| **5** — la distribution | `resolveCards()` résout `actors` et `emotion` par la table `cards`. Le contexte porte **toute** la liste : le moteur n'élit plus un premier. |
| **6** — le sac `props` | `NATIVE_PROPERTY_IDS` (neuf ids) trie le sac. `LsdeUtils.getNativeProperties()` / `getCustomProperties()`. |
| **7** — le `sceneId` | `engine.scene()` accepte le chemin **ou** `sc_u0vqg2g8`. |
| **9** — la convention | Un fichier en `snake_case` ou `PascalCase` est refusé avec `WRONG_NAMING_CONVENTION`, qui **nomme le réglage à changer** — pas « ce n'est pas un blueprint » sur un fichier qui en est un. |
| **10** — multi-fichiers | `init()` accepte une liste. `project` + `exportedAt` doivent concorder, sinon `MISMATCHED_EXPORTS`. Vérifié sur les vrais fichiers de `mock/all/`. |
| **11** — les erreurs | Les deux `catch` relancent après avoir fermé la scène. Quatre tests : l'erreur arrive au jeu **avec** les nettoyages passés, les pistes annulées et `onSceneExit` tiré. |
| **16** — l'émotion | Sur le bloc. `context.emotion` + `context.intensity`, `context.actors` pour le casting. |
| **18** — les textes | `LsdeUtils.getTextFromTable()` navigue une table de langue (`scène → bloc`, `→ option`). `getLocale` retiré du scene handle. **Aucun callback ajouté.** |

**Deux choses trouvées en écrivant les tests, pas avant :**

1. **La visibilité des options était taguée même sans résolveur installé.** Le routage doit choisir
   une branche, donc une question sans réponse devient `false` ; une option n'a pas cette
   obligation, et répondre `false` **cacherait au joueur** une réponse que personne n'a pu
   évaluer. Deux évaluateurs séparés maintenant : `routingEvaluator()` et
   `visibilityEvaluator()`, ce dernier rendant `undefined` — *inconnu*, pas *caché*.
2. **Les conditions `choice` marchent sans une ligne de code du jeu.** Une scène qui ne pose de
   questions que sur ses propres réponses passées se joue sans `onResolveCondition`.

**Ce qui a été supprimé de l'API :** `setChoiceFilter()` (déprécié), `filterVisibleChoices()`
(remplacé par `tagOptionVisibility`, qui ne raccourcit pas la liste), `evaluateConditionGroups()`,
`resolve( boolean | number | number[] )`, `getLocale`.

**Les specs partagées (12)** sont regénérées par `tests/generate-specs.py` — 40 suites, 46 cas, en
v2. Écrites depuis un script et non à la main pour que les quatre runtimes ne puissent pas diverger
sur la forme d'une charge. Elles couvrent ce que la v1 ne pouvait pas dire : les ids qui se
répètent entre scènes, l'ouverture par `sceneId`, la mémoire `choice`, `portPerCase`, le cas sans
`when`, et deux pièges — un port de cas non branché ne retombe **pas** sur `default`, et un
payload encore câblé sur `true`/`false` ne route nulle part.

### Le C# est porté — 115 tests au vert

Même ordre, mêmes décisions, un seul écart assumé.

**L'écart : le C# n'importe pas le fichier généré tel quel.** Le TypeScript le copie verbatim
(`blueprint-types.ts`), le C# ne peut pas : le fichier généré met les propriétés en `camelCase` et
son namespace porte le nom du projet du client. `Types.cs` reprend donc le contrat en `PascalCase`,
alimenté par un `CamelCasePropertyNamesContractResolver` — ce qui est exactement l'argument du
problème 9 : *le désérialiseur fait déjà la conversion*.

**Ce qui a disparu du C# :** le convertisseur JSON polymorphe des deux loaders. La v2 a **un** seul
`BlueprintBlock` dont les champs optionnels dépendent de son `Type`, donc il n'y a plus rien à
aiguiller à la lecture. Cinq sous-classes, deux convertisseurs, en moins.

**Une chose trouvée en portant :** un payload v1 écrivait `"version": "1.0.0"`, une chaîne, là où
le contrat v2 attend un nombre. Un jeu C# qui reçoit un vieil export voyait donc une exception de
désérialisation sur un type de token — alors que le moteur a un diagnostic qui **nomme** le
problème. Refuser un payload est le travail du chargeur, pas de l'analyseur, donc l'analyse doit
survivre assez longtemps pour que le validateur puisse parler : `TolerantVersionConverter` est là
pour ça. Le TypeScript n'avait pas ce problème (JSON dynamique), et c'est le genre de divergence
que seuls les tests partagés font sortir.

| Projet | Tests |
|---|---|
| `LsdeDialogEngine.Tests` | 91 — conformité partagée, robustesse, conditions |
| `LsdeDialogEngine.Newtonsoft.Tests` | 12 — lecture du vrai export |
| `LsdeDialogEngine.SystemTextJson.Tests` | 12 — idem |

**Le `MiniRuntime` C# produit une sortie identique au playground TypeScript** sur
`mock/blueprints/` — mêmes blocs, mêmes acteurs, mêmes émotions, même branche prise par le
dictionnaire `choice`. C'est la preuve de conformité qui compte plus que n'importe quel test unitaire.

### Le C++ est porté — 52 tests au vert

Le cœur reste **stdlib-only** : `nlohmann/json` n'apparaît que dans `json_loader.cpp`, les tests et
le playground, comme avant.

**Deux choses que seul le C++ a imposées :**

1. **L'héritage en diamant.** `InternalDialogContext` est à la fois un `InternalBlockContext` (qui
   porte les cartes, l'émotion, l'intensité) et un `IDialogContext`. Sans `virtual`, il y a **deux**
   `IBaseBlockContext` dans l'objet et le compilateur refuse la conversion. Les quatre interfaces
   dérivent donc `public virtual IBaseBlockContext`, et `wrapHandler` passe du `static_cast` au
   `dynamic_cast` — un `static_cast` descendant depuis une base virtuelle est interdit.
2. **`_previousCharacter` devait devenir propriétaire.** Il sert au `fromContext` de
   `onValidateNextBlock`, et il pointait dans le contexte du bloc précédent — détruit en sortant du
   bloc. En v1 il pointait dans `block.metadata`, qui vivait aussi longtemps que le payload ; en v2
   la carte est une copie tirée de la table. Un `std::optional<Card>` le tient maintenant.

**Ce qui a disparu :** le lecteur JSON polymorphe (5 sous-classes, un `from_json` chacune), et
`switch (BlockType)` — le type v2 est une chaîne, donc les registres comparent des noms.

Comme le C#, le loader C++ lit un `"version": "1.0.0"` de v1 comme `0` au lieu de lever : refuser
un payload est le travail du chargeur, pas de l'analyseur, donc l'analyse doit survivre assez
longtemps pour que le validateur nomme le problème.

**Le playground C++ produit la même scène que le TypeScript et que le C#.** Trois runtimes, même
sortie, sur le même fichier.

### Le GDScript est porté — les quatre runtimes jouent la même scène

**Une divergence trouvée, et elle n'aurait pu l'être que par les specs partagées :** le parseur
JSON de Godot n'a pas de type entier. Il lit `"version": 1` comme le **flottant 1.0**, donc le
`version is int` du validateur refusait tout export valide avec `UNSUPPORTED_FORMAT_VERSION`. Le
validateur compare maintenant la **valeur**, pas le type. Les trois autres runtimes n'avaient pas
ce problème ; c'est exactement ce que `tests/*.json` sert à attraper.

**Le second obstacle était le piège déjà consigné au problème 14 :** un `class_name` ne se résout
pas sur une machine fraîche sans un `godot --headless --import` préalable, parce que
`.godot/global_script_class_cache.cfg` est dans `.gitignore`. Tous les tests échouaient au parse.
C'est la ligne qui manquera au CI si personne ne l'écrit.

**Une note qui reste vraie :** GDScript n'a pas de `try/catch`, donc une exception d'un handler
remontait déjà au jeu. Ce runtime faisait depuis le début ce que le problème 11 a fait faire aux
trois autres.

### Les quatre runtimes, même sortie

| Runtime | Tests | La preuve qui compte |
|---|---|---|
| TypeScript | **393** | `npm run playground` |
| C# | **115** | `dotnet run --project samples~/MiniRuntime` |
| C++ | **52** | `npm run playground` |
| GDScript | **115** | `npm run playground` |

**675 tests, zéro échec.** Et les quatre playgrounds, lancés sur `mock/blueprints/`, impriment la
même scène : mêmes blocs, mêmes acteurs, même émotion par bloc, même branche prise par le
dictionnaire `choice`, mêmes marqueurs de texte passés bruts. C'est la preuve de conformité qui
vaut plus que n'importe quel test unitaire — quatre implémentations indépendantes qui lisent le
même fichier et racontent la même histoire.

### 13 — la documentation est reprise

`CLAUDE.md` d'abord : c'est le document que lit un agent avant de toucher quoi que ce soit, donc
une ligne fausse y coûte plus cher qu'ailleurs. La section « Migration status » ne décrit plus un
chantier en cours mais les cinq changements qui expliquent tous les autres — les ports sont des
noms, un bloc est (scène, id), les fils vivent sur le bloc, les natives partagent `props` en
millisecondes, l'émotion appartient au bloc.

Les deux lignes fausses annoncées au problème 15 sont corrigées, et une troisième s'y ajoute :
`engine.scene()` prend le chemin **ou** l'id stable, et c'est l'id qu'il faut stocker hors du
payload.

**53 fichiers VitePress touchés**, sur quatre locales. Le levier est `docs/_shared/` : les guides
`en`/`fr`/`ja`/`zh` incluent les mêmes extraits, donc un extrait corrigé l'est partout. Trois ont
été **réécrits** plutôt que renommés, parce qu'un remplacement mécanique y aurait produit du code
faux :

- `block-condition.md` — les groupes indexés deviennent des cas portant leur port, et l'encadré dit
  pourquoi le dispatcher est parti.
- `block-choice.md` — `visible` est un **tag, pas un filtre** : `visible !== false`, jamais
  `visible === true`, sinon une option qu'aucun résolveur n'a pu évaluer disparaît de l'écran.
- `choice-reusable-filter.md` — un seul résolveur pour deux usages, et l'encadré explique pourquoi
  le moteur garde deux réponses distinctes à l'intérieur.

`guide/lifecycle.md` documentait l'avalement des exceptions comme un choix — la phrase exacte était
*« The error is silent — it is not logged or re-thrown. »* Elle est remplacée par ce que fait
maintenant le moteur, avec l'ordre qui rend la chose utilisable : la scène est fermée **puis**
l'erreur remonte.

### 14 — le CI, la dernière étape

`.github/workflows/tests.yml` — cinq jobs, un par runtime plus un pour les specs.

**Le job `specs` est celui qui compte le plus** : il relance `tests/generate-specs.py` et exige un
diff vide. Une modification à la main du JSON partagé devient rouge tout de suite, au lieu de
laisser les quatre runtimes diverger en silence pendant des mois — ce qui est exactement ce qui
était arrivé aux compteurs du README.

Le piège GDScript annoncé dans le problème est dans le YAML avec son explication : sans
`godot --headless --import`, `.godot/global_script_class_cache.cfg` n'existe pas sur un checkout
frais, aucun `class_name` ne se résout, et **tous** les scripts échouent au parse. Ce n'est pas un
test qui tombe, c'est la suite entière qui ne charge pas. Rencontré pour de vrai pendant le
portage.

**Un `.gitattributes` a dû venir avec.** Le générateur écrit en LF ; un checkout Windows avec
`core.autocrlf=true` les rend en CRLF ; le job `specs` verrait alors chaque ligne comme modifiée et
accuserait quelqu'un d'avoir édité le JSON à la main. `* text=auto eol=lf` ferme la porte.

Le job TypeScript lance `npm run lint` **avant** les tests, et ce n'est pas décoratif : vitest
transpile sans vérifier les types, donc une signature cassée passe la suite et casse le build d'un
client.

---

## Le chantier est terminé

Les 18 problèmes sont livrés, les quatre runtimes lisent le format v2, la documentation le décrit,
et le CI le garde.

Ce qui reste hors périmètre, volontairement : `blueprints/` contient toujours l'export **v1** — il
n'est plus lu par rien, et le remplacer n'apporterait qu'un renommage. Les paquets Rust, Lua et
Python restent des placeholders.

**La seule action manuelle qui reste : publier.** `npm run publish:*` écrit dans l'historique git
et pousse sur npm et NuGet — c'est une décision de release, pas une étape de migration, et elle
appartient à Jonathan.

---

# Revue d'avant-publication

Relecture des 74 fichiers source touchés par la migration, avant que Jonathan ne publie. La
consigne était de tout revoir, et de me remettre en question à chaque fois : *est-ce vraiment un
problème, ou est-ce que j'exagère ?* Chaque constat ci-dessous a été **prouvé par un test** avant
d'être corrigé, et trois soupçons sont tombés à l'épreuve.

Ce qu'ils ont tous en commun : le moteur faisait quelque chose de raisonnable sur **un** chemin et
autre chose sur l'autre, et rien à l'exécution ne le disait.

## 1. Un cleanup qui lève laissait une scène zombie

Le problème 12 avait corrigé le handler qui lève : la scène est fermée, **puis** l'erreur est
relancée. Le cleanup que ce même handler retourne, lui, n'avait pas été touché — il s'échappait au
milieu du démontage. Mesuré : `onSceneExit` jamais tiré, `running` resté à `true`, la poignée
toujours dans le registre du moteur, les pistes parallèles jamais annulées. Le jeu recevait son
exception **et** un moteur inutilisable.

Une faute, deux comportements opposés : exactement ce que le problème 12 disait avoir réglé, juste
déplacé d'un cran.

`runCleanup()` rend maintenant ce qui a été levé au lieu de le laisser passer. Le démontage va
toujours jusqu'au bout, et la faute est relancée quand il ne reste plus rien à dérouler. Deux
conséquences qui ne sautent pas aux yeux :

- `endScene()` annule **toutes** les pistes même si le cleanup de l'une d'elles lève. Avant, la
  première qui levait interrompait la boucle et laissait vivre celles d'après.
- `combineCleanups()` exécute **les deux** cleanups. Ils libèrent des choses sans rapport — le
  panneau d'un handler de scène, la voix audio d'un handler global — et laisser l'échec du premier
  sauter le second fuyait ce que le second possédait.

GDScript n'a pas d'exceptions : rien à attraper, rien qui s'échappe. Le commentaire qui y annonçait
une « error boundary » a été corrigé, il promettait une garde qui n'existe pas.

## 2. Chaque test de condition partait deux fois chez le jeu

`createContext` évaluait tous les cas pour remplir `context.cases[i].result`, puis
`evaluateConditionCases` réévaluait tout pour choisir le port. Mesuré sur deux cas d'un bloc :
trois appels en mode `portPerCase`, quatre en mode if. Le nombre dépendait du mode **et** du cas
qui matchait.

Ce qui contredit l'engagement écrit dans `condition-evaluator.ts` : pas de court-circuit dans une
chaîne, *parce que* l'évaluateur du jeu est aussi l'endroit où un projet journalise et compte ce
qu'on lui a demandé.

**J'ai failli casser un choix délibéré en corrigeant.** Un test existant —
« stops asking once a case holds » — documente que le court-circuit **entre cas** est voulu : un
cas plus bas est une autre question, et la poser laisserait un jeu journaliser une branche jamais
prise. `evaluateConditionCases` garde donc son court-circuit, tel quel. C'est le moteur qui change :
`pickPortFromResults()` lit le port dans les résultats déjà calculés. Chaque test atteint
`onResolveCondition` **exactement une fois**, quel que soit le mode.

## 3. `waitForBlocks` était inerte sur la piste principale

Seul `AsyncTrack` lisait la propriété. Un bloc de la piste principale la portant avançait quand
même. Mesuré : un bloc attendant `DIALOG-404`, absent de la scène, s'exécutait et continuait.

Le format tranche, dans ses propres mots : « *waitForBlocks, an array of block ids OF THIS SCENE
**the block waits for before it advances*** ». C'est une propriété du **bloc**. Pas d'une piste.

Une correction que j'ai failli justifier de travers : j'ai d'abord cru que l'export de référence le
prouvait, parce que `DIALOG-008` porte `waitForBlocks` sans `isAsync`. Vérification faite,
`DIALOG-008` n'est atteignable que via `DIALOG-012`, qui est async — il est donc **toujours** sur
une piste parallèle. Le mock ne prouvait rien. C'est le texte du format qui décide.

L'interface `IWaiter` (`Waiter` en TS) sort de là : une piste est une piste, et la principale est
celle que le joueur regarde. Elle se gare dans le même `pendingWaits`.

**Le risque assumé :** une attente insatisfiable sur la piste principale fige tout le dialogue,
sans `onSceneExit`. Sur une piste parallèle ce n'était qu'une branche morte. D'où le diagnostic
d'init qui vient avec, `UNKNOWN_WAIT_BLOCK` : un `waitForBlocks` nommant un bloc absent de la scène
est signalé au chargement plutôt que découvert sur scène. Un avertissement, pas une erreur — le
reste de la scène joue.

## 4. `onValidateNextBlock` ne se déclenchait pas sur les pistes parallèles

Le hook vivait en ligne dans le `processBlock` de la piste principale seulement. Mesuré : blocs
dispatchés `[D1, D3, D4, D2]`, blocs validés `[D1, D2]`.

Un jeu qui s'en sert comme garde — « n'entre pas dans ce bloc si le joueur n'a pas la carte » —
était contourné dès qu'une branche était marquée `isAsync`. Rien dans le contrat du hook ne disait
qu'il ne valait que pour le flux regardé, et la doc du cycle de vie le place dans la séquence de
**chaque** bloc.

`runValidation()` est extrait et appelé par les deux pistes. Un refus arrête la piste concernée,
pas la scène.

## 5. Le validateur levait au lieu de diagnostiquer

Une scène sans `blocks` produisait `TypeError: scene.blocks is not iterable`, jeté hors de
`init()` — hors de la seule fonction dont le travail est de **refuser** un payload illisible en
disant pourquoi. C'était aussi une divergence : C++ et GDScript ne plantaient pas, TypeScript et C#
si. L'implémentation de référence était la plus fragile des quatre.

**Et j'ai corrigé de travers du premier coup.** J'avais ajouté un code `MISSING_SCENE_BLOCKS` — que
la spec partagée a immédiatement rejeté en C# : `Blocks` a un initialiseur, et un `std::vector` C++
existe toujours. « Absent » et « vide » sont **indiscernables** dans deux des quatre langages. Un
diagnostic que trois runtimes sur quatre peuvent lever n'est pas une vérification, c'est une
divergence. Il est retiré : la liste est normalisée, et `NO_START_BLOCK` dit déjà ce qui compte —
la scène ne peut pas jouer. Les quatre le disent pareil.

C'est exactement le service que la spec cross-langage doit rendre, et elle l'a rendu sur mon
propre correctif.

## 6. Deux poignées sur la même scène : la vivante disparaissait du registre

`onSceneEnded` faisait un `delete activeScenes[sceneRef]` aveugle. Rien n'interdit d'ouvrir deux
fois la même scène — un hub revisité pendant qu'un premier passage est garé sur un handler.
Mesuré : `b.isRunning() === true` pendant que `engine.isRunning() === false`. `stop()` ne
l'atteignait plus. On ne supprime plus que si l'entrée pointe encore sur la poignée qui se termine.

## 7. La façade était encore en v1 dans les cinq README

Le plus visible, et celui que j'avais annoncé corrigé à tort : les guides VitePress avaient été
migrés, **pas** les README. Treize lignes parlant d'`uuid` dans chacun des quatre runtimes, et un
quick-start hybride — `context.options` en v2 à côté de `visible[0].uuid` en v1, du
`enableDispatcher` alors que le dispatcher a été supprimé au problème 4, un `resolve(matched[0] ?? -1)`
alors que `resolve()` prend un **nom de port**. Le code d'exemple ne compilait pas.

Les compteurs de tests ont été **retirés de la prose** plutôt que corrigés. Ce fichier avertit
depuis le problème 17 qu'ils dérivent en silence ; les réécrire n'aurait fait que remettre le
compteur à zéro avant la prochaine dérive.

## Ce que la revue a trouvé en passant

- **`GetTextFromTable` manquait en C++**, alors que l'en-tête `utils.h` y renvoyait le lecteur. Le
  mode texte séparé — celui que la plupart des intégrations veulent — était injoignable depuis
  Unreal. Ajouté, avec `LocaleTable` en stdlib pur.
- **`BlueprintGraph` était copiable en C++, et sa copie était de l'UB.** Il possède `_data` par
  valeur pendant que `_functionsById`, `_cardsById` et chaque `SceneGraph::_scene` pointent dedans.
  Personne ne le copie aujourd'hui, mais `= delete` transforme une corruption mémoire silencieuse
  en erreur de compilation.
- **Divergence GDScript** : `condition_case.get("port", PORT_OUT)` faisait retomber un cas sans
  port sur `out`, quand les trois autres ne routent nulle part. Aligné.
- **`getAllSceneIds()` retournait des chemins.** Dans un format dont l'objet même est de séparer le
  chemin de l'id, le nom était un piège. Renommé `getAllScenePaths()` dans les quatre.
- Le validateur reconstruisait son index par bloc : `init()` était en O(blocs²). Hissé.
- `lsde_state_bridge.gd.uid` était suivi par git sans son `.gd`, supprimé en `e101d74`. Retiré.

## Le trou de couverture qui expliquait tout

`waitForBlocks` — l'une des **deux** seules natives qui ne sont pas inertes — n'avait **aucune**
spec cross-langage. Zéro occurrence dans les trois JSON. Et les trois tests TypeScript qui la
couvraient marquaient tous leur bloc `isAsync : true`. Le cas principal n'était testé nulle part,
dans aucun langage. C'est ça qui a laissé vivre le constat 3.

Trois suites l'entourent désormais : une attente insatisfiable sur la piste principale, une attente
déjà satisfaite, et la même chose sur une piste parallèle. Elles ont demandé un champ de plus au
contrat partagé, `expectedRunning` : une piste principale garée laisse la scène **vivante**, et le
runner exigeait jusqu'ici que toute scène de spec soit terminée. Une scène garée n'est pas une
scène finie, et c'est précisément la propriété à vérifier.

## Ce que j'ai retiré après vérification

Trois choses signalées puis abandonnées, parce que la vérification les a contredites :

- **Un `next()` tardif après la fin naturelle d'une scène.** Je soupçonnais un double
  `onSceneExit`. Testé : non. La garde de `executeBlockHandler` suffit.
- **`docs/api-ref/` et `dist/` pleins de v1** (`setChoiceFilter`, `ChoiceItem`, `fromPortIndex`).
  Les deux sont dans `.gitignore` et régénérés par le build. Aucun problème.
- **`start()` qui exige les quatre handlers même sans bloc du type.** J'y voyais une friction ;
  c'est un fail-fast délibéré. L'assouplir ferait échouer une scène **plus tard**, sur une branche
  rare, au lieu de tout de suite. Laissé tel quel.

Et un constat qui n'appartient pas au moteur : **le type `PropertyValue` généré par LSDE est faux.**
`boolean | number | string` en TypeScript, `std::variant<bool, double, std::string>` en C++ — pas
de liste. Or le commentaire du champ `props`, écrit par le même exporteur, dit qu'« *une native
porte une LISTE plutôt qu'un scalaire : waitForBlocks* », et l'export de référence contient bel et
bien `"waitForBlocks": ["DIALOG-012", "DIALOG-007"]`. Le moteur s'en tire, son `PropertyValue` C++
à lui inclut `std::vector<std::string>`. **C'est l'éditeur qu'il faut corriger**, pas le moteur —
`blueprint-types.ts` est copié verbatim et ne s'édite pas à la main.

## La duplication qui reste

La boucle de parcours existe **deux fois par runtime** : `processBlock`, `executeBlockHandler`,
`advanceToNextBlock` sont dupliqués entre `AsyncTrack` et `SceneHandleImpl`, avec le commentaire
« mirrors SceneHandleImpl logic » qui l'admet.

Ce n'est pas du dogme DRY : **les deux copies avaient déjà divergé**, et les constats 3 et 4 *sont*
cette divergence. Les deux correctifs les rapprochent — `IWaiter` et `runValidation()` sont
partagés — mais les deux copies subsistent.

Les fusionner pour de bon veut dire faire de la piste principale une piste comme les autres, d'id 0.
C'est la bonne forme, et c'est un chantier à part : quatre langages, avec l'héritage virtuel du C++
et les classes internes de GDScript. À faire délibérément, pas en marge d'une revue.

---

# Une seule logique de parcours

La revue avait laissé la duplication en place, et je l'avais écartée de moi-même. C'était la cause
racine de deux des sept défauts, pas une remarque de style — Jonathan a demandé qu'elle soit
traitée comme le reste.

## Ce que l'évaluation a montré, avant de toucher au code

Les deux exemplaires — le flux principal écrit dans `SceneHandleImpl`, les branches parallèles dans
une classe `AsyncTrack` — ne diffèrent que par **deux choses réelles** :

1. **Ce que « ce flux est terminé » veut dire.** Le principal : la scène se termine. Une branche :
   on la retire, la scène continue.
2. **Qui est le parent d'une piste qu'on ouvre.** Le principal n'en a pas ; une branche garde ses
   enfants pour l'annulation en cascade.

Tout le reste était du copier-coller : `this.parentHandle.x` contre `this.x`, un nom de variable,
une accolade placée autrement — plus une dérive accidentelle où l'un teste `running` et l'autre
`cancelled`. Deux points de variation pour une logique : le cas qui se centralise proprement.

## La forme retenue

Un fichier `track.ts` (`Track.cs`, `track.cpp`, `lsde_track.gd`) qui contient **le** parcours. Une
piste est un curseur : elle sait sur quel bloc elle est, ce qu'il lui reste à nettoyer, si elle est
garée. **Elle ne sait pas qu'elle est la principale** — seule la scène le sait, et seulement au
moment où la piste se termine :

```
trackEnded( track )  →  track.id == 0 ? la scène se ferme : on retire la branche
```

C'est le seul endroit du moteur où le flux principal se distingue d'une branche. Il porte l'id 0,
ce que le commentaire du code d'origine annonçait déjà (« *0 is reserved for the implicit main
track* ») sans que ce soit vrai.

La scène garde ce que les pistes **partagent** et qu'aucune ne peut posséder : les blocs visités,
l'historique des réponses, les registres de handlers, les pistes garées. `ITrackHost` est
volontairement étroit : une piste qui pourrait atteindre tout `SceneHandleImpl` redériverait vers
le travail de la scène.

## `waitForBlocks` : une case, un sens

En cherchant où placer l'attente dans le parcours unifié, une troisième incohérence est sortie —
celle qui explique pourquoi la propriété était si mal comprise. **Elle voulait dire deux choses
selon l'endroit du bloc :**

- premier bloc d'une piste → retenu **avant d'être dispatché** ;
- n'importe quel autre → dispatché, puis retenu **avant d'avancer**.

Même case à cocher, deux comportements, et le second montre la réplique trop tôt. Mon correctif de
la revue avait d'ailleurs choisi le mauvais des deux pour le flux principal.

Ce qui tranche, ce n'est pas un test : c'est le format lui-même, dans les types que LSDE génère —
« *waitForBlocks, an array of block ids OF THIS SCENE **the block waits for before it advances*** ».
Une propriété du **bloc**. Et le demo v1 (`LSDEDE-DEMO-TS`), écrit contre le moteur publié, le
documente du côté jeu : « *waitForBlocks → LSDE handles this internally (defers dispatch)* ».
Vérification faite dans la source v1 : c'est bien le moteur qui diffère `processBlock`, le jeu ne
peut rien y faire — le handler n'est jamais appelé, donc le jeu n'apprend même pas que le bloc
existe.

Un seul sens désormais, dans `processBlock`, pour toutes les pistes : **le bloc est retenu avant
d'être dispatché**. C'est aussi la frontière que la philosophie du moteur pose — le moteur décide
**quand** un bloc part, le jeu décide **à quoi ça ressemble** — et elle tient ici parce que
`waitForBlocks` est une native : le designer la coche dans LSDE, le moteur la lui doit.

Documenté une fois pour toutes : dans le type `NativeProperties`, dans `CLAUDE.md`, et dans le
guide `async-tracks` des quatre locales. Il ne devrait plus jamais falloir fouiller pour savoir ce
que fait cette case.

## Ce que la vérification a attrapé

**Le C++ a levé une régression que j'avais introduite.** Le test
`Robustness.ResolveAfterCancelDoesNotDispatch` : un jeu garde le `resolve()` d'`onBeforeBlock` et
le déclenche après la fin de la scène. Comme la piste est maintenant un objet à part, la vider du
pool la **détruisait**, et la fermeture capturée pointait dans le vide.

Les trois autres runtimes n'ont rien vu : leur ramasse-miettes garde l'objet en vie tant que la
fermeture le référence. Le C++ doit le dire. Une piste annulée est donc **arrêtée, pas supprimée** —
elle vit jusqu'à la poignée de scène. Le coût est borné (les pistes d'une scène), et
`getActiveTracks()` / `getTrackInfos()` filtrent déjà sur `isRunning()`.

Le même risque existait avant pour les pistes parallèles, qui étaient bien supprimées du pool. Il
n'était couvert par aucun test.

**La spec partagée a attrapé le reste.** La suite `wait-for-blocks-main-track` que j'avais écrite
la veille encodait l'ancien sens — bloc affiché puis retenu. Elle a échoué au bon moment, et le
compte des blocs visités est passé de deux à un : la preuve, dans le contrat cross-langage, que le
bloc n'est plus dispatché.

## Résultat

| | avant | après |
|---|---|---|
| TypeScript | `scene-handle.ts` 1059 l | `scene-handle.ts` 503 l + `track.ts` 498 l |
| C# | `SceneHandle.cs` 1211 l | `SceneHandle.cs` 559 l + `Track.cs` 521 l |
| C++ | `scene_handle.cpp` 907 l | `scene_handle.cpp` 405 l + `track.cpp` 348 l |
| GDScript | `lsde_scene_handle.gd` 897 l | `lsde_scene_handle.gd` 478 l + `lsde_track.gd` 367 l |

`processBlock`, `executeBlockHandler` et `advanceToNextBlock` : **zéro occurrence** dans les quatre
fichiers de scène. 698 tests verts, et les quatre playgrounds impriment la même scène — 8 blocs
visités, 27 fils, mêmes acteurs, même émotion, même branche, mêmes marqueurs bruts.

---

# Revue d'avant-commit — ce que la relecture a trouvé

Relecture fichier par fichier des vingt-et-un fichiers non commités, avant que Jonathan commite.
Quatre choses, dont une vraie.

## Le C++ perdait un `next()` gardé pour plus tard

La façon normale de piloter ce moteur : le handler affiche la réplique, rend la main, et le jeu
appelle `next()` une frame plus tard quand le joueur appuie. `next` est passé **par valeur**, le jeu
en garde donc sa propre copie.

En C++, cette copie tenait ses deux drapeaux — `nextCalled` et `syncPhase` — **par référence à la
pile de `executeBlockHandler`**. Quand le jeu rappelle `next()`, cette frame n'existe plus : la
lambda lit ce que l'appel suivant a écrit par-dessus. Comportement indéfini, et en pratique un
`next()` qui ne fait plus rien — le dialogue se fige, sans message.

Deux tests le montrent, et c'est la paire qui compte :

- `NextKeptForLaterStillAdvancesTheFlow` **passait déjà** — par chance, l'emplacement de pile
  contenait encore les bonnes valeurs.
- `NextKeptForLaterSurvivesAnotherSceneOnTheSameStack` **échouait** — dès qu'une autre scène occupe
  la même région de pile, le `next()` différé lit n'importe quoi.

Le défaut est **antérieur à la centralisation** : il était dans les *deux* copies d'origine,
identique, depuis le jour où le port C++ a été écrit. Le déplacement ne l'a ni créé ni aggravé ; il
l'a rendu visible, parce qu'un fichier neuf se relit. Aucun test C++ n'appelait `next()` en différé —
tous l'appelaient dans le handler.

Les trois autres runtimes n'ont jamais eu le problème : TS et C# capturent la variable, pas son
emplacement, et GDScript utilise déjà un `Array` partagé pour exactement cette raison. Le C++ dit
maintenant la même chose avec un `shared_ptr<NextState>` — le patron que `resolvedOnce` employait
déjà deux lignes plus haut.

Même classe de bug, corrigée en même temps : `args.context.nativeProperties` pointait sur un
`NativeProperties` local. `onBeforeBlock` est précisément le handler qu'un jeu est *censé* différer
— lire `delay`, armer un minuteur, `resolve()` au déclenchement — donc le contexte qu'on lui a passé
doit rester lisible à ce moment-là.

**La leçon pour les ports :** ce que le ramasse-miettes offre gratuitement aux trois autres langages,
le C++ doit l'écrire. Toute fermeture que le jeu peut garder au-delà de l'appel ne capture que des
choses qui lui survivent.

Le trou de couverture était partout, pas seulement en C++ : **aucun** des quatre runtimes ne testait
un `next()` différé. Les quatre le testent maintenant, avec le cas du double appel.

## Le reste

- **GDScript** — treize lignes de documentation orpheline en fin de `lsde_scene_handle.gd` : la
  docstring de `skip_notes` dont la fonction est partie dans `lsde_track.gd`, une bannière
  `AsyncTrack`, et la docstring d'une classe qui n'existe plus. Du texte décrivant du code absent.
- **C++** — `removeTrack()` était un no-op silencieux, sans un mot d'explication. C'est délibéré (une
  piste annulée est arrêtée, pas détruite, cf. plus haut), mais un lecteur l'aurait « réparé ».
  Renommé `retireTrack()` et documenté sur place.
- **`CLAUDE.md`** — parlait encore d'`AsyncTrack` et d'`endScene()`, deux noms que la centralisation
  a supprimés. La phrase historique du tableau garde `AsyncTrack` : elle raconte le passé.

## Ce que la relecture a confirmé, et laissé tel quel

- L'ordre de `advanceToNextBlock` est **identique** à celui de l'original : résoudre le port,
  séparer principal/parallèle, ouvrir les pistes, puis nettoyer, puis suivre. Rien n'a bougé.
- L'API publique des quatre handles de scène est **inchangée** par rapport à HEAD. La seule méthode
  retirée est `notify_wait_satisfied()` en GDScript : la scène n'est plus un waiter, les pistes le
  sont. Aucun jeu ne l'appelait.
- Le double appel de `notifyWaitSatisfied()` est possible en cascade — un réveil peut en réveiller
  un autre — et il est inoffensif dans les quatre : `pendingAdvance` est vidé avant l'appel. La
  garde porte.
- Le warning `ObjectDB instances leaked` de Godot est **antérieur** : il sort à l'identique sur
  l'arbre propre.
- Les trois specs partagées sont idempotentes — regénérées, aucun octet ne bouge. Le générateur
  s'exécute depuis la racine, pas depuis `tests/`.

## Compte final

| | tests |
|---|---|
| TypeScript | 408 |
| C# | 122 |
| C++ | 54 |
| GDScript | 127 |
| **total** | **711** |

Les quatre playgrounds impriment la même scène : 8 blocs visités, 27 fils, mêmes acteurs, même
émotion, même branche, mêmes marqueurs bruts.

---

# Deuxième revue complète — les fermetures qui ne finissaient pas

Relecture de tout le moteur, pas seulement des fichiers modifiés : les quatre runtimes, module par
module, en comparant les portages côte à côte. Quatre défauts, tous prouvés par un test qui échoue
avant le correctif, et tous de la même famille — **une fermeture qui promet d'aller au bout et
s'arrête en chemin**.

## 1. `fault ?? cancel()` court-circuite

La ligne se lit comme un accumulateur et n'en est pas un : `??` (comme `?:` ou `||`) **n'évalue pas
sa droite** quand la gauche est déjà remplie. Donc dès qu'un nettoyage levait, la boucle s'arrêtait,
et toutes les pistes suivantes restaient vivantes avec leur nettoyage jamais exécuté — un panneau
d'interface, une voix audio, un effet instancié, fuités pour le reste du processus.

Le commentaire au-dessus de cette boucle promettait mot pour mot le contraire : « *every track is
cancelled even if an earlier cleanup threw* ».

Trois sites en TypeScript, deux en C#. **Le C++ et le GDScript étaient corrects** — le C++ écrit
`auto f = cancel(); if (!fault) fault = f;`, et le GDScript n'a pas d'exceptions du tout. La
référence était donc la fautive, et le mauvais comportement était celui des deux runtimes que le
plus de gens lisent.

La forme retenue partout : **évaluer d'abord, garder ensuite.**

## 2. `engine.stop()` avait le même trou, un étage au-dessus

Deux scènes en cours, la première avec un nettoyage qui lève : l'exception sortait de `stop()` et la
seconde scène **restait en cours**. Le jeu croyait avoir tout arrêté ; `isRunning()` disait encore
vrai ; plus rien ne pouvait l'atteindre.

`stop()` applique désormais la règle que la scène applique déjà à ses propres pistes : tout est
fermé, la première faute remonte à la fin.

## 3. La même scène ouverte deux fois, la moitié manquante

Le problème 7 de la première revue avait corrigé la moitié *effacement* : une scène qui se termine
n'évince plus son homonyme vivante. La moitié *inscription* avait le même trou — le registre était
une table indexée par la **référence de scène**, donc le second `start()` écrasait le premier
handle, qui jouait ensuite indéfiniment sans que rien puisse le voir ni l'arrêter.

Le registre est maintenant une **liste de handles**. Un nom ne peut plus entrer en collision avec
lui-même, et le contrôle d'identité ajouté au problème 7 disparaît : il ne compensait que le choix
de clé.

## 4. C++ : détruire un handle en cours laissait un pointeur pendant

`scene()` rend un `unique_ptr`, donc un handle de portée est du C++ ordinaire :

```cpp
{ auto h = engine.scene("s1"); h->start(); }   // se gare, attend le joueur
engine.stop();                                  // ← le moteur pointe encore dessus
```

Le moteur gardait un pointeur **brut** dans son registre et `SceneHandleImpl` n'avait pas de
destructeur. `isRunning()` répondait vrai pour une scène qui n'existait plus, et `stop()` ou
`getCurrentBlocks()` lisaient de la mémoire libérée.

`~SceneHandleImpl` ferme désormais la scène si elle tourne encore : les nettoyages s'exécutent,
`onSceneExit` part, le moteur se désinscrit, et rien ne s'échappe — un destructeur ne doit pas
lever. Détruire une scène en cours équivaut donc à l'annuler.

**C'est une asymétrie assumée, pas une dérive.** Dans les trois runtimes à ramasse-miettes, lâcher
sa référence ne détruit rien : le moteur garde la sienne et la scène continue. En C++ l'objet
disparaît vraiment ; les seules options étaient la fuite ou la fermeture propre. La troisième —
faire posséder les handles par le moteur via `shared_ptr` — casserait la signature publique de
`scene()` pour les intégrations existantes.

## Parité de la résolution de ports

`CLAUDE.md` exige que `port-resolver` soit identique partout. Il ne l'était pas : sur un choix, le
TypeScript traitait un id vide comme « rien de choisi », les trois portages cherchaient un port
littéralement nommé `""`. Aucun export LSDE ne produit un tel fil, mais `selectChoice(picked?.id ??
"")` est une ligne de jeu banale.

Les trois portages suivent maintenant la référence. La règle est **épinglée dans la spec partagée**
(`choice-empty-option-id-picks-nothing`), pas dans quatre tests séparés : vérifié, ce cas échoue
sans le correctif et passe avec.

## Le petit ménage

- **Neuf `console.log`** de débogage laissés dans `review-regressions.test.ts` — restes des
  démonstrations de la première revue. Un test affirme, il n'imprime pas.
- **C# et C++** documentaient `getSceneConnections` comme « *for inter-scene navigation* » —
  exactement l'erreur que `CLAUDE.md` signale comme ayant déjà coûté un correctif inutile dans
  l'éditeur. Le TypeScript et le GDScript disaient juste.
- **C#** : un `<summary>` orphelin, doublé, sur `_resolveCharacter`.
- **TypeScript** : la docstring d'`evaluateEachCase` envoyait encore le routage vers
  `evaluateConditionCases` alors qu'il passe par `pickPortFromResults` ; l'ordre de compilation en
  tête d'`index.ts` avait perdu `track` ; `assertNever` était exporté et importé nulle part.

## Ce que j'ai regardé et laissé tel quel, volontairement

- **`evaluateConditionCases` et `evaluateEachCase` ne sont pas du code mort.** Je les ai d'abord
  soupçonnés — le moteur ne les appelle pas — puis vérifié : ils sont exposés par `LsdeUtils`, qui
  est dans le barrel public. Le doublon de règle avec `pickPortFromResults` est celui qu'on a déjà
  tranché à la première revue (les deux contrats diffèrent : l'un interroge, l'autre lit des
  résultats déjà calculés). Le rouvrir serait changer d'avis, pas corriger.
- **`getTypeHandler` est écrit deux fois**, dans `HandlerRegistry` et `SceneHandlerRegistry` : six
  lignes de `switch` sur un type fermé, dans quatre langages. Vraie duplication, mais sans le
  ressort qui a fait mal au parcours — elle ne peut pas dériver en silence, parce qu'ajouter un
  type de bloc casse la compilation aux deux endroits. Extraire une base commune coûterait une
  hiérarchie de classes dans quatre langages pour un gain nul.
- **Les quatre fabriques de contexte partagent cinq lignes** (`character`, `actors`, `emotion`,
  `intensity`, `preventGlobalHandler`). Même raisonnement.
- **Un bloc qui s'attend lui-même** dans `waitForBlocks` se gare pour toujours. Le validateur
  pourrait le nommer, comme il nomme `UNKNOWN_WAIT_BLOCK`. C'est une fonctionnalité à décider, pas
  un défaut à corriger : je ne l'ai pas ajoutée.

## Compte final

| | tests |
|---|---|
| TypeScript | 412 |
| C# | 126 |
| C++ | 58 |
| GDScript | 136 |
| **total** | **732** |

`tsc` et les trois builds sans erreur. Les quatre playgrounds impriment la même scène : 8 blocs
visités, 27 fils.

---

# Troisième revue complète — avant la production

Relecture de tout le moteur, module par module, en comparant les quatre portages côte à côte plutôt
qu'en relisant chacun séparément. C'est cette comparaison qui trouve : deux tours de suite, les
défauts étaient là où un runtime disait une chose et un autre le contraire, sans que rien ne le
signale.

## 1. Un bloc refusé arrêtait la piste sans la terminer

`onValidateNextBlock` qui répond `{ valid: false }` faisait simplement **sortir** de `processBlock`.
La piste restait marquée vivante, à jamais. Rien ne peut la relancer : il n'existe ni `goto`, ni
reprise, et `start()` refuse une scène déjà en cours.

Conséquences, identiques dans les quatre :

- **piste principale** → la scène entière restait ouverte pour toujours. Pas d'`onSceneExit`,
  `isRunning()` répondait vrai indéfiniment, le handle restait dans le registre du moteur.
- **branche parallèle** → une piste fantôme que `getActiveTracks()` comptait sans fin.

Le guide décrivait pourtant le bon comportement depuis toujours — le diagramme du flux d'exécution
dit « *onInvalidateBlock → scene stops* ». Et **tous les autres culs-de-sac du moteur terminent déjà
le flux** : une boucle de NOTE, un port sans fil, une cible absente. Le refus était le seul à ne pas
le faire.

Un refus termine désormais la piste qui entrait dans le bloc. Le second diagramme du guide, qui
montrait le jeu appelant `scene.cancel()` lui-même, n'a plus lieu d'être : c'était un contournement.

## 2. Un nettoyage rendu après la fermeture du flux ne tournait jamais

`scene.cancel()` et `engine.stop()` sont appelables **depuis un handler** — le guide le montre. Le
handler rend ensuite son nettoyage comme d'habitude, et le moteur le rangeait pour un départ qui
avait déjà eu lieu : le bloc n'était plus jamais quitté, donc le panneau ouvert restait ouvert et la
voix lancée continuait, pour le reste du processus.

Le moteur a bel et bien quitté le bloc ; le nettoyage s'exécute maintenant sur place.

## 3. Godot : toutes les gardes disparaissaient en build release

Le runtime GDScript n'avait que des `assert()` et **aucun** `push_error`. Or `assert()` est
**retiré d'un export release de Godot**. Un jeu publié n'avait donc plus une seule de ses gardes :

| garde | en release, avant |
|---|---|
| démarrer sans handler | la scène **démarrait** et parcourait tout le graphe sans rien afficher — un dialogue invisible, sans une seule erreur |
| nom de scène inconnu | un handle construit sur un graphe nul, qui plantait plus tard sur `start()` avec « Invalid call on base null » |
| moteur non initialisé | idem |
| locale inconnue | acceptée en silence, puis aucun texte trouvé |
| aucune locale définie | chaque texte lu contre une locale vide, sans rien dans le journal |

Le pire est le premier : c'est un échec **total et silencieux**, en production, sur la seule des
quatre cibles où le code de garde n'existe plus.

Tout est passé en `push_error` + retour sûr — ce que les trois autres font en levant. Effet de bord
utile : ces gardes deviennent **testables**, ce qu'un `assert` interdisait puisqu'il faisait halter
le runner. `scene()` rend maintenant `null` sur un nom inconnu au lieu d'un handle cassé.

## Parité des diagnostics

`WRONG_NAMING_CONVENTION` — le code qui dit « ton export est en snake_case, change le réglage »
plutôt que « ce n'est pas un blueprint » sur un fichier qui en est un — n'existait qu'en
TypeScript. C'est une décision consignée (problème 9), pas un oubli, donc elle reste.

Mais la raison de l'absence n'était écrite nulle part. Elle est structurelle : **TypeScript et
GDScript reçoivent la charge brute**, clés comprises, et peuvent voir un `exported_at` ; **C# et C++
valident un objet typé** que le jeu a déjà désérialisé, où les noms d'origine ont disparu. Le
fichier est refusé dans les quatre cas ; seul le message diffère.

Le GDScript le fait donc maintenant, comme le TypeScript. Le C# et le C++ portent une note à
l'endroit exact où le lecteur se poserait la question. Même chose pour `MISSING_DATA`, que le C++ ne
peut pas produire parce que `InitOptions::data` est un objet par valeur : « absent » et « vide » n'y
sont pas distinguables — le même mur que le problème du premier tour.

## Les contrats qui n'étaient prouvés que dans un langage

« Chaque test de condition n'atteint `onResolveCondition` **qu'une seule fois** » était le défaut 4
du premier tour. Il n'était épinglé qu'en TypeScript. Les trois portages faisaient la bonne chose,
mais rien ne les en empêchait de dériver. Le test existe désormais dans les quatre.

C'est le risque systémique de ce dépôt : la spec partagée couvre le **format** et le routage, jamais
le **cycle de vie** — son vocabulaire d'actions ne connaît que `next`, `selectChoice`,
`resolveCondition`, `resolveAction`, `rejectAction`, `resolveCharacterPort`. Tout ce qui touche à la
fermeture, aux fautes et à l'annulation vit dans quatre suites écrites à la main. C'est exactement
là qu'étaient les défauts des trois tours.

## Ce que j'ai vérifié et laissé tel quel

- **Un bloc qui s'attend lui-même** dans `waitForBlocks` n'est **pas** un blocage garanti : au
  second passage sur ce bloc, il est déjà visité et l'attente est satisfaite. Le validateur ne peut
  donc pas le signaler comme une erreur. Même chose pour deux blocs qui s'attendent mutuellement.
  J'avais noté ça comme « à décider » au tour précédent ; la réponse est non.
- **Les neuf natives, les noms de ports, les codes de diagnostic** : listes extraites des quatre
  runtimes et comparées. Identiques.
- **`fireSceneEnter` / `fireSceneExit`** : « le handler de scène OU le global, jamais les deux »,
  dans les quatre. C'est bien l'inverse de la règle des handlers de bloc, et c'est voulu.
- **Le graphe** : les quatre indexent `scene.id → scene.scene`, donc `scene()` répond au chemin
  comme à l'identifiant stable, partout.
- **Les signaux Godot** `scene_entered` / `scene_exited` n'existent que là. C'est l'idiome de
  l'hôte, ils doublent les handlers sans les remplacer.
- **`getNativeProperties`** lit les natives typées en C# et C++, telles quelles en TypeScript et
  GDScript. Sur une charge malformée (`"delay": "500"`) les deux familles divergent, et elles ne
  peuvent pas faire autrement : la structure est statiquement typée d'un côté. Aucun export LSDE ne
  produit ça.

## Compte final

| | tests |
|---|---|
| TypeScript | 416 |
| C# | 131 |
| C++ | 63 |
| GDScript | 165 |
| **total** | **775** |

`tsc` et les trois builds sans erreur. Les playgrounds impriment la même scène : 8 blocs visités,
27 fils.

---

# Quatrième revue — la passe exhaustive

Les trois revues précédentes ont chacune trouvé des défauts, ce qui est mauvais signe en soi. La
cause n'était pas que j'en gardais pour plus tard : c'est que je n'avais jamais fait la passe
exhaustive. Chaque tour a élargi la lentille — d'abord les fichiers que je venais de modifier, puis
le moteur en TypeScript, puis la comparaison croisée des runtimes. Celle-ci lit **tout** : les
soixante fichiers du moteur, les quatre langages ensemble, module par module, plus la documentation.

## Le patron qui revient : la correction n'était pas propagée

Presque tout ce que ce tour a trouvé a la même forme. **Une correction faite en TypeScript n'a pas
été portée** — ni aux trois autres runtimes, ni à la documentation.

- La documentation complète de `waitForBlocks`, écrite au premier tour, n'existait **qu'en
  TypeScript**. C# et C++ portaient encore « *must have been visited before this block may
  advance* », la formulation de l'ancien sens ; le GDScript n'avait rien.
- La docstring périmée de `evaluateEachCase` (« *routing still goes through
  evaluateConditionCases* ») corrigée au deuxième tour : encore présente dans les trois portages.
  Pire, le bloc de doc y était **collé sur la mauvaise fonction** — en C# cela produisait deux
  `<summary>` sur un même membre, ce qui est du XML invalide.
- « *inter-scene navigation* » sur `getSceneConnections`, l'erreur que `CLAUDE.md` signale comme
  ayant déjà coûté un correctif inutile : corrigée en C# et C++ au deuxième tour, elle était restée
  dans l'**interface TypeScript**, où j'avais corrigé l'implémentation mais pas la déclaration.

## Le vocabulaire v1 dans l'API publique

117 occurrences de « uuid » dans 29 fichiers du moteur — le mot d'une version du format qui n'existe
plus. Ce n'était pas que du commentaire :

- **`TrackInfo.startBlockUuid` et `currentBlockUuid`** — des **noms de champs publics**, dans les
  quatre runtimes, qui renvoient `DIALOG-001`.
- Les paramètres `blockUuid` de `onBlock`, `onDialogId`, `getChoice`… lus dans l'autocomplétion de
  tout intégrateur.

Renommés en `startBlockId` / `currentBlockId` / `blockId`, partout, tests et documentation compris.
Les deux mentions historiques (« *ce qui a remplacé l'uuid de v1* ») restent : elles racontent le
passé.

## La documentation ne se construisait plus

`npm run docs` **échouait** — 38 liens morts vers cinq types v1 supprimés : `BlueprintBlockBase`,
`BlueprintScene`, `BlueprintConnection`, `Dictionary`, `ActionSignature`. Le site de documentation
d'un produit vendu ne se générait pas.

Et les extraits partagés — ceux qu'un intégrateur copie — étaient pires que périmés, ils étaient
**syntaxiquement invalides** :

- `blueprint-connection-type.md` déclarait `port: string;` **et** `port?: number;` dans la même
  interface, et `std::string port;` **et** `std::optional<int> port;` dans la même structure. Deux
  membres du même nom : ça ne compile pas. Séquelle d'un remplacement de `fromPortIndex`.
- `blueprint-scene-type.md` déclarait un champ nommé `scene.start` — `scene.start?: string;` dans une
  interface TypeScript, `std::optional<std::string> scene.start;` en C++.

Les trois fichiers de types partagés ont été réécrits contre les structures réelles de v2.

## La documentation décrivait un moteur qui n'existe plus

Le guide `block-types` — français comme anglais — documentait :

- **un « mode dispatcher »** pour `portPerCase`, où « *tous les groupes qui matchent déclenchent
  leur port simultanément* ». Le dispatcher a été **supprimé** en v2 ; `portPerCase` veut dire que
  le premier cas qui tient sort par son propre port ;
- **`context.resolve(result)`** avec « *true suit le port 0, false suit le port 1* », et
  « *resolve() accepte boolean (legacy), number (switch), ou number[] (dispatcher)* ». En v2
  `resolve()` prend un **nom de port** ;
- une table des champs de block listant `uuid`, `properties: BlockProperty[]`, `userProperties`,
  `metadata: BlockMetadata` et un `scene.start: boolean?` « marque le block d'entrée » — aucun de ces
  champs n'existe ;
- `delay` et `timeout` sans dire qu'ils sont en **millisecondes**, le piège de migration que le
  reste du dépôt met en gras partout.

Ailleurs : `handlers.md` portait une ligne disant « *`onResolveCondition` — déprécié, utilisez
`onResolveCondition`* » (un remplacement automatique avait renommé le libellé de l'ancienne ligne
`setChoiceFilter` sans la retirer), et affirmait que seuls trois handlers sur quatre sont requis.
`integration.md` demandait de configurer un `choiceFilter`, **supprimé** en v2. `blueprints.md`
décrivait la table de connexions v1 et disait qu'on y accède par `onValidateNextBlock`.

Le français et l'anglais sont à jour. Le japonais et le chinois gardent leur prose d'origine — les
**identifiants et les liens y sont corrigés**, la traduction suivra.

## Le code

- **`reject(error)`** : paramètre obligatoire en TypeScript, C# et C++, optionnel en GDScript, et
  **ignoré dans les quatre**. Le README montrait `context.reject()` sans argument — ce qui ne
  compilait pas en TypeScript. Rendu optionnel partout, avec la seule phrase qui manquait : le
  moteur n'en fait rien, le routage a seulement besoin de savoir que l'appel a échoué.
- **Deux `return {};` consécutifs** dans les deux `getTypeHandler` du registre C++. Le second est
  inatteignable. Balayage fait sur les quatre runtimes : c'était le seul.

## Le trou de couverture qui comptait le plus

**`waitForBlocks` est la seule native qui porte une liste**, et son parsing n'était vérifié dans
aucun des quatre runtimes. Chaque portage a besoin de sa propre branche pour sortir un tableau du
sac `props` — une alternative de `std::variant` en C++, un `JsonElement` ou un `JArray` en C# — et
une charge dont le `waitForBlocks` revenait vide aurait rendu la propriété **silencieusement
inerte** : aucune erreur, aucun avertissement, et un bloc qui n'attend jamais.

Les branches étaient correctes. Rien ne les tenait. Les quatre runtimes le vérifient désormais
contre le même export de référence, `DIALOG-008` de `reactor_breach`, et les deux chemins JSON du
C# (System.Text.Json et Newtonsoft) ont chacun le leur.

## Ce que j'ai vérifié et laissé tel quel

- Les neuf natives, les noms de ports, les codes de diagnostic, la résolution des handlers, le
  cycle de vie des scènes, l'indexation du graphe, `setLocale` : extraits des quatre et comparés.
  Identiques.
- `getNativeProperties` lit les natives **typées** en C# et C++, telles quelles en TypeScript et
  GDScript. Sur une charge malformée (`"delay": "500"`) les deux familles divergent, et ne peuvent
  pas faire autrement : la structure est statiquement typée d'un côté.
- `tagOptionVisibility` **copie en profondeur** en C++ et GDScript, en surface en TypeScript et C#.
  C'est la sémantique valeur/référence des langages, sur une mutation qu'un jeu ne devrait pas
  faire.

## Compte final

| | tests |
|---|---|
| TypeScript | 417 |
| C# | 133 |
| C++ | 64 |
| GDScript | 168 |
| **total** | **782** |

`tsc`, les trois builds et **`npm run docs`** passent — ce dernier ne passait plus.

---

# Cinquième passe — ce qui bloquait la mise en production

Le moteur était prêt ; la **livraison** ne l'était pas. Cette passe ne regarde pas le code : elle
regarde ce qui se passe entre « les tests sont verts » et « un studio installe le paquet ». Rien de
ce qui suit n'aurait été vu par une relecture de source, et chacun aurait produit un incident le
jour de la publication.

## L'intégration continue ne pouvait pas passer

Trois des cinq travaux étaient cassés, et le tableau des tests dans les README le prouvait sans que
personne ne fasse le lien : il annonçait des comptes vieux de plusieurs revues.

- **TypeScript** — le travail lançait `npm ci`, qui **exige** un `package-lock.json`. Le fichier
  était dans `.gitignore`. Le travail qui type-vérifie l'implémentation de référence n'a donc jamais
  pu s'exécuter une seule fois. Le verrou est désormais versionné pour `lsde-ts` uniquement — c'est
  aussi lui qui fige la chaîne d'outils exacte avec laquelle une version publiée a été validée.
- **C#** — la solution est un `.slnx`, format que seul un SDK à partir de 9.0.200 sait lire. La CI
  épinglait `8.0.x` : échec avant la première ligne compilée. Le poste de travail est en 10.0.111,
  d'où l'absence de symptôme local. La CI installe maintenant les deux SDK — le 10 pour lire la
  solution, le 8 pour exécuter des assemblages de test qui ciblent `net8.0`.
- **GDScript** — image `godot-ci:4.5.1`, alors que le README, le `package.json` et `CLAUDE.md`
  exigent 4.6+ et que le runner local est un 4.6.1. Alignée sur `4.6.1`.

## Le CHANGELOG n'annonçait pas la v2

La dernière entrée était **v0.3.0**. Tout le travail de migration vivait sous « Unreleased », en
trois lignes qui parlaient de blocs NOTE. Aucune mention du changement de format, des ports nommés,
de `delay` passé en **millisecondes**, des API retirées. Pour un studio qui monte de 0.3.x à 2.0.0
sur un moteur payant, c'est **le** document de migration, et il n'existait pas.

Pire, `publish.sh` l'aurait fabriqué tout seul : il dérive l'entrée des sujets de commit depuis la
dernière étiquette. Cela donnait vingt-deux lignes, moitié français moitié anglais, dont
« *restructure project files* » et « *add Unity .meta files* ». Un sujet de commit ne dit jamais
« `delay` est en millisecondes maintenant ».

Deux choses corrigées :

- Une entrée v2.0.0 écrite à la main — rupture du format, rupture de l'API, rupture de
  comportement, puis les correctifs des cinq passes.
- `generate_changelog` **promeut** désormais la section « Unreleased » en entrée de version, et
  s'efface complètement si une entrée porte déjà le numéro publié. La génération par sujets de
  commit reste, en dernier recours, pour qu'une version ne soit jamais publiée sans notes.

## Les numéros de version ne se rejoignaient pas

`publish.sh` synchronisait `package.json`, les trois `.csproj` et `CMakeLists.txt` — pas le
**manifeste Unity**, qui est pourtant le seul numéro qu'un utilisateur Unity voit dans le Package
Manager. Il affichait `0.3.0` pendant que la DLL à l'intérieur disait 2.0.0. Ajouté à la
synchronisation.

Et le script ne savait pas produire `2.0.0` : les manifestes y étaient déjà, aucune étiquette
n'existait, et l'arithmétique de bump ne sait que monter (`patch` → 2.0.1, `major` → 3.0.0). Il
accepte maintenant un `X.Y.Z` explicite.

Le `package.json` de la racine, enfin, était un lanceur de tâches nommé, versionné `1.0.0`, sous
licence `ISC`, sans `private` — publiable par accident, sous une licence qui n'est pas la sienne.

## Le paquet npm embarquait des fichiers de test

`src/test-builders.ts` n'est importé que par des `*.test.ts` et n'est exporté par aucun barrel : il
partait quand même chez le client. Et `dist/` n'était **jamais nettoyé** avant un build — la preuve
était sur le disque, `playground-min-usage-for-doc.js`, exclu de la configuration de build et publié
malgré tout depuis on ne sait quelle version. Le paquet passe de 67 à 59 fichiers.

## Les comptes annoncés au client étaient faux

Le tableau du README racine donnait 393 / 115 / 52 / 115 pour 417 / 133 / 64 / 168. Les trois README
de portage annonçaient « 42 tests partagés » là où la spec en contient 52, répartis en 46 suites — et
celui du C++ annonçait **40/42, deux en échec**, une régression réparée depuis longtemps. Un produit
payant déclarait publiquement que son runtime C++ ne passait pas la conformité.

## Vérification

`npm ci` valide le verrou. La régénération des trois specs partagées ne bouge pas d'un octet. 417
tests TypeScript, type-check et build propres, et le site de documentation se construit.

## Ce que je laisse ouvert, volontairement

- **La prose japonaise et chinoise** des guides attend la passe de traduction. Les identifiants, les
  liens et les extraits de code y sont déjà corrigés ; seul le texte reste à traduire.
- **`blueprints/`** — l'export v1, que plus rien ne lit. Conservé comme référence historique.
- **`"samples": []`** dans le manifeste Unity, alors que `samples~/MiniRuntime` existe : l'exemple
  est livré mais n'apparaît pas dans le Package Manager. C'est un choix produit, pas un défaut.

---

# Sixième passe — les avertissements que personne ne lisait

Suite directe de la précédente, sur la même question : ce que reçoit le client. Cette fois en
regardant ce que **les compilateurs disent** sur nos propres livrables, ce qu'aucune suite de tests
ne rapporte parce que rien n'échoue.

## Le paquet C# n'avait pas d'infobulles

`GenerateDocumentationFile` est actif — le `.xml` part dans le paquet NuGet, et c'est lui qui
alimente IntelliSense dans Unity et Visual Studio. Il manquait **43 membres publics** : tous les
membres de `BlockType`, `ConditionOperator`, `ConditionJoin`, `ValueType` et `CardRole`, les champs
de `DiagnosticReport` et `DiagnosticStats`, `ValidationResult.Ok/Fail`, `PortResolutionResult`,
`NativePropertyIds`, `SceneGraph`, `BlueprintGraph`, et les trois classes `ConditionEvaluator`,
`PortResolver`, `Validator` elles-mêmes.

Le fichier disait pourtant déjà comment faire : `Ports`, juste à côté, documente chacun de ses
membres. Le reste ne l'avait pas suivi.

48 avertissements → **0**.

## L'en-tête C++ déversait 160 avertissements chez le client

Chaque `Internal*Context` est au bas d'un losange volontaire : l'implémentation vient de
`InternalBlockContext`, la déclaration pure de `IDialogContext` et consorts, les deux atteignant
`IBaseBlockContext` virtuellement. La dominance résout vers l'implémentation — c'est exactement
l'intention — mais MSVC l'annonce une fois par membre et par classe.

Ces 160 avertissements ne tombaient pas seulement chez nous : `block_context.h` est un en-tête
**public**. Chaque unité de compilation d'un studio Unreal qui l'inclut les recevait, et les aurait
attribués à notre code. Supprimés sur place, avec la raison écrite à côté.

## Unity importait les artefacts NuGet du paquet

Les deux `.csproj` déplaçaient leur sortie hors de `Runtime/` — qui **est** le paquet Unity, donc
tout ce qui y est écrit devient un asset avec son `.meta`. Sauf qu'un projet SDK-style importe
`Microsoft.Common.props` **avant** de lire son propre `PropertyGroup` : la restauration NuGet avait
déjà choisi son chemin. C'est l'avertissement MSB3539 à chaque build, et `Runtime/obj/` peuplé de
`project.assets.json.meta` en était le résultat. La règle `lsde-csharp/**/obj.meta` dans
`.gitignore` était le pansement.

Un `Directory.Build.props`, lu avant cet import, est précisément l'outil que le message d'erreur de
MSBuild recommande. `Runtime/` reste vide après un build complet.

## Deux références mortes dans la référence d'API publiée

TypeDoc les signalait à chaque génération du site :

- **`ConditionEvaluator`** n'était pas exporté. C'est le type du callback que `evaluateConditionCases`
  et `evaluateEachCase` exigent : un jeu TypeScript n'avait aucun nom pour annoter la fonction qu'il
  doit écrire. Ce n'était pas un défaut de documentation, c'était un trou dans l'API publique.
- Un `{@link pickPortFromResults}` pointait vers une fonction non publique. Reformulé vers le
  helper que le jeu peut réellement atteindre.

## Compte final

| | tests | avertissements de build |
|---|---|---|
| TypeScript | 417 | 0 (`tsc`, TypeDoc) |
| C# | 133 | 0 |
| C++ | 64 | 0 |
| GDScript | 168 | 0 |
| **total** | **782** | |

Le site de documentation se construit, `npm ci` valide le verrou, la régénération des specs
partagées ne bouge pas d'un octet.

## Ce que la question « es-tu certain ? » a encore trouvé

Le doute était fondé : je venais de changer les chemins de build C# sans vérifier l'empaquetage.

**Vérifié, et bon :** les trois paquets NuGet se construisent, et le `.xml` embarqué contient bien
les 43 membres nouvellement documentés. Le `MiniRuntime` tourne encore. Les **quatre** playgrounds
impriment la même chose — mêmes huit blocs, dans le même ordre, 8 visités, 27 fils, 2 scènes /
22 blocs / 33 fils. Aucun `assert()` nulle part en C++ : le piège qui a coûté un défaut en GDScript
n'existe pas là. Et le C++ passe **aussi en Release**, 64/64, sans un avertissement — ce qui n'avait
jamais été essayé, le générateur Visual Studio ignorant `CMAKE_BUILD_TYPE`. `build:release` et
`test:release` rendent ce chemin accessible.

**Trouvé, et corrigé :** les quatre README décrivaient une architecture morte — `scene-handle` comme
boucle de parcours plus une classe `AsyncTrack`, disparues toutes deux à la centralisation — et le
diagramme du guide, dans les quatre langues, nommait `processBlock`, l'interne supprimé avec elles.
Le README C# annonçait `src/`, `tests/`, `samples/` et `Utils.cs`, quatre chemins qui n'existent
plus depuis la mise en forme Unity. Le `Makefile` et les guides `what-is-lsde` des quatre langues
portaient encore le « 42 cas de test » que je venais de corriger dans les README.

Le patron, une fois de plus : **j'avais corrigé les trois portages et oublié l'implémentation de
référence.** La ligne `AsyncTrack` du README TypeScript a survécu à la passe où je corrigeais
exactement cette ligne dans les trois autres.

## Le guide français décrivait le comportement inverse

En comparant les quatre langues section par section — ce que je n'avais jamais fait — une page
sortait : `lifecycle.md` a neuf sections en anglais et huit dans les trois autres langues.

La section manquante n'était pas manquante : l'anglais avait été restructuré et **réécrit**, les
autres pas. Le résultat, dans « Error Boundaries » :

> « L'erreur est **silencieuse** — elle n'est pas loguée ni re-throw. »

C'est le comportement de la v1, celui que la revue a précisément renversé. Le moteur ferme
maintenant la scène puis **re-throw** à l'appelant. Un studio francophone lisant cette page
n'entourerait pas `start()` d'un `try/catch`, et prendrait l'exception en production.

Le français est réaligné, section par section, avec la bonne description. Et les deux tableaux
`NativeProperties` de `lifecycle.md` — anglais compris — ne disaient toujours pas que `delay` et
`timeout` sont en **millisecondes** ; `block-types.md` le disait, pas celui-là.

## Ce qui reste, chiffré

Trois fichiers de guide sur onze sont en retard en japonais et en chinois : `block-types.md`,
`blueprints.md` et `lifecycle.md`. Ce n'est pas seulement de la prose à rafraîchir — deux d'entre
eux affirment des choses **fausses** : le mode dispatcher supprimé y est toujours documenté, et
« Error Boundaries » y dit encore que les erreurs sont silencieuses. Ces trois-là doivent ouvrir la
passe de traduction, pas la fermer.

# Septième passe — la documentation refaite depuis le français

Jonathan a demandé de finaliser le français, puis de traduire à partir de lui. Relire la doc **ligne
par ligne contre le code** au lieu de la parcourir a sorti bien plus que les trois pages en retard.

## Les extraits partagés étaient v1

`docs/_shared/` porte le code que **les quatre langues** incluent. Quatre de ces quarante extraits
décrivaient un format qui n'existe plus, donc quatre fois dans chaque langue :

- **`blueprint-export-type.md`** — la racine du payload, dans les quatre langages. `exportDate`,
  `projectName`, `primaryLanguage`, `signatures` : pas un champ juste. Le vrai en-tête est
  `format`, `version`, `generator`, `exportedAt`, `project`, `locales`, `referenceLocale`,
  `dictionaries`, `functions`, `cards`, `scenes`.
- **`integration-action.md`** — l'exemple ACTION, celui que tout intégrateur copie. Il lisait
  `block.actions[].actionId` avec des `params` **positionnels**. Le payload porte `context.calls`,
  chaque appel citant un `fn` et ses `args` **par nom**. L'onglet C++ inventait en plus des helpers
  `GetString`/`GetBool` qui n'existent pas — `PropertyValue` est un `std::variant`, et le lecteur
  doit le traiter lui-même.
- **`getting-started-validation.md`** — `check.signatures` et `check.characters` pour `functions`
  et `cards`.
- **`choice-visibility-handler.md`** — le type `RuntimeOption`, et un onglet TypeScript qui
  déclarait `offered` puis passait `visible`, une variable jamais définie.

## La plus grande page appelait une API retirée

`choice-visibility.md`, section « filtrage manuel », dans les quatre langues :
`LsdeUtils.FilterVisibleChoices` — **supprimée en v2** — dans trois onglets sur quatre, avec un
troisième paramètre `scene` qui n'a jamais existé, `block.choices` pour `block.options`, et
`cond.key`/`cond.operator` pour `dict`/`entry`/`op`/`value`. Le vrai appel est
`tagOptionVisibility( options, evaluator )`, deux arguments, et il rend la liste entière.

Le raccourci `scene` n'existant pas, la page promettait aussi que les tests sur le dictionnaire
réservé `choice` seraient résolus tout seuls. Ils arrivent à l'évaluateur du jeu. La page dit
maintenant comment les renvoyer vers `scene.evaluateCondition()`.

## `resolve(true)` → port 0

Le guide d'intégration décrivait encore la v2 avec la sémantique v1, **dans les quatre langues** —
y compris l'anglais, que j'avais déclaré corrigé sur ce point à la quatrième revue. Je l'avais
corrigé dans `block-types.md` et nulle part ailleurs.

## Le reste

`index` et `what-is-lsde` annonçaient un payload « scenes, blocks, connections, dictionaries,
signatures ». `blueprints` titrait « Action Signatures » alors que le payload dit `functions`. Le
type d'un paramètre de function est `dictionaryKey`, pas `dictionary`.

## Résultat

Les onze pages de guide ont le **même découpage en sections dans les quatre langues** — le japonais
et le chinois ne sont plus en retard sur `block-types`, `blueprints` ni `lifecycle`. Aucune API
morte, aucun identifiant v1 dans `docs/`. Le site se construit, 417 tests TypeScript, `tsc` propre.

## « Les autres disent-elles la même chose ? »

Le compte de sections identique ne prouve rien sur le contenu. Un comparateur structurel — niveaux
de titres, extraits `_shared` inclus, blocs de code par langage, conteneurs `:::`, lignes de
tableau, diagrammes mermaid, liens internes normalisés, et **chaque identifiant entre backticks** —
a été passé sur les onze pages des quatre langues.

Trois fichiers divergeaient. Deux divergences comptaient :

- **`handlers`** — le japonais et le chinois avaient **une ligne de tableau de plus** : une entrée
  barrée disant « `onResolveCondition` est déprécié, utilisez `onResolveCondition` », pointant vers
  `#setchoicefilter`, une ancre supprimée. C'est la ligne que j'avais retirée de l'anglais et du
  français à la quatrième revue. Ces deux langues décrivaient aussi les overrides de block comme
  ciblés **par UUID** — le mot qu'un balayage précédent avait éliminé partout ailleurs.
- **`block-types`** — le **français disait plus que les trois autres** : « l'id de l'option EST le
  port par lequel le flow sort (`C1`, `C2`…) ». Un fait central du routage v2, absent de l'anglais,
  du japonais et du chinois. Ajouté aux trois.

Et une trouvaille au passage : le tableau `NativeProperties` de `lifecycle` portait encore l'ancien
sens de `waitForBlocks` en japonais et en chinois — « avant que ce block progresse » — et le
français disait « avant d'être **affiché** » là où `block-types` disait déjà « avant d'être
**dispatché** ». Le même mot partout, maintenant.

Il reste **une** divergence, cosmétique et assumée : le libellé du lien vers `ConditionTest` est
« conditions » en français, « Conditions » en anglais, « condition » en japonais et en chinois —
le mot naturel de chaque langue pour la même cible.

La navigation ne peut pas dériver : `localeNav(prefix)` et `guideSidebar(prefix)` la construisent
depuis une seule définition, avec une table de libellés par locale.


---

# `isAsync` était mort sur un fil secondaire — la file d'attente (2026-09-08)

Décidé avec Jonathan le soir du 8 septembre 2026, après trois heures de test sur la scène
`condition-dispatch`. **Rien n'est encore implémenté** : cette section est la décision et le
recensement, écrits avant le code pour que la conversation ne soit pas à refaire.

## Le défaut, dans sa forme la plus simple

Aucun Router, aucune condition. Un dialogue, deux suites :

```
DIALOG-012   ──out──►  DIALOG-013
             ──out──►  DIALOG-014
```

Aucun des trois ne porte `isAsync`. Ce qu'un narrative designer attend en dessinant ça :
DIALOG-012, puis DIALOG-013, puis DIALOG-014.

Ce que le moteur fait : DIALOG-012, puis **DIALOG-013 et DIALOG-014 en même temps**.

`Track.advanceToNextBlock` prend le **premier** fil dont la cible n'est pas `isAsync` comme
continuation, et **détache tous les autres** — cochés ou non :

```ts
if ( !mainLink && !natives( targetBlock ).isAsync ) mainLink = link;
else                                                asyncLinks.push( link );
```

Donc sur DIALOG-014, `isAsync` **ne fait rien**. Coché : piste à côté. Décoché : piste à côté.
La case est inerte, et le narrative designer la manipule en croyant décider.

C'est le même défaut que `waitForBlocks` inerte sur le flux principal, et pour la même raison :
une native que le moteur reçoit et n'honore pas. Le validator émet bien
`MULTIPLE_NON_ASYNC_FORK` — mais son message dit « marque les secondaires isAsync », c'est-à-dire
*renonce à ce que tu voulais*, au lieu de faire ce qui était demandé.

## La règle

```
isAsync coché    →  le bloc part sur une NOUVELLE piste, à côté
isAsync décoché  →  le bloc entre dans la FILE de la piste courante, joué à son tour
```

Une piste n'a plus une seule continuation : elle a une file. Arrivée au bout d'un fil, au lieu de
mourir, elle prend le suivant. File vide, elle meurt.

**Le port par défaut passe toujours en dernier.** Sur un ROUTER, les routes `K*` d'abord, `then`
ou `catch` ensuite. C'est ce que Jonathan a formulé comme `[[async…],[K2],[K3]].then`.

Ce que cette formulation évite, et c'est tout l'intérêt : le Router n'a **pas** à camper. Il ne
surveille aucune branche, ne tient aucun registre, n'attend aucune promesse. C'est la piste
courante qui garde une file — donc « une seule piste bloquante » (§ 6 de `ROUTER-PARADIGME.md`)
reste vrai, et le `Promise.all` que le § 7 a reporté reste reporté.

## L'ordre dans la file — un nombre décimal sur le fil

Décision de Jonathan. Deux fils sur un même port n'ont aujourd'hui **aucun ordre exprimable** :
un `Link` porte `port`, `to`, `toPort`, et rien d'autre. Le seul ordre existant est celui du
tableau `next`, invisible dans l'éditeur.

LSDE portera donc un nombre décimal sur le fil — `0.1`, `0.2` — affiché sur la carte, modifiable.
On joue du plus petit au plus grand. Le narrative designer voit l'ordre et le change s'il ne lui
plaît pas ; le moteur trie, sans rien inventer.

Écarté : l'index du tableau (invisible, et un déplacement de fil le change sans le dire) et une
« priorité » entière (deux fils à la même priorité ramènent la question).

## Les scénarios, tous

Ce que la règle donne, block source par block source. **F** = la file de la piste courante,
**P** = une piste ouverte à côté.

### Un fil sortant

| cible | aujourd'hui | avec la règle |
|---|---|---|
| décochée | la piste continue dessus | **inchangé** |
| cochée | la piste courante meurt, une piste s'ouvre | **inchangé** |

Le second cas est un piège en soi : `isAsync` sur un fil unique n'a aucun effet visible, sauf que
le numéro de piste change et que la piste courante se termine. À signaler au designer, pas à
corriger — c'est ce que la native dit.

### Plusieurs fils sur le port résolu

| cibles | aujourd'hui | avec la règle |
|---|---|---|
| toutes décochées | la 1re continue, **les autres détachées** | **F : toutes, dans l'ordre décimal** |
| toutes cochées | P pour chacune, la piste meurt | **inchangé** |
| mixte | la 1re décochée continue, le reste détaché | **P pour les cochées, F pour les décochées** |

Vrai pour **chaque** type de block, sans exception : le port `out` d'un DIALOG, un port d'acteur
avec `portPerCharacter`, le port `C1…` d'un CHOICE, `out`/`default` d'une CONDITION, `K*` avec
`portPerCase`, `then`/`catch` d'une ACTION. Une seule règle, à un seul endroit.

### ROUTER

| cas | avec la règle |
|---|---|
| cas vrais, cibles décochées | F : `K1`, `K2`, `K3`, **puis** `then` |
| cas vrais, cibles cochées | P : `K1` `K2` `K3` ; la piste continue par `then` tout de suite |
| mixte | P pour les cochées, F pour les décochées, `then` en dernier |
| aucun cas vrai | `catch` seul — rien dans la file |
| zéro cas déclaré | `then` seul (§ 5, le vide est vrai) |
| `then`/`catch` non branché | fin de la piste après la file — un port sans fil reste une fin |

C'est aussi ce qui aligne le moteur sur l'aperçu de LSDE, qui détache déjà tous les ports de cas
et garde `then`/`catch` comme continuation. Les deux montraient des pistes différentes sur la
même scène.

## Les pièges, et ce qu'on en fait

1. **Une route bloquante qui n'appelle jamais `next()` gèle la fin de la scène.** Le reste de la
   file et le port par défaut n'arrivent jamais. C'est la conséquence directe et voulue de la
   règle — un `timeout` oublié sur un bloc de la file coûte la fin du dialogue. Diagnostic à
   `init()` plutôt que garde-fou au runtime : le moteur ne doit pas inventer un délai.

2. **Un fil de la file qui remonte vers son block source** re-remplit la file. Il faut décider si
   la file est bornée. Rappel du précédent : une boucle de NOTE faisait un `StackOverflowException`
   qui tuait le process Unity, et la réponse a été « une boucle finit le flux, comme n'importe
   quelle fin ». Même réponse ici, probablement.

3. **`waitForBlocks` sur un block encore dans la file.** La piste qui attend ne peut pas avancer,
   et le block attendu n'est pas encore joué. `SceneHandleImpl.trackEnded` couvre déjà le cas —
   toutes les pistes parquées, aucune ne peut avancer, la scène se ferme — mais il faut un test.

4. **Un même block joué deux fois par la file.** Deux fils vers le même block, c'est deux
   contextes, deux cleanups, deux `next` distincts. Vécu ce soir sur DIALOG-009 : la démo keyait
   ses bulles sur `block.id`, le second dispatch écrasait le premier, et la piste dont le `next`
   avait disparu attendait un clic qui ne pouvait plus venir. **C'est un piège pour le jeu**, pas
   pour le moteur — mais la doc doit le dire, parce que la file va le rendre courant.

5. **`handle.cancel()` pendant que la file est pleine.** La file se vide avec la piste, sans jouer
   ce qui restait.

6. **L'ordre des cleanups.** Aujourd'hui le cleanup d'un block tourne quand la piste le quitte.
   Avec une file, quitter le dernier block d'un fil ne termine plus la piste : elle enchaîne. Le
   cleanup doit tourner au même moment qu'avant — en quittant le block — pas à la fin de la file.

## Ce qu'il reste à faire

1. **TS** : la file dans `Track`, `advanceToNextBlock` qui répartit P et F, `endFlow` qui pioche
   avant de mourir. Plus les tests exhaustifs des tableaux ci-dessus.
2. **Le tri décimal** — quand LSDE exportera le champ. En attendant, l'ordre du tableau `next`.
3. **Retirer `MULTIPLE_NON_ASYNC_FORK`** : deux cibles décochées ne sont plus une faute.
4. **Ajouter le diagnostic du piège 1** : une file dont un block n'a ni `timeout`, ni `waitInput`,
   ni sortie.
5. **La spec partagée**, puis C#, C++, GDScript.
6. **La doc** : `async-tracks.md` et `block-types.md` décrivent l'ancienne règle.

# `waitForBlocks` attend des blocks **terminés**, plus des blocks atteints (2026-09-09)

## Le défaut

Scène `advance-full-demo`, réexportée par Jonathan. `DIALOG-009` s'embranche vers `ACTION-003` et
`DIALOG-010`, tous deux `isAsync`, puis continue vers `DIALOG-011` qui porte
`waitForBlocks: ["ACTION-003", "DIALOG-010"]`.

En jeu, `DIALOG-011` s'affichait **avant** que `DIALOG-010` ait fini. l2 coupait la parole à l3, qui
était encore derrière son `timeout` de 2500 ms.

La cause : le moteur marquait un block « visité » **au dispatch**, avant même d'appeler le handler,
et `waitForBlocks` lisait cet ensemble. Or l'ordre dans `advanceToNextBlock` est : ouvrir les pistes
détachées, *puis* traiter la continuation. Donc `ACTION-003` et `DIALOG-010` étaient visités une
fraction de milliseconde avant que `DIALOG-011` ne s'enregistre — et l'attente se levait dans le
tick même où elle était posée.

**La propriété était donc quasi inerte dans la forme que les designers dessinent réellement.** Un
embranchement suivi d'une jonction sur ses deux branches ne joignait rien. Elle ne fonctionnait par
accident que lorsque le block attendu était sur une autre piste *et* que les `delay` décalaient
l'affichage — ce qui était le cas ici, ce qui a masqué le problème d'autant plus longtemps.

## La décision

Jonathan, sans ambiguïté : « le propriété attendre pour les blocs on parle de blocs qui sont
terminés et non pas de blocs qui sont commencé ». C'est aussi la seule lecture qui rend la propriété
utile — attendre qu'un block soit *atteint* n'apporte rien qu'un fil ne dise déjà.

**Un block est terminé quand la piste l'a quitté** : le jeu a appelé `next()`, le port de sortie est
résolu, et le **nettoyage du block a tourné**. Ce dernier point n'est pas un détail : marquer le
block terminé avant son cleanup laisserait la bulle de l3 à l'écran pendant que l2 parle, c'est-à-dire
exactement le symptôme qu'on corrige.

### Deux ensembles, pas un renommage

| ensemble | rempli quand | lu par |
|---|---|---|
| `visited` | le block est **dispatché** | `getVisitedBlocks()` — l'API publique |
| `completed` | la piste **quitte** le block | `waitForBlocks` |

`getVisitedBlocks()` garde son sens : « ce que le joueur a vu », ce qui inclut un block encore en
train de parler. Réutiliser cet ensemble pour la jonction aurait cassé une API publique pour régler
un problème interne.

### Où c'est marqué

Un seul endroit, `advanceToNextBlock`, et dans cet ordre :

```
resolvePort            → trier les fils
spawn( détachés )      → ouvrir les pistes parallèles
runBlockCleanup()      → la bulle quitte l'écran
addCompleted( block )  → libère ce qui attendait
garde running/scene    → un handler libéré a pu annuler la scène
processBlock( suite )  → ou endBranch()
```

Le `runBlockCleanup()` a été **remonté** hors de la branche `if (continuation)` : les deux chemins
en avaient besoin avant `addCompleted`. `endBranch()` l'appelle encore et ne trouve rien —
`previousCleanup` est déjà nul — ce qui rend ce double appel inoffensif.

La garde après `addCompleted` reprend le principe déjà écrit pour les spawns : libérer une piste
garée rentre immédiatement dans la traversée, et un handler y est autorisé à annuler la scène.

## Ce qui ne change pas

- Le block est toujours retenu **avant** d'être dispatché. Aucun handler n'est appelé, le jeu
  n'apprend jamais que le block existe tant que l'attente n'est pas levée.
- Même règle sur **toutes** les pistes, flux principal compris.
- **Tous** les ids doivent être satisfaits, pas un seul.
- Le moteur n'invente aucun délai de garde. Une jonction insatisfiable gare la piste pour de bon,
  et c'est le dessin qui le dit.

## Le nouveau piège

Un block qui attend une entrée du joueur **pour toujours** ne se termine jamais. Sous l'ancienne
règle une jonction sur un tel block se levait quand même ; maintenant elle gare la piste. C'est
correct — c'est ce que la jonction demande — mais ça transforme un défaut silencieux en blocage
visible. `UNKNOWN_WAIT_BLOCK` ne peut pas aider : il vérifie que l'id existe dans la scène, pas
qu'il sera jamais joué.

## Preuve

Les 451 tests existants passaient **sans modification** après le changement : leurs handlers
appellent `next()` immédiatement, donc dispatch et terminaison tombent dans le même tick et aucun
d'eux ne pouvait voir la différence. C'est précisément pourquoi la règle avait survécu si longtemps.

Il a fallu écrire des tests qui **tiennent un block ouvert** — le handler garde `next()` de côté au
lieu de l'appeler. Dans la spec partagée, c'est un pas **sans `action`** qui produit le même effet.

| | tests | mutation (retour à `isVisited`) |
|---|---|---|
| TypeScript | 458/458, `tsc` propre | 4 des 7 nouveaux tests meurent |
| spec partagée | 29 suites / 36 cas | 2 cas meurent |
| C# | 114 + 13 + 13 | les 2 cas de spec échouent |
| C++ | 64/64, zéro avertissement | `CrossLanguage.PlaysEverySceneInTestCases` échoue |
| GDScript | 175/175 | `visited` attendu `[001, 002]`, obtenu `[001, 002, 003, 004]` |

La sortie GDScript est la plus parlante : sous l'ancienne règle, la jonction jouait **et** continuait
au-delà, par-dessus le block qu'elle devait attendre.

## Documentation mise à jour

`types.ts`, `types.h`, `Types.cs`, `lsde_types.gd`, `lsde_validator.gd`, `CLAUDE.md`, et les guides
VitePress `async-tracks`, `block-types`, `lifecycle` dans les quatre locales — en/fr/ja/zh. Les
sections `async-tracks` portent un encadré d'avertissement nommant le changement de règle, parce
qu'un projet écrit contre les premières 2.x verra son timing changer.

# `timeout` compte depuis la FIN de la réplique, pas depuis son arrivée (2026-09-09)

## Le défaut

La doc disait, dans les quatre runtimes et les quatre locales : « MILLISECONDES. Passé tel quel —
le engine n'impose rien. » C'est vrai et c'est inutilisable : ça ne dit pas *à partir de quand* on
compte, et la lecture naturelle — depuis l'arrivée du block — est la mauvaise.

Le jeu de démonstration l'avait implémentée dans ce sens. Résultat sur `DIALOG-010`, `timeout`
2500 ms sur une réplique de ~120 caractères : le minuteur partait au dispatch, donc la bulle se
fermait **au milieu de la phrase**, et le `waitForBlocks` de `DIALOG-011` était libéré aussi tôt.
Les exemples `_shared/` du guide faisaient pire : `props.timeout * 1000`, un reste de la v1 où la
propriété était en secondes.

## La décision de Jonathan

> « La philosophie d'un timeout, c'est quelque chose qui dit : après que le texte est terminé,
> continue ou ferme après x ms. C'est un peu comme un auto-advance, mais pour les blocs. »

> « le 2500ms timeout doit commencer après la fin du texte ! pas au moment où le bloc affiche mais
> après que le message est terminé. C'est le timer avec la fin du block et qu'on considère comme le
> block terminé, on devrait donc voir le message rester 2500 ms avant de se fermer, ce qui va
> trigger la suite ! »

Trois règles, et elles tiennent ensemble :

1. **Le compte à rebours s'arme à la FIN de la révélation.** Ce que l'auteur règle est le temps que
   la réplique RESTE à l'écran une fois dite.
2. **`timeout` prime sur `waitInput` et sur le départ immédiat.** Les trois disent QUAND on quitte
   le block ; celui écrit sur la carte est la réponse la plus précise. Un clic ne peut donc
   qu'**accélérer** la révélation — et c'est cette accélération qui arme le minuteur.
3. **Quitter le block est ce qui le marque terminé**, donc un `timeout` est aussi ce qui libère un
   `waitForBlocks` qui le nomme. C'est le lien direct avec la section précédente de ce journal.

Le cas du block CHOICE est le seul laissé de côté : il n'a pas de réplique à révéler, donc le
compte part quand les options sont lisibles. Ce n'était pas dans la décision, c'est la lecture
conservatrice.

En le documentant, un second défaut est sorti, et il touchait **tous** les exemples de choix :
sur expiration ils appelaient `next()` **sans** `selectChoice()`. Or `resolveChoicePort` rend
`NONE` sans sélection — l'id d'une option EST le port de sortie — donc la branche mourait en
silence. Corrigé partout : un `timeout` sur un CHOICE doit encore choisir, et la première option
offerte est la réponse usuelle.

## Ce que le moteur fait de tout ça

**Rien, et c'est voulu.** `timeout` reste une donnée : pas de minuteur, pas de boucle de jeu, le
moteur ne le lit nulle part. C'est le jeu qui arme le compte. Mais « inerte » ne veut pas dire
« libre » : un auteur qui remplit un champ attend un comportement, et la doc est le seul endroit
où ce contrat pouvait vivre. C'est pour ça que la correction est presque entièrement documentaire.

## Où

- **Types des quatre runtimes** : `types.ts`, `types.h`, `Types.cs`, `lsde_types.gd`. Le paragraphe
  d'introduction gagne un « inert is not the same as free », et `waitInput` dit maintenant qu'il
  est dominé. Au passage, `types.h`, `Types.cs` et `lsde_types.gd` disaient encore que
  `waitForBlocks` attend des blocks « seen » / « visited » — corrigé en FINISHED.
- **Guides VitePress, quatre locales** : la ligne de tableau de `timeout` dans `block-types` et
  `lifecycle`, plus un encadré `::: tip` complet sous l'avertissement des millisecondes.
- **Exemples partagés `_shared/`** (inclus dans les quatre locales, donc corrigés une seule fois) :
  `block-dialog` réécrit en TS/C#/C++/GDScript avec `timeout` testé EN PREMIER ;
  `integration-dialog`, `integration-complete` et `integration-choice` perdent le `* 1000` et
  arment après la révélation ; `block-choice` gagne la note sur le cas du choix. Deux défauts
  préexistants trouvés en passant et corrigés : un `const text = ...getLocalizedText(text)` qui
  n'aurait jamais compilé, et un `choices.show(visible, …)` où la variable s'appelle `offered`.
- **`CLAUDE.md`**, section « Async tracks — where NativeProperties stop being inert ».

## Le jeu de démonstration

`LSDEDE-DEMO-TS` applique les trois règles : la bulle expose `onRevealComplete`, le handler arme le
minuteur dessus, et le clic global n'accélère plus que le texte — une bulle à `timeout` ne peut
plus être congédiée. Les trois autres démos (`condition-dispatch`, `multi-tracks`, `simple-action`)
comptent encore depuis l'arrivée du block ; à faire.
