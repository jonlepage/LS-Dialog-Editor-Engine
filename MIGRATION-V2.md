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

## 18. Le texte peut vivre hors du blueprint

**À faire pendant la migration. Le moteur n'a aucune notion de table externe aujourd'hui.**

`Block.text` et `Option.text` sont documentés **« when texts are exported »**. Le client peut couper
l'option : les blocs partent alors sans une ligne de dialogue, et les textes ne vivent plus que dans
`localization/<locale>/__blueprints__.json`.

### La forme de la table

```json
{ "reactor_breach": {
    "DIALOG-001": "Pas de son. Évidemment qu'il n'y a pas de son.",
    "CHOICE-001": { "C1": "Qu'est-ce que tu as vu au pont trois ?", "C2": "..." } } }
```

Indexée `scène → bloc`, et `scène → bloc → option` pour un choix. Chaque bloc porte déjà le chemin
complet dans son champ `key` (`__blueprints__.reactor_breach.DIALOG-001`).

### Ce que ça change pour le moteur

La v1 n'avait **rien** de tel : le texte était toujours dans le blueprint, et
[getLocalizedText](lsde-ts/src/playground.ts#L57) le lisait sur le bloc. Il faut :

1. Une entrée pour fournir une table par langue — c'est le développeur qui charge le fichier, le
   moteur ne fait pas d'IO.
2. La résolution en deux temps : le `text` du bloc d'abord, la table ensuite.
3. **Ne pas planter** quand aucun des deux ne répond. Un bloc sans texte reste un bloc valide qu'on
   traverse — c'est au développeur d'afficher ce qu'il veut.

### Ce qui reste hors sujet

`localization/<locale>/main.json` et `ui.json` sont les dictionnaires du **jeu**. Un texte qui cite
`{{#ui.hud.airlock_label}}` les vise — le moteur passe la chaîne brute, il n'ouvre pas ces fichiers.
Voir *Ce que le moteur ne fait jamais*.

---

# L'ordre de traitement

| # | Problème | Dépend de |
|---|---|---|
| 1 | Charger et valider | — |
| 8 | Brancher les types générés | — |
| 2 | Le routage | 1 |
| 3 | Les conditions | 1 |
| 4 | Retirer le dispatcher | 3 |
| 5 | La distribution | 1 |
| 6 | Le sac `props` | 1 |
| 7 | Le `sceneId` | 1 |
| 12 | Les specs partagées | 2, 3 |
| — | **Porter C#, C++, GDScript** | tout ce qui précède |
| 13 | La documentation | tout |
| 9, 10 | Convention de nommage, multi-fichiers | 1 |
| 11 | Faire remonter les erreurs | — |
| 16 | L'émotion sur le bloc | 1 |
| 18 | Le texte hors du blueprint | 1 |
| 15 | Reconstruire `getSceneConnections` | 1 |
| 17 | — *refermé, rien à faire* | — |
| 14 | Monter le CI | **tout** — c'est la dernière étape |

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
- **Publication en 1.0.0.** Le format porte `version: 1` ; « moteur 1.x lit format 1 » est lisible
  pour un client. Une 0.4.0 qui casse tout serait un mensonge poli.

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

- **`text` peut être absent** — devenu le **problème 18**.
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

| Runtime | Tests | Vérifié comment |
|---|---|---|
| TypeScript | 306 | `vitest` + `tsc --noEmit` |
| C# | 107 | `dotnet test`, 3 projets |
| C++ | 95 | MSVC + gtest |
| GDScript | 91 | Godot 4.3 headless |

Le README annonçait 216 / 42 / **40-sur-42** / 42. Les quatre étaient faux.

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
- **Problème 18 ouvert** : le texte peut vivre hors du blueprint. C'est le seul vrai manque du
  moteur trouvé par cette passe.
