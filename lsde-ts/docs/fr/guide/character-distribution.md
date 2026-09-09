# Distribuer les personnages

Un bloc porte une **liste** d'acteurs — `actors`. Le moteur **n'en élit aucun**.

C'est délibéré : LSDE refuse de dire si l'ordre de la liste veut dire « qui parle » ou « qui est
présent ». C'est le jeu qui tranche, et il le fait par un branchement.

## Le principe

```ts
context.actors      // le casting posé sur le bloc — toujours la liste complète
context.character   // celui qui parle, ou undefined
```

`context.character` vaut `undefined` **tant que le jeu n'a pas installé `onResolveCharacter`**. Le
moteur ne devine pas.

## Les trois outils

| ce que le designer veut dire | l'outil | où ça se joue |
|---|---|---|
| « plusieurs présents, **un seul parle** » | `onResolveCharacter` | dans le code du jeu |
| « la suite **diffère selon qui parle** » | `portPerCharacter` | un port de **sortie** par acteur |
| « **cette entrée-là** désigne son acteur » | `inPortPerCharacter` | un port d'**entrée** par acteur |

`portPerCharacter` et `inPortPerCharacter` sont symétriques : l'un nomme les sorties, l'autre les
entrées. Les deux nomment leurs ports par **l'id de la fiche**, jamais par un index.

## `inPortPerCharacter` — l'acteur est désigné par le fil

Quand un bloc porte plusieurs acteurs et qu'on peut y arriver par plusieurs chemins, le bloc seul
ne sait pas quel acteur représente le chemin emprunté. Le port d'entrée le dit.

```
┌──────────────────────────────┐        ┌───────────────────────────┐
│ ROUTER   CONDITION-004       │        │ DIALOG-009   « Oui moi »  │
├──────────────────────────────┤        │ inPortPerCharacter: true  │
│ K1  party.l1 ≠ true          ├───────►│ ◂ l1                      │
│ K2  party.l2 ≠ true          ├───────►│ ◂ l2                      │
│ K3  party.l3 ≠ true          ├───────►│ ◂ l3                      │
├──────────────────────────────┤        │ ◂ in    (aucun désigné)   │
│ then                         ├──►     └───────────────────────────┘
└──────────────────────────────┘  DIALOG-010
```

`DIALOG-009` porte les trois lapins et une seule réplique. Chaque cas vrai de `CONDITION-004`
lance le bloc **par la porte de son lapin**.

### Le déroulé, étape par étape

```
1. CONDITION-004 : le cas K1 est vrai              →  le fil part
2. il arrive sur le port d'entrée  l1  de DIALOG-009
3. le moteur demande au jeu « donne-moi l1 »       →  onResolveCharacter([ l1 ])
4a. le jeu rend la fiche l1     →  DIALOG-009 est assigné à l1
4b. le jeu rend undefined       →  rien ne se passe : le personnage n'existe pas
```

**Le moteur ne décide jamais seul.** Il demande, le jeu répond — c'est le même branchement que
partout ailleurs. La seule différence : il demande **un** acteur au lieu de lui présenter toute la
liste, donc le jeu ne peut pas se tromper de lapin.

### Ce que le contexte contient

Sur la passe entrée par `l1` :

```ts
context.actors      →  [ l1, l2, l3 ]   le casting du bloc, inchangé
context.character   →  l1               ou undefined si le jeu ne l'a pas
```

`actors` ne change pas selon la porte : c'est la liste posée sur le bloc. Seul `character` change.

### Entrer par `in`

Le port `in` reste disponible sur un bloc qui a des ports d'acteur. Y entrer veut dire **aucun
acteur désigné** : `onResolveCharacter` reçoit alors la liste complète, comme partout ailleurs.

Un fil qui ne cite pas de port d'acteur porte `toPort: "in"` — c'est le cas de tous les fils d'un
projet qui n'utilise pas cette propriété, et rien de ce qui existe ne change.

## La convention recommandée

**Plusieurs fils vers un même bloc le lancent plusieurs fois, à l'identique.**

Si chaque fil doit dire quelque chose de **différent** :

| ce qui diffère | quoi faire |
|---|---|
| seulement le personnage | `inPortPerCharacter` — un port d'entrée par acteur |
| le texte aussi | **un bloc par fil** |

Ce qu'il faut éviter : plusieurs fils vers un bloc à plusieurs acteurs **sans** ports d'entrée. Le
bloc est joué plusieurs fois sans savoir par quel fil, et rien ne le signale.

## Voir aussi

[Handlers](./handlers) · [Types de blocks](./block-types) · [Le bloc Router](./router)
