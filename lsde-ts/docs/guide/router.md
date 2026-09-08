# The Router Block

> **Coming.** The contract is settled; the block is not implemented in the engine yet. This page
> describes what it will do, and is not in the site menu yet.

A Router **launches every route whose condition is met**, waits for the ones that block, then says
whether all of them were.

It is the **precondition dispatcher** block: "launch everything that is in place, and tell me
whether everything was."

## Do not confuse it with a condition

Both read conditions, but they are not in the same line of work.

|  | CONDITION | ROUTER |
|---|---|---|
| The question | "**which one** is true?" | "**which ones** are true?" |
| Cases evaluated | stops as soon as it has its answer | **all** of them, to the last |
| Exits taken | **one only** | **one per true case**, plus a continuation |

A condition **switches**. A Router **dispatches**.

## The ports

| Port | How many | Taken when |
|---|---|---|
| `K1`, `K2`, … | one per declared case | that case is true |
| `then` | always 1 | **all** the cases were true |
| `catch` | always 1 | **at least one** case was false |

- **`then` and `catch` are exclusive.** One of the two is taken, never both, never neither.
- **Both exist from the moment the block is created**, before the first case.
- **`catch` does not mean "error"**, it means "a condition was not met".

## Example

```
                    ┌─────────────────────────────┐
   ── the flow ────►│  ROUTER  "the door"         │
                    ├─────────────────────────────┤
                    │ K1  items.gold_key > 0      ├──► ACTION  a chime            (isAsync)
                    │ K2  quest.guard == 2        ├──► DIALOG  the guard nods     (isAsync)
                    │ K3  purse.gold >= 50        ├──► ACTION  take 50 gold       (isAsync)
                    ├─────────────────────────────┤
                    │ then                        ├──► DIALOG  "the door opens"
                    │ catch                       ├──► DIALOG  "something is missing"
                    └─────────────────────────────┘
```

The key and the gold, but not the guard → K1 and K3 leave, 2 cases out of 3 → exit through
**`catch`**.

All three → three routes leave, exit through `then`.

::: warning Leaving through `catch` cancels nothing
The chime rings, the gold is taken, **and** the player is told something is missing.
:::

## Execution

```
[[every isAsync route], [route 1], [route 2], …]  then  then | catch
```

1. Evaluate **every** case, in order, never stopping early.
2. Launch **all** the `isAsync` routes at once.
3. Run the others **one at a time**, each to its end.
4. Continue through `then` if every case was true, otherwise `catch`.

Recommended: `isAsync` on every target of your `K*` ports. The engine does not require it.

### Example with non-async ports

Every party member present reacts. They should speak **one after another**, not three bubbles at
once — so their routes carry no `isAsync`.

```
                    ┌─────────────────────────────┐
   ── the flow ────►│  ROUTER  "the reactions"    │
                    ├─────────────────────────────┤
                    │ K1  quest.door == 3         ├──► ACTION  shut the door      (isAsync)
                    │ K2  party.aria == true      ├──► DIALOG  Aria: "at last!"
                    │ K3  party.bram == true      ├──► DIALOG  Bram: "no way"
                    ├─────────────────────────────┤
                    │ then                        ├──► DIALOG  "the party is ready"
                    └─────────────────────────────┘
```

All three cases are true:

```
time ───────────────────────────────────────────────►

K1  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓            detached — lives its own life
K2  ▓▓▓▓▓▓▓                   Aria speaks
K3         ▓▓▓▓▓▓▓            then Bram
then              ▓▓▓▓▓▓
```

```
[[K1],[K2],[K3]].then
```

- **K2 is played to its end** — not just its first block, **the whole chain wired behind it**. K3
  only starts afterwards.
- **`then`** waits for K2 and K3. K1 may still be running.

With `isAsync` on K2 and K3: Aria and Bram speak at the same time, and `then` leaves immediately.

## The cases

Same shape as the CONDITION block.

- A flat list: `dictionary.entry` · operator · value.
- Named operators — `equals`, `notEquals`, `lessThan`, `lessOrEqual`, `greaterThan`,
  `greaterOrEqual`. The diagrams above use `>` and `==` for readability.
- Every line after the first carries its own link: `and` or `or`.
- No evaluation precedence is exported. The reference engine evaluates left to right.
- A case **with no comparison is always true**.

## On the game side

```ts
engine.onResolveCondition((test) => {
  // test = { dict: "items", entry: "gold_key", op: "greaterThan", value: 0 }
  return myGameState.answer(test);
});
```

The engine decides which ports leave and picks `then` or `catch`. Nothing to route by hand.

The observation handler (`onRouter`) is not settled yet. It will be optional.

## Pitfalls

- **The chosen port may be wired to nothing** — the track ends there, like any terminal block. Not
  an error.
- **Zero cases → `then`.**
- **`catch` on an ACTION block means "the call failed"** — a different thing.
- **"First one that holds wins" is not a Router**, it is a CONDITION with `portPerCase`.

## What it does not do

- **Wait for its `isAsync` routes** — the philosophy of TypeScript's `Promise.all`. Deferred.
- **The `finally` concept.** Ruled out.

## See also

[Block Types](./block-types) · [Async Tracks](./async-tracks) · [Handlers](./handlers)
