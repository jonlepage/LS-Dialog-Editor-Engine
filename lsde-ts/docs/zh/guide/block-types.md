# Block 类型

block 是对话场景的构建单元 — 编辑器图中的每个节点都是一个 block。engine 将流程从一个 block 路由到下一个，并为每种类型调用对应的 handler。

共有 5 种类型：**Dialog**、**Choice**、**Condition**、**Action** 和 **Note**。前四种是内容 block，各有专用的 handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）— 四个都是**必需的**，在调用 `start()` 时验证。Note block 会被自动跳过。

handler 分为两个层级：**global handler**（注册在 engine 上）覆盖所有 scene，对大多数游戏来说足够。**scene handler**（注册在 [`SceneHandle`](/api-ref/interfaces/SceneHandle) 上）可以为特定 scene 补充或覆盖 global handler。详见 [Handlers](/zh/guide/handlers)。

## DIALOG

dialog block 代表一句台词 — 角色对话、旁白、屏幕文字。engine 通过 `onResolveCharacter` callback 解析说话的角色，并以 `context.character` 暴露给 handler。典型的 dialog handler 在游戏中创建一个文本实例（文本框、气泡、字幕…），等待玩家或动画完成，然后调用 `next()` 推进 engine。可选的 cleanup 函数可以在 engine 进入下一个 block 时清理副作用。

<!--@include: ../../_shared/block-dialog.md-->

当叙事设计师为每个角色分配了专用输出（[`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter)）时，handler 必须调用 `resolveCharacterPort()` 来告诉 engine 在 `next()` 时走哪条路径。

## CHOICE

choice block 是玩家做出选择的分支点 — 对话菜单、选项列表。`context.choices` 包含所有可用选项。当配置了 [`onResolveCondition()`](/zh/guide/choice-visibility) 时，每个选项被标记为 `visible: true | false` — handler 过滤并显示想要的选项。玩家交互后，`selectChoice(uuid)` 告诉 engine 走哪条路径，然后 `next()` 推进 flow。

<!--@include: ../../_shared/block-choice.md-->

参见 [Choice 可见性](/zh/guide/choice-visibility) 了解完整的可选标记系统。

## CONDITION

condition block 是一个不可见的开关 — 它评估游戏状态，在玩家看不到的情况下将 flow 送入两条路径之一。handler 评估 block 中的条件（变量、标志、背包…）然后调用 `context.resolve(result)` — `true` 走 port 0，`false` 走 port 1。以 `choice:` 开头的 key 的条件引用了玩家之前的选择 — `scene.evaluateCondition(cond)` 通过内部历史自动解析。

<!--@include: ../../_shared/block-condition.md-->

## ACTION

action block 在游戏中触发副作用 — 给予物品、播放音效、设置标志。每个 action 引用一个 `actionId`，由开发者映射到自己的系统。handler 执行 action 列表后调用 `context.resolve()` 走 "then" port，或调用 `context.reject(error)` 走 "catch" port（如果没有 "catch" 连接则回退到 "then"）。

<!--@include: ../../_shared/block-action.md-->

## NOTE

note block 是叙事设计师的便签 — 注释、提醒、上下文。在遍历过程中自动跳过。虽然技术上可以通过 [`onBeforeBlock`](/zh/guide/lifecycle) 拦截 note block，但不推荐这样做 — action block 应该能覆盖所有副作用需求。

## 通用属性

所有 block 共享以下基础字段（[`BlueprintBlockBase`](/api-ref/interfaces/BlueprintBlockBase)）：

| 字段 | 类型 | 描述 |
|------|------|------|
| [`uuid`](/api-ref/interfaces/BlueprintBlockBase#uuid) | `string` | 唯一标识符 |
| [`type`](/api-ref/interfaces/BlueprintBlockBase#type) | `BlockType` | 判别类型 |
| [`label`](/api-ref/interfaces/BlueprintBlockBase#label) | `string?` | 人类可读的名称 |
| [`parentLabels`](/api-ref/interfaces/BlueprintBlockBase#parentlabels) | `string[]?` | 编辑器中的父文件夹层级 |
| [`properties`](/api-ref/interfaces/BlueprintBlockBase#properties) | `BlockProperty[]` | 键值属性 |
| [`userProperties`](/api-ref/interfaces/BlueprintBlockBase#userproperties) | `Record?` | 自由格式的用户属性 |
| [`nativeProperties`](/api-ref/interfaces/BlueprintBlockBase#nativeproperties) | `NativeProperties?` | 执行属性 |
| [`metadata`](/api-ref/interfaces/BlueprintBlockBase#metadata) | `BlockMetadata?` | 显示元数据（角色、标签、颜色） |
| [`isStartBlock`](/api-ref/interfaces/BlueprintBlockBase#isstartblock) | `boolean?` | 标记入口 block |

### NativeProperties

| 字段 | 类型 | 描述 |
|------|------|------|
| [`isAsync`](/api-ref/interfaces/NativeProperties#isasync) | `boolean?` | 在并行异步轨道上执行 |
| [`delay`](/api-ref/interfaces/NativeProperties#delay) | `number?` | 执行前的延迟（由 `onBeforeBlock` 消费） |
| [`timeout`](/api-ref/interfaces/NativeProperties#timeout) | `number?` | 执行超时时间 |
| [`portPerCharacter`](/api-ref/interfaces/NativeProperties#portpercharacter) | `boolean?` | metadata 中每个角色对应一个输出 port |
| [`skipIfMissingActor`](/api-ref/interfaces/NativeProperties#skipifmissingactor) | `boolean?` | 如果引用的 actor 不存在则跳过 block |
| [`debug`](/api-ref/interfaces/NativeProperties#debug) | `boolean?` | 编辑器调试标志 |
| [`waitForBlocks`](/api-ref/interfaces/NativeProperties#waitforblocks) | `string[]?` | 此 block 可以继续之前必须已访问的 block UUID |
| [`waitInput`](/api-ref/interfaces/NativeProperties#waitinput) | `boolean?` | 用于显式玩家输入控制的被动标志 |
