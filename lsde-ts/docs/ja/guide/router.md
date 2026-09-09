# Router block

Router は**条件が満たされたすべてのルートを起動し**、ブロッキングするものを待ち、それらが
すべて満たされていたかどうかを伝えます。

**前提条件のディスパッチャー** block です：「揃っているものはすべて起動し、すべて揃っていたか
を教えてくれ」。

## condition block と混同しないこと

どちらも条件を読みますが、担う仕事が違います。

|  | CONDITION | ROUTER |
|---|---|---|
| 問い | 「**どれ**が真か？」 | 「**どれとどれ**が真か？」 |
| 評価する case | 答えが出た時点で止まる | 最後まで**すべて** |
| 通る出口 | **1 つだけ** | **真の case ごとに 1 つ**、加えて継続用の 1 つ |

condition は**振り分ける**。Router は**ディスパッチする**。

## port

| port | 個数 | 通るとき |
|---|---|---|
| `K1`, `K2`, … | 宣言した case ごとに 1 つ | その case が真 |
| `then` | 常に 1 つ | **すべて**の case が真だった |
| `catch` | 常に 1 つ | **少なくとも 1 つ**の case が偽だった |

- **`then` と `catch` は排他。** どちらか一方が必ず通り、両方も、どちらも通らないこともありません。
- **どちらも block 作成時から存在します** — 最初の case より前から。
- **`catch` は「エラー」を意味しません**。「条件が満たされていなかった」という意味です。

## 例

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

鍵と金貨はあるが門番と話していない → K1 と K3 が発進し、3 つのうち 2 つ → **`catch`** から出ます。

3 つとも揃っていれば → 3 本のルートが発進し、`then` から出ます。

::: warning `catch` から出ても何も取り消されません
鐘は鳴り、金貨は取られ、**そのうえで**プレイヤーは「何かが足りない」と告げられます。
:::

## 実行

```
[[every isAsync route], [route 1], [route 2], …]  →  then | catch
```

1. **すべて**の case を宣言順に評価する。途中で止めない。
2. `isAsync` のルートを**すべて**一度に起動する。
3. それ以外を**1 本ずつ**、それぞれ最後まで実行する。
4. すべての case が真なら `then`、そうでなければ `catch` へ進む。

推奨：`K*` port のターゲットにはすべて `isAsync` を付けること。engine は強制しません。

### 非 async port の例

その場にいるパーティメンバーが反応します。3 つの吹き出しを同時に出すのではなく、**順番に**
話させたい — だからこれらのルートに `isAsync` は付けません。

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

3 つの case がすべて真の場合：

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

- **K2 は最後まで再生されます** — 最初の block だけでなく、**その後ろに繋がれた連鎖すべて**。
  K3 が始まるのはそのあとです。
- **`then`** は K2 と K3 を待ちます。K1 はまだ走っていて構いません。

K2 と K3 に `isAsync` を付けると：Aria と Bram が同時に話し、`then` はすぐに発進します。

## case の形

CONDITION block と同じ形です。

- フラットなリスト：`dictionary.entry` · 演算子 · 値。
- 演算子は名前で — `equals`、`notEquals`、`lessThan`、`lessOrEqual`、`greaterThan`、
  `greaterOrEqual`。上の図は読みやすさのために `>` と `==` を使っています。
- 2 行目以降は自分の接続子を持ちます：`and` または `or`。
- 評価の優先順位は export されません。リファレンス engine は左から右へ評価します。
- **比較を 1 つも持たない case は常に真**です。

## ゲーム側

```ts
engine.onResolveCondition((test) => {
  // test = { dict: "items", entry: "gold_key", op: "greaterThan", value: 0 }
  return myGameState.answer(test);
});
```

どの port が発進するか、`then` か `catch` かは engine が決めます。手で振り分けるものはありません。

**`onRouter` handler は存在せず**、必要でもありません：handler が発言できる時点では、真の case は
すべて自身の port を起動済みで、継続先も決まっています — 答えるべきものは残っていません。`start()`
はこれを要求しません。Router を観測するには — 何が成立したかをログする、デバッグ表示を動かす —
`handle.onBlock(id)` を使います：その context は評価済みの `cases` を**すべて**持ち、`resolve` は
ありません。

<!--@include: ../../_shared/block-router.md-->

## 落とし穴

- **選ばれた port が何にも繋がれていないことがあります** — そこでそのトラックは終わります。
  終端 block と同じで、エラーではありません。
- **case がゼロなら → `then`。**
- **ACTION block の `catch` は「呼び出しが失敗した」という意味** — 別物です。
- **「最初に成立したものが勝つ」は Router ではありません。** それは `portPerCase` を付けた
  CONDITION です。

## しないこと

- **`isAsync` のルートを待つこと** — TypeScript の `Promise.all` の思想。見送りました。
- **`finally` という概念。** 却下しました。

## 関連

[Block Types](./block-types) · [Async Tracks](./async-tracks) · [Handlers](./handlers)
