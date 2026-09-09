# Le bloc Router

Un Router **lance toutes les routes dont la condition est remplie**, attend celles qui bloquent,
puis dit si toutes les conditions l'étaient.

C'est le bloc **dépêcheur de préconditions** : « lance tout ce qui est réuni, et dis-moi si tout
l'était. »

## Ne pas le confondre avec une condition

Les deux lisent des conditions, mais ne font pas le même métier.

|  | CONDITION | ROUTER |
|---|---|---|
| La question | « **laquelle** est vraie ? » | « **lesquelles** sont vraies ? » |
| Cas évalués | s'arrête dès qu'il a sa réponse | **tous**, jusqu'au dernier |
| Sorties prises | **une seule** | **une par cas vrai**, plus une continuation |

Une condition **aiguille**. Un Router **dépêche**.

## Les ports

| Port | Combien | Pris quand |
|---|---|---|
| `K1`, `K2`, … | un par cas déclaré | ce cas-là est vrai |
| `then` | toujours 1 | **tous** les cas étaient vrais |
| `catch` | toujours 1 | **au moins un** cas était faux |

- **`then` et `catch` s'excluent.** Un des deux est pris, jamais les deux, jamais aucun.
- **Les deux existent dès la création du bloc**, avant le premier cas.
- **`catch` ne veut pas dire « erreur »**, mais « une condition n'était pas remplie ».

## Exemple

```
                    ┌─────────────────────────────┐
   ── le flux ─────►│  ROUTER  « la porte »       │
                    ├─────────────────────────────┤
                    │ K1  items.cle_or > 0        ├──► ACTION  un tintement       (isAsync)
                    │ K2  quete.garde == 2        ├──► DIALOG  le garde hoche     (isAsync)
                    │ K3  bourse.or >= 50         ├──► ACTION  retirer 50 or      (isAsync)
                    ├─────────────────────────────┤
                    │ then                        ├──► DIALOG  « la porte s'ouvre »
                    │ catch                       ├──► DIALOG  « il te manque quelque chose »
                    └─────────────────────────────┘
```

La clé et l'or, mais pas le garde → K1 et K3 partent, 2 cas sur 3 → sortie par **`catch`**.

Les trois → trois routes partent, sortie par `then`.

::: warning Sortir par `catch` n'annule rien
Le tintement sonne, l'or est retiré, **et** le joueur s'entend dire qu'il lui manque quelque chose.
:::

## Exécution

```
[[toutes les routes isAsync], [route 1], [route 2], …]  puis  then | catch
```

1. Évaluer **tous** les cas, dans l'ordre, sans s'arrêter.
2. Lancer d'un coup **toutes** les routes `isAsync`.
3. Exécuter les autres **une par une**, chacune jusqu'au bout.
4. Continuer par `then` si tous les cas étaient vrais, sinon `catch`.

Recommandé : `isAsync` sur toutes les cibles des ports `K*`. Le moteur ne l'impose pas.

### Exemple avec des ports non-async

Chaque membre du groupe présent réagit. On veut qu'ils parlent **chacun à son tour**, pas trois
bulles en même temps : leurs routes ne portent donc pas `isAsync`.

```
                    ┌─────────────────────────────┐
   ── le flux ─────►│  ROUTER  « les réactions »  │
                    ├─────────────────────────────┤
                    │ K1  quete.porte == 3        ├──► ACTION  fermer la porte    (isAsync)
                    │ K2  groupe.aria == true     ├──► DIALOG  Aria : « enfin ! »
                    │ K3  groupe.bram == true     ├──► DIALOG  Bram : « j'y crois pas »
                    ├─────────────────────────────┤
                    │ then                        ├──► DIALOG  « la troupe est prête »
                    └─────────────────────────────┘
```

Les trois cas sont vrais :

```
temps ──────────────────────────────────────────────►

K1  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓            détachée — vit sa vie
K2  ▓▓▓▓▓▓▓                   Aria parle
K3         ▓▓▓▓▓▓▓            puis Bram
then              ▓▓▓▓▓▓
```

```
[[K1],[K2],[K3]].then
```

- **K2 est jouée jusqu'au bout** — pas seulement son premier bloc, **toute la suite câblée
  derrière**. K3 ne commence qu'après.
- **`then`** attend K2 et K3. K1 peut encore tourner.

Avec `isAsync` sur K2 et K3 : Aria et Bram parlent en même temps, `then` part tout de suite.

## Les cas

Même forme que le bloc CONDITION.

- Liste plate : `dictionnaire.entrée` · opérateur · valeur.
- Opérateurs nommés — `equals`, `notEquals`, `lessThan`, `lessOrEqual`, `greaterThan`,
  `greaterOrEqual`. Les schémas ci-dessus utilisent `>` et `==` pour la lisibilité.
- Chaque ligne après la première porte son lien : `and` ou `or`.
- Aucune priorité d'évaluation exportée. Le moteur de référence évalue de gauche à droite.
- Un cas **sans comparaison est toujours vrai**.

## Côté jeu

```ts
engine.onResolveCondition((test) => {
  // test = { dict: "items", entry: "cle_or", op: "greaterThan", value: 0 }
  return monEtatDeJeu.repondA(test);
});
```

Le moteur décide quels ports partent et choisit `then` ou `catch`. Rien à router à la main.

Il n'y a **pas de handler `onRouter`**, et il n'en faut pas : au moment où un handler pourrait
parler, chaque cas vrai a déjà lancé son port et la continuation est déjà choisie — il ne reste
rien à répondre. `start()` n'en exige aucun. Pour observer un routeur — journaliser ce qui a tenu,
alimenter une vue de debug — passez par `handle.onBlock(id)` : son contexte porte les `cases`
pré-évalués, TOUS, et aucun `resolve`.

<!--@include: ../../_shared/block-router.md-->

## Pièges

- **Le port choisi peut n'être branché sur rien** — la piste s'arrête là, comme tout bloc terminal.
  Pas une erreur.
- **Zéro cas → `then`.**
- **`catch` sur un bloc ACTION veut dire « l'appel a échoué »** — autre chose.
- **« Le premier qui tient gagne » n'est pas un Router**, c'est une CONDITION avec `portPerCase`.

## Ce qu'il ne fait pas

- **Attendre ses routes `isAsync`** — la philosophie du `Promise.all` de TypeScript. Reporté.
- **Le concept de `finally`.** Écarté.

## Voir aussi

[Types de blocks](./block-types) · [Async Tracks](./async-tracks) · [Handlers](./handlers)
