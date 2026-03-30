# 生命周期与验证

## 完整生命周期

### 每个 Block 的执行顺序

1. **上一个 block 的清理** — *上一个* block 的 handler 返回的清理函数在转换时执行（`next()` 被调用时）
2. `onValidateNextBlock` — 执行前的验证
3. `onBeforeBlock` — 预处理（必须调用 `resolve()` 才能继续）
4. 类型 handler（先第 2 层，再第 1 层）

### Scene 事件

<!--@include: ../../_shared/lifecycle-scene-events.md-->

## onValidateNextBlock

拦截每次 block 转换进行验证。handler 接收下一个 block（`nextContext`）和上一个 block（`fromContext`）的**已解析角色**：

<!--@include: ../../_shared/lifecycle-validate.md-->

### Character Gating

使用 `nextContext.character` 根据游戏状态控制哪些 block 可以执行：

<!--@include: ../../_shared/lifecycle-validate-stunned.md-->

使用 `fromContext.character` 验证角色之间的转换（例如：关系检查、冷却时间）。`fromContext` 在场景的第一个 block 中为 `null`。

## onBeforeBlock

在每个 block 之前调用。**必须调用 `resolve()`** 才能继续：

<!--@include: ../../_shared/lifecycle-before-block.md-->

## 清理函数

handler 可以返回一个清理函数，在离开 block 时调用：

<!--@include: ../../_shared/lifecycle-cleanup.md-->

## 错误边界

每个 handler 调用都包裹在 try/catch 中。如果 handler 抛出异常：

- 错误是**静默的** — 不会被记录或重新抛出。如果您的 scene 意外结束，请检查您的 handler。
- 对于主轨道：scene 会干净地结束
- 对于异步轨道：只有受影响的轨道被终止 — 其他轨道和主流程继续运行

这是跨语言兼容的（TS、C#、C++、GDScript 中的 try/catch）。

## cancel()

调用 `scene.cancel()` 会触发以下序列：

1. 所有**异步轨道**被取消
2. 当前 block 的**清理函数**被执行
3. `onSceneExit` handler 被调用
4. scene 被标记为已完成

<!--@include: ../../_shared/lifecycle-invalidate.md-->

## NativeProperties

控制 engine 如何调度 block 的执行属性：

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `isAsync` | `boolean?` | 在并行异步轨道上执行 |
| `delay` | `number?` | 执行前的延迟（由 `onBeforeBlock` 消费） |
| `timeout` | `number?` | 执行超时 |
| `portPerCharacter` | `boolean?` | metadata 中每个角色一个输出端口 |
| `skipIfMissingActor` | `boolean?` | 如果引用的角色不存在则跳过 block |
| `debug` | `boolean?` | 编辑器调试标志 |
| `waitForBlocks` | `string[]?` | 此 block 进展前必须已被访问的 block UUID |
| `waitInput` | `boolean?` | 用于显式玩家输入控制的被动标志 |

## Visual Reference

### Block Execution Flow

```mermaid
flowchart TD
    A["next() called"] --> B["cleanup previous block"]
    B --> C[processBlock]
    C --> D{NOTE block?}
    D -- yes --> E[skip to next connection]
    D -- no --> F["onValidateNextBlock\n• nextContext.character\n• fromContext.character"]
    F --> G{valid?}
    G -- no --> H[onInvalidateBlock\nscene stops]
    G -- yes --> I["onBeforeBlock\nresolve()"]
    I --> J[type handler\nTier 2 then Tier 1]
    J --> K["next() → advance"]
```

### Character Gating Flow

```mermaid
flowchart TD
    A["block.metadata.characters\n= [Lia, Bob, Sam]"] --> B["onResolveCharacter\ngame returns: Lia"]
    B --> C["onValidateNextBlock\nnextContext.character = Lia\nfromContext.character = prev"]
    C --> D{valid?}
    D -- "Lia OK" --> E["execute block\ncontext.character = Lia"]
    D -- "Lia stunned" --> F["onInvalidateBlock\nscene.cancel()"]
    D -- "undefined\nno character in party" --> F
```
