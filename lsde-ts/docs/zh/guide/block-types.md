# Block 类型

block 是对话场景的构建单元 — 编辑器图中的每个节点都是一个 block。engine 将流程从一个 block 路由到下一个，并为每种类型调用对应的 handler。

共有 5 种类型：**Dialog**、**Choice**、**Condition**、**Action** 和 **Note**。前四种是内容 block，各有专用的 handler（`onDialog`、`onChoice`、`onCondition`、`onAction`）— 四个都是**必需的**，在调用 `start()` 时验证。Note block 会被自动跳过。

handler 分为两个层级：**global handler**（注册在 engine 上）覆盖所有 scene，对大多数游戏来说足够。**scene handler**（注册在 [`SceneHandle`](/zh/api-ref/classes/SceneHandle) 上）可以为特定 scene 补充或覆盖 global handler。详见 [Handlers](/zh/guide/handlers)。

## DIALOG

显示角色所说的文本。角色由 `onResolveCharacter` callback 解析。

<!--@include: ../../_shared/block-dialog.md-->

`resolveCharacterPort()` 先按角色 **UUID** 匹配，然后以**名称**作为回退。

## CHOICE

向玩家呈现可选选项。当配置了 [`setChoiceFilter()`](/zh/guide/choice-visibility) 时，每个 choice 会被标记为 `visible: true | false`。

<!--@include: ../../_shared/block-choice.md-->

参见 [Choice 可见性](/zh/guide/choice-visibility) 了解完整的可选标记系统。

## CONDITION

评估逻辑以分支流程。handler **必须**调用 `resolve(result)` — `true` 走 port index 0，`false` 走 port index 1。

<!--@include: ../../_shared/block-condition.md-->

::: tip choice: condition
以 `choice:` 开头的 key 的 condition 引用了之前的玩家选择。使用 `scene.evaluateCondition(cond)` 来解析它们 — engine 会自动检查其内部的选择历史记录。
:::

## ACTION

触发游戏状态变更。调用 `resolve()` 表示成功，或调用 `reject(error)` 表示失败。

<!--@include: ../../_shared/block-action.md-->

## NOTE

设计师使用的文档 block。不会被执行 — 在遍历过程中自动跳过。

## 通用属性

所有 block 共享以下基础字段：

| 字段 | 类型 | 描述 |
|------|------|------|
| `uuid` | `string` | 唯一标识符 |
| `type` | `BlockType` | 判别类型 |
| `label` | `string?` | 人类可读的名称 |
| `properties` | `BlockProperty[]` | 键值属性 |
| `userProperties` | `Record?` | 自由格式的用户属性 |
| `nativeProperties` | `NativeProperties?` | 执行属性（async、delay 等） |
| `metadata` | `BlockMetadata?` | 显示元数据（角色、标签、颜色） |
| `isStartBlock` | `boolean?` | 标记入口 block |

### NativeProperties

| 字段 | 类型 | 描述 |
|------|------|------|
| `isAsync` | `boolean?` | 在并行异步轨道上执行 |
| `delay` | `number?` | 执行前的延迟（由 `onBeforeBlock` 消费） |
| `timeout` | `number?` | 执行超时时间 |
| `portPerCharacter` | `boolean?` | metadata 中每个角色对应一个输出 port |
| `skipIfMissingActor` | `boolean?` | 如果引用的 actor 不存在则跳过 block |
| `debug` | `boolean?` | 编辑器调试标志 |
| `waitForBlocks` | `string[]?` | 此 block 可以继续之前必须已访问的 block UUID |
| `waitInput` | `boolean?` | 用于显式玩家输入控制的被动标志 |
