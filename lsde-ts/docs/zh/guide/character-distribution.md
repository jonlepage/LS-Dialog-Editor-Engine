# 分配角色

> **`inPortPerCharacter` 即将推出。** 契约已确定，但 engine 尚未读取这个属性。本页其余部分描述的是
> 当前的行为。

一个 block 携带一个 actor **列表** —— `actors`。engine **不会从中选出任何一个**。

这是有意为之：LSDE 拒绝规定列表的顺序是「谁在说话」还是「谁在场」。由游戏来决定，而决定的方式是
一个回调。

## 原则

```ts
context.actors      // 放在 block 上的演员表 —— 始终是完整列表
context.character   // 说话的那一个，或 undefined
```

**在游戏安装 `onResolveCharacter` 之前**，`context.character` 一直是 `undefined`。engine 不做
猜测。

## 三件工具

| 设计师想表达的 | 工具 | 在哪里决定 |
|---|---|---|
| 「在场多人，**只有一人说话**」 | `onResolveCharacter` | 游戏代码里 |
| 「**后续因说话者而异**」 | `portPerCharacter` | 每个 actor 一个**输出**端口 |
| 「**这个入口**指定它的 actor」 | `inPortPerCharacter` | 每个 actor 一个**入口**端口 |

`portPerCharacter` 与 `inPortPerCharacter` 是对称的：一个命名出口，另一个命名入口。两者的端口名
都是**卡片 id**，绝不是下标。

## `inPortPerCharacter` —— 由连线指定 actor

当一个 block 携带多个 actor，并且可以从多条路径到达时，仅凭 block 自身无法判断所走的这条路径代表
哪个 actor。入口端口把它说出来。

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

`DIALOG-009` 携带三只兔子和一句台词。`CONDITION-004` 每个为真的 case 都**从自己那只兔子的门**
启动这个 block。

### 逐步过程

```
1. CONDITION-004：case K1 为真                     →  连线出发
2. 它到达 DIALOG-009 的入口端口  l1
3. engine 向游戏询问「把 l1 给我」                  →  onResolveCharacter([ l1 ])
4a. 游戏返回卡片 l1      →  DIALOG-009 被分配给 l1
4b. 游戏返回 undefined   →  什么也不发生：这个角色不存在
```

**engine 从不独自决定。** 它询问，游戏回答 —— 和其他地方是同一个回调。唯一的区别是：它只询问
**一个** actor，而不是把整个列表交出去，因此游戏不会认错兔子。

### context 里有什么

在从 `l1` 进入的那一遍里：

```ts
context.actors      →  [ l1, l2, l3 ]   block 的演员表，不变
context.character   →  l1               若游戏没有它则为 undefined
```

`actors` 不随入口而变：它就是放在 block 上的那个列表。变的只有 `character`。

### 从 `in` 进入

即使 block 有 actor 端口，`in` 端口依然保留。从那里进入表示**没有指定 actor**：此时
`onResolveCharacter` 会像在其他地方一样收到完整列表。

不指定 actor 端口的连线携带 `toPort: "in"` —— 不使用这个属性的项目里每一条连线都是如此，所以已经
写好的东西都不会改变。

## 推荐的约定

**多条连线指向同一个 block，会让这个 block 以相同内容启动多次。**

如果每条连线要说**不同**的东西：

| 差异在哪 | 怎么做 |
|---|---|
| 只是角色不同 | `inPortPerCharacter` —— 每个 actor 一个入口端口 |
| 台词也不同 | **每条连线一个 block** |

应当避免的：多条连线指向一个**没有**入口端口的多 actor block。这个 block 会被播放多次，却无法
知道是哪条连线带来的，而且没有任何东西会报告这件事。

## 参见

[Handlers](./handlers) · [Block Types](./block-types) · [Router block](./router)
