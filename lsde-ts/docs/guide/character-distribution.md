# Distributing characters

> **`inPortPerCharacter` is coming.** The contract is settled; the property is not read by the
> engine yet. The rest of this page describes today's behaviour.

A block carries a **list** of actors — `actors`. The engine **elects none of them**.

That is deliberate: LSDE refuses to say whether the order of the list means "who speaks" or "who is
present". The game decides, and it does so through a callback.

## The principle

```ts
context.actors      // the cast posted on the block — always the whole list
context.character   // the one who speaks, or undefined
```

`context.character` is `undefined` **until the game installs `onResolveCharacter`**. The engine does
not guess.

## The three tools

| what the designer means | the tool | where it happens |
|---|---|---|
| "several present, **one speaks**" | `onResolveCharacter` | in the game's code |
| "what follows **differs by speaker**" | `portPerCharacter` | one **exit** port per actor |
| "**this entry** names its actor" | `inPortPerCharacter` | one **entry** port per actor |

`portPerCharacter` and `inPortPerCharacter` are symmetric: one names the exits, the other the
entries. Both name their ports by the **card id**, never by an index.

## `inPortPerCharacter` — the wire names the actor

When a block carries several actors and can be reached by several paths, the block alone cannot tell
which actor the path it was reached by stands for. The entry port says it.

```
┌──────────────────────────────┐        ┌───────────────────────────┐
│ ROUTER   CONDITION-004       │        │ DIALOG-009   "Me too"     │
├──────────────────────────────┤        │ inPortPerCharacter: true  │
│ K1  party.l1 ≠ true          ├───────►│ ◂ l1                      │
│ K2  party.l2 ≠ true          ├───────►│ ◂ l2                      │
│ K3  party.l3 ≠ true          ├───────►│ ◂ l3                      │
├──────────────────────────────┤        │ ◂ in    (nobody named)    │
│ then                         ├──►     └───────────────────────────┘
└──────────────────────────────┘  DIALOG-010
```

`DIALOG-009` carries all three rabbits and one single line. Each true case of `CONDITION-004`
launches the block **through its own rabbit's door**.

### Step by step

```
1. CONDITION-004: case K1 is true                  →  the wire leaves
2. it arrives on entry port  l1  of DIALOG-009
3. the engine asks the game "give me l1"            →  onResolveCharacter([ l1 ])
4a. the game returns card l1     →  DIALOG-009 is assigned to l1
4b. the game returns undefined   →  nothing happens: that character does not exist
```

**The engine never decides on its own.** It asks, the game answers — the same callback as
everywhere else. The one difference: it asks for **one** actor instead of handing over the whole
list, so the game cannot pick the wrong rabbit.

### What the context holds

On the pass entered through `l1`:

```ts
context.actors      →  [ l1, l2, l3 ]   the block's cast, unchanged
context.character   →  l1               or undefined if the game does not have it
```

`actors` does not change with the door: it is the list posted on the block. Only `character` does.

### Entering through `in`

The `in` port stays available on a block that has actor ports. Entering through it means **no actor
named**: `onResolveCharacter` then receives the whole list, as everywhere else.

A wire that names no actor port carries `toPort: "in"` — which is every wire of a project that does
not use this property, so nothing already written changes.

## The recommended convention

**Several wires into one block launch that block several times, identically.**

If each wire must say something **different**:

| what differs | what to do |
|---|---|
| only the character | `inPortPerCharacter` — one entry port per actor |
| the text as well | **one block per wire** |

What to avoid: several wires into a multi-actor block **without** entry ports. The block is played
several times with no way to tell which wire brought it, and nothing reports it.

## See also

[Handlers](./handlers) · [Block Types](./block-types) · [The Router Block](./router)
