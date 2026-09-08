# 登場人物の割り当て

> **`inPortPerCharacter` は予告です。** 契約は確定済みですが、engine はまだこのプロパティを読み
> ません。このページの残りは現在の動作を説明します。

block は actor の**リスト**を持ちます — `actors`。engine は**そのどれも選びません**。

これは意図的です：リストの順序が「誰が話すか」なのか「誰がその場にいるか」なのか、LSDE は
言うことを拒みます。決めるのはゲームであり、その手段はコールバックです。

## 原則

```ts
context.actors      // block に置かれたキャスト — 常にリスト全体
context.character   // 話す者、または undefined
```

`context.character` は、**ゲームが `onResolveCharacter` を登録するまで** `undefined` です。
engine は推測しません。

## 三つの道具

| デザイナーの意図 | 道具 | どこで決まるか |
|---|---|---|
| 「複数いるが**話すのは一人**」 | `onResolveCharacter` | ゲームのコード内 |
| 「**話者によって続きが変わる**」 | `portPerCharacter` | actor ごとの**出力** port |
| 「**この入口**が actor を指名する」 | `inPortPerCharacter` | actor ごとの**入力** port |

`portPerCharacter` と `inPortPerCharacter` は対称です：一方は出口に、もう一方は入口に名前を
付けます。どちらも port 名は**カード id** であり、決してインデックスではありません。

## `inPortPerCharacter` — 線が actor を指名する

block が複数の actor を持ち、複数の経路から到達できる場合、その block だけでは、通ってきた経路が
どの actor を表すのか分かりません。入力 port がそれを告げます。

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

`DIALOG-009` は三匹のウサギと一つの台詞を持ちます。`CONDITION-004` の真になった各 case が、
**それぞれのウサギの扉から** block を起動します。

### 手順

```
1. CONDITION-004：case K1 が真                     →  線が発つ
2. DIALOG-009 の入力 port  l1  に到達する
3. engine がゲームに尋ねる「l1 をくれ」            →  onResolveCharacter([ l1 ])
4a. ゲームがカード l1 を返す    →  DIALOG-009 は l1 に割り当てられる
4b. ゲームが undefined を返す   →  何も起きない：その人物は存在しない
```

**engine が単独で決めることは一度もありません。** 尋ね、ゲームが答える — 他のあらゆる場所と
同じコールバックです。違いは一つだけ：リスト全体を渡すのではなく、**一人**の actor を尋ねる
ので、ゲームがウサギを取り違えることがありません。

### context が保持するもの

`l1` から入った pass では：

```ts
context.actors      →  [ l1, l2, l3 ]   block のキャスト、変わらない
context.character   →  l1               ゲームが持っていなければ undefined
```

`actors` は扉によって変わりません：block に置かれたリストそのものです。変わるのは `character`
だけです。

### `in` から入る

actor port を持つ block でも、`in` port は残ります。そこから入ることは**actor を指名しない**
という意味で、`onResolveCharacter` は他と同様にリスト全体を受け取ります。

actor port を指名しない線は `toPort: "in"` を持ちます — このプロパティを使わないプロジェクトの
すべての線がそれであり、すでに書かれたものは何も変わりません。

## 推奨される慣習

**一つの block へ複数の線を引くと、その block は同じ内容で複数回起動されます。**

線ごとに**異なる**ことを言わせたい場合：

| 何が異なるか | どうするか |
|---|---|
| 人物だけ | `inPortPerCharacter` — actor ごとの入力 port |
| 台詞も | **線ごとに block を一つ** |

避けるべきこと：入力 port を**持たない**複数 actor の block へ複数の線を引くこと。block はどの
線から来たのか分からないまま複数回再生され、それを報告するものもありません。

## 関連

[Handlers](./handlers) · [Block Types](./block-types) · [Router block](./router)
