# Block 类型

block 是对话场景的构建单元 — 编辑器图中的每个节点都是一个 block。engine 将流程从一个 block 路由到下一个，并为每种类型调用对应的 handler。

共有 5 种类型：**Dialog**、**Choice**、**Condition**、**Action** 和 **Note**。前四种是内容 block，各有专用的 handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）— 四个都是**必需的**，在调用 `start()` 时验证。Note block 会被自动跳过。

handler 分为两个层级：**global handler**（注册在 engine 上）覆盖所有 scene，对大多数游戏来说足够。**scene handler**（注册在 [`SceneHandle`](/api-ref/interfaces/SceneHandle) 上）可以为特定 scene 补充或覆盖 global handler。详见 [Handlers](/zh/guide/handlers)。

## DIALOG

dialog block 代表一句台词 — 角色对话、旁白、屏幕文字。engine 通过 `onResolveCharacter` callback 解析说话的角色，并以 `context.character` 暴露给 handler。典型的 dialog handler 在游戏中创建一个文本实例（文本框、气泡、字幕…），等待玩家或动画完成，然后调用 `next()` 推进 engine。可选的 cleanup 函数可以在 engine 进入下一个 block 时清理副作用。

<!--@include: ../../_shared/block-dialog.md-->

当叙事设计师为每个角色分配了专用输出（[`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)）时，handler 必须调用 `resolveCharacterPort()` 来告诉 engine 在 `next()` 时走哪条路径。

## CHOICE

choice block 是玩家做出选择的分支点 — 对话菜单、选项列表。`context.options` 包含所有可用选项。当配置了 [`onResolveCondition()`](/zh/guide/choice-visibility) 时，每个选项被标记为 `visible: true | false` — handler 过滤并显示想要的选项。玩家交互后，`selectChoice(optionId)` 告诉 engine 走哪条路径 — **option 的 id 就是** flow 离开时所用的 port（`C1`、`C2`…）— 然后 `next()` 推进 flow。

<!--@include: ../../_shared/block-choice.md-->

参见 [Choice 可见性](/zh/guide/choice-visibility) 了解完整的可选标记系统。

## CONDITION

condition block 是一个不可见的道岔 — 它查阅游戏状态，在玩家看不见的情况下把 flow 送出去。

**engine 自己不比较任何东西。** 它不读 dictionary，不知道 `credits` 里装着什么，也没有实现
`greaterOrEqual`。它只是把每个测试交给 [`onResolveCondition()`](/zh/guide/choice-visibility) 并把答案
组装起来。无论哪种模式，每个测试都**只被问一次**。

只要注册了 resolver，engine 在调用 handler 之前就已经知道出口 port：`onCondition` 变为**可选**，
沦为记录日志或强制覆盖的钩子。handler 收到 `context.cases`，每个 case 都带着自己的 `port` 和已经
求好的 `result`。要覆盖路由，`context.resolve(port)` 接受一个**端口名** — `"out"`、`"default"`，
或某个 case 的端口（`"K1"`）。

模式只有**两种，仅此两种**：

- **没有 `portPerCase`** — 所有 case 都必须成立。成立则 flow 从 `out` 出，否则从 `default` 出。
- **`portPerCase: true`** — **第一个**成立的 case 从**它自己的 port**（`K1`、`K2`…）出。
  若无一成立，则 `default`。

没有 `when` 的 case 永远为真，在 `portPerCase` 模式下会让它下面的 case 无法到达。这是 writer 画出的
图，不是需要报告的错误。一个 case 都没有的 block 从 `out` 出：什么都没被问，所以什么都没失败。

`default` 意思是「没有任何 case 成立」— **不是**「选中的出口没有接线」。没有接线的 port 会结束
flow，而那是一种正当的结束。

dictionary 为保留字 **`choice`** 的测试查询玩家已经给出的答案：
`{ dict: "choice", entry: "CHOICE-001", value: "C1" }`。engine 会从 scene 的历史中**自行**回答，
这个问题永远不会到达游戏。另见 `scene.getChoice(blockId)` 和 `scene.evaluateCondition(test)`。

<!--@include: ../../_shared/block-condition.md-->

## ACTION

action block 在游戏中触发副作用 — 给予物品、播放音效、设置标志。`context.calls` 携带这些调用：
每一个都引用一个已声明 [function](/zh/guide/blueprints#function) 的 `fn`，其 `args` **按名称**传入，
从不按位置。handler 执行它们，然后调用 `context.resolve()` 走 `then` port，或 `context.reject()` 走
`catch` port — 而如果 designer 没有接任何 `catch`，flow 会从 `then` 继续，而不是把玩家丢在原地。

<!--@include: ../../_shared/block-action.md-->

## NOTE

note block 是叙事设计师的便签 — 注释、提醒、上下文。在遍历过程中自动跳过。虽然技术上可以通过 [`onBeforeBlock`](/zh/guide/lifecycle) 拦截 note block，但不推荐这样做 — action block 应该能覆盖所有副作用需求。

## 通用属性

所有 block 共享以下基础字段（[`BlueprintBlockBase`](/api-ref/type-aliases/BlueprintBlock)）：

| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | `string` | **相对于所在 scene** 的标识 — `DIALOG-002`。id 会在不同 scene 之间重复。 |
| `key` | `string` | 本地化文件所持有的完整 i18n key |
| `type` | `BlockType` | `dialog`、`choice`、`condition`、`action` 或 `note` |
| `label` | `string?` | writer 填写时的可读名称 |
| `parentLabels` | `string[]?` | 编辑器中的父文件夹层级 |
| `note` | `string?` | writer 的备注 |
| `actors` | `string[]?` | block 引用的 **card id**，按文件顺序 |
| `emotion` | `string?` | 情绪的 card id — 它属于 **block**，而不是每个 actor |
| `intensity` | `number?` | 该情绪的强度 |
| `text` | `TextByLocale?` | inline 导出模式下按 locale 的文本 |
| `props` | `PropertyBag?` | **同一个袋子**：native 与 writer 自己的属性，以裸 id 共存 |
| `options` | `Option[]?` | 仅 CHOICE |
| `cases` | `ConditionCase[]?` | 仅 CONDITION |
| `calls` | `ActionCall[]?` | 仅 ACTION |
| `next` | `Link[]?` | **block 的出线。** v2 中没有 connection 表 |

入口 block 并不标记在 block 上：指名它的是 **scene**，写在 `scene.start` 里。因此一个 scene 不可能
声明两个入口。

### NativeProperties

**engine** 从 `props` 中读取的九个属性。id 不会冲突 — LSDE 会拒绝与 native 同名的项目属性 — 所以
区分它们只是一次查找。

| 字段 | 类型 | 描述 |
|------|------|------|
| `isAsync` | `boolean?` | 在这个 block 上**开启一条并行轨道**，而不是继续当前轨道 |
| `waitForBlocks` | `string[]?` | **本 scene 的** block id。在它们全部**完成**之前，block 会**在被分发之前**被扣住 — 不会调用任何 handler |
| `delay` | `number?` | block 播放前的**毫秒数**。由 `onBeforeBlock` 应用，engine 从不应用 |
| `timeout` | `number?` | 台词说完之后 block **留在屏幕上的毫秒数**，随后自己离开 — block 的自动推进。**优先于 `waitInput`**。原样传递，engine 不做任何强制 |
| `waitInput` | `boolean?` | 等待玩家输入。原样传递，从不解释 — **`timeout` 优先于它** |
| `debug` | `boolean?` | 编辑器调试标志。原样传递 |
| `portPerCharacter` | `boolean?` | block 从以 actor 的 **card id 命名的 port** 出去，而不是 `out` |
| `skipIfMissingActor` | `boolean?` | 原样传递 — 由游戏决定 |
| `portPerCase` | `boolean?` | CONDITION：每个 case 从**自己的 port**（`K1`…）出去，而不是共用 `out` |

::: warning 在 v2 中 `delay` 和 `timeout` 的单位是**毫秒**
它们在 v1 中是秒，而**运行时没有任何东西会提示这个变化**：迁移过来的项目会把 3 秒的停顿变成 3 毫秒。
:::

::: tip `timeout` 是 block 的自动推进 —— 从台词**说完**那一刻开始计时
倒计时从台词**已经说完**时开始，而不是 block 到达时。作者设定的是它在最后一个字打完（或最后一个音节念完）之后**留在**屏幕上的时间，然后 block 自己离开。

从到达开始计时是那种读起来自然、跑起来错误的做法：一句 120 字的台词配 2500 ms，会在句子中间被截断。

它**优先于 `waitInput`**，也优先于立即离开。三者都在说 block 何时被离开，而作者写在卡片上的那个是最具体的答案。所以点击只能**加快显示**，永远不能把 block 打发走 —— 去催一句正在演自己时间的台词没有意义，加快它才有；而这次加快正是启动倒计时的动作。

又因为离开一个 block 正是把它标记为**已完成**，所以 `timeout` 也是释放指名它的 [`waitForBlocks`](/zh/guide/async-tracks) 的那一步。
:::

这九个之中，只有**两个**会改变遍历：`isAsync` 和 `waitForBlocks`。其余七个原样交给游戏，由游戏决定
拿它们做什么。
