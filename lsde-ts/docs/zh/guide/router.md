# Router block

> **即将推出。** 契约已确定，但尚未在 engine 中实现。本页描述它将会做什么，暂未加入站点菜单。

Router **启动所有条件已满足的路由**，等待其中会阻塞的那些，然后告诉你这些条件是否全部满足。

它是**前置条件派发器** block：「把已经就位的全部启动，然后告诉我是否全部就位。」

## 不要与 condition 混淆

两者都读取条件，但做的不是同一件事。

|  | CONDITION | ROUTER |
|---|---|---|
| 提出的问题 | 「**哪一个**为真？」 | 「**哪些**为真？」 |
| 求值的 case | 一旦得到答案就停止 | **全部**，直到最后一个 |
| 走出的出口 | **只有一个** | **每个为真的 case 一个**，外加一个延续出口 |

condition **分流**。Router **派发**。

## 端口

| 端口 | 数量 | 何时走这个出口 |
|---|---|---|
| `K1`、`K2`、… | 每个声明的 case 一个 | 该 case 为真 |
| `then` | 始终 1 个 | **所有** case 都为真 |
| `catch` | 始终 1 个 | **至少有一个** case 为假 |

- **`then` 与 `catch` 互斥。** 两者必走其一，绝不会两个都走，也绝不会都不走。
- **两者从 block 创建时就存在**，早于第一个 case。
- **`catch` 不表示「错误」**，它表示「某个条件未被满足」。

## 示例

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

有钥匙和金币，但没跟守卫说过话 → K1 与 K3 发车，三个 case 中有两个 → 从 **`catch`** 走出。

三个都满足 → 三条路由发车，从 `then` 走出。

::: warning 从 `catch` 走出不会取消任何东西
铃响了，金币被取走了，**并且**玩家被告知还缺点什么。
:::

## 执行

```
[[every isAsync route], [route 1], [route 2], …]  然后  then | catch
```

1. 按声明顺序求值**每一个** case，绝不提前停止。
2. 一次性启动**所有** `isAsync` 路由。
3. 其余的**一条一条**执行，每条都跑到尽头。
4. 若所有 case 都为真则走 `then`，否则走 `catch`。

建议：为 `K*` 端口的所有目标都加上 `isAsync`。engine 并不强制要求。

### 非 async 端口的示例

在场的每位队伍成员都会作出反应。我们希望他们**一个接一个**地说话，而不是三个气泡同时出现 ——
所以这些路由不带 `isAsync`。

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

三个 case 都为真时：

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

- **K2 会被播放到尽头** —— 不只是它的第一个 block，而是**接在它后面的整条链**。K3 要等它结束
  之后才开始。
- **`then`** 等待 K2 和 K3。此时 K1 可能仍在运行。

若给 K2 和 K3 加上 `isAsync`：Aria 和 Bram 会同时说话，`then` 也立刻发车。

## case 的形态

与 CONDITION block 相同。

- 一个扁平列表：`dictionary.entry` · 运算符 · 值。
- 运算符用名字 —— `equals`、`notEquals`、`lessThan`、`lessOrEqual`、`greaterThan`、
  `greaterOrEqual`。上面的图为了易读使用了 `>` 和 `==`。
- 第一行之后的每一行都带着自己的连接词：`and` 或 `or`。
- 不导出任何求值优先级。参考 engine 从左到右求值。
- **不含任何比较的 case 恒为真。**

## 游戏侧

```ts
engine.onResolveCondition((test) => {
  // test = { dict: "items", entry: "gold_key", op: "greaterThan", value: 0 }
  return myGameState.answer(test);
});
```

哪些端口发车、走 `then` 还是 `catch`，都由 engine 决定。没有需要你手工分流的东西。

观察用 handler（`onRouter`）尚未确定。它将是可选的。

## 陷阱

- **被选中的端口可能没有连到任何地方** —— 这条轨道就在此结束，和任何终端 block 一样。这不是错误。
- **零个 case → `then`。**
- **ACTION block 上的 `catch` 表示「调用失败了」** —— 是另一回事。
- **「第一个成立的胜出」不是 Router**，那是带 `portPerCase` 的 CONDITION。

## 它不做的事

- **等待它的 `isAsync` 路由** —— TypeScript `Promise.all` 的思路。已推迟。
- **`finally` 这个概念。** 已排除。

## 参见

[Block Types](./block-types) · [Async Tracks](./async-tracks) · [Handlers](./handlers)
