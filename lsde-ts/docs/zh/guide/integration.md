# 游戏引擎集成

LSDE 与引擎无关 — 不依赖任何游戏引擎、UI 框架或音频系统。它遍历图并调用注册的 handler。本页展示如何将其接入主流游戏引擎。

handler 的详细实现请参阅 [Block Types](./block-types) 和 [Handlers](./handlers)。

## 完整集成示例

以下示例展示了在每个引擎中集成 LSDE 的一种方式。它将 4 个必需的 handler — dialog、choice、condition、action — 包含在一个类中，作为起点。

每个游戏都有自己的需求。请根据项目调整结构、布局和 UI。

<!--@include: ../../_shared/integration-complete.md-->

## 4 个 Handler

每个 handler 接收 block 数据和 `next()` 回调。开发者在引擎中处理数据，block 处理完成后调用 `next()`。调用时机完全由游戏决定。

- **Dialog** — 文本、角色、原生属性。在 UI 中显示对话，等待玩家输入或延迟，然后调用 `next()`。返回清理函数，在 engine 移到下一个 block 时隐藏 UI。

- **Choice** — 配置 `choiceFilter` 后带有 `visible` 标签的选项列表。创建对应的 UI 元素 — 按钮、列表、径向菜单。玩家选择后，`selectChoice(uuid)` 告诉 engine 走哪条分支，然后 `next()` 推进流程。

- **Condition** — block 中定义的条件。用游戏逻辑评估 — 检查标记、任务、背包。`context.resolve(true)` 将流程发送到端口 0，`context.resolve(false)` 发送到端口 1。

- **Action** — block 中定义的动作。在引擎中执行 — 播放音效、给予物品、触发过场动画。`context.resolve()` 确认成功，`context.reject(err)` 通知失败。

## 实用技巧

- **`next()` 是遥控器。** 立即调用实现快速对话，或保留它直到动画结束。engine 会等待 — 它没有时间概念。
- **清理函数负责善后。** 从任何 handler 返回一个函数，engine 在移到下一个 block 时会调用它。非常适合隐藏 UI、停止音频或释放节点。
- **`onBeforeBlock` 处理 delay。** engine 不强制执行 `nativeProperties.delay` — 由 `onBeforeBlock` 读取它并在定时器后调用 `resolve()`。完全控制。
- **async track 是并行流。** 当过场动画需要同时进行对话和摄像机移动时，在编辑器中标记为 `isAsync` 的 block 会在独立 track 上运行。
