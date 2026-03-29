# 游戏引擎集成

LSDE engine 是一个纯粹的图遍历机器 — 它遍历节点并调用已注册的 handler。**handler 是 engine 和游戏之间的桥梁。** 本页展示如何将它们接入真实的游戏引擎。

## 模式

每次集成都遵循相同的 3 步流程：

1. **初始化** — 将 blueprint JSON 输入 engine
2. **连接** — 将 4 个 handler 接入游戏系统（UI、状态、音频...）
3. **启动** — engine 调用 handler，由 handler 驱动游戏逻辑

engine 永远不会触碰 UI、状态或音频。它只通知*发生了什么*，由 handler 决定*如何响应*。可以将其理解为一个导演在读舞台指示 — 游戏就是演员、工作人员和舞台。

## 显示对话

最简单的 handler — 显示文本并等待玩家继续。

<!--@include: ../../_shared/integration-dialog.md-->

::: tip next() 是流程控制器
立即调用 `next()` 可以实现快速对话推进，或者保存它稍后调用 — 在动画结束后、计时器结束后、玩家点击后... 任何适合游戏的方式。engine 会耐心等待。
:::

## 呈现选项

动态生成 UI 元素，让玩家选择，然后告诉 engine 选了什么。

<!--@include: ../../_shared/integration-choice.md-->

## 评估 Condition

游戏状态逻辑完全由宿主应用程序控制。engine 只需要一个 `true` 或 `false`。

<!--@include: ../../_shared/integration-condition.md-->

## 执行 Action

这是游戏真正活起来的地方 — 播放音效、给予物品、设置标记、触发过场动画。

<!--@include: ../../_shared/integration-action.md-->

## 各 Handler 的对应关系

| Handler | engine 通知的内容 | 对应的处理方式 |
|---|---|---|
| `onDialog` | "显示这个角色的这段文本" | 显示 UI、播放语音、等待输入 |
| `onChoice` | "这些是选项（标记了可见/隐藏）" | 生成按钮、处理选择 |
| `onCondition` | "评估这些 condition" | 检查游戏状态，返回 true/false |
| `onAction` | "执行这些效果" | 设置标记、给予物品、播放音效 |
| `onResolveCharacter` | "哪个角色是活跃的？" | 队伍系统、战斗阵型 |
| `setChoiceFilter` | "这个 condition 对可见性来说为真吗？" | 检查背包、标记、任务状态 |
| `onValidateNextBlock` | "下一个 block — 允许执行吗？" | 角色门控、状态检查、转换规则 |
| `onBeforeBlock` | "Block 即将执行" | 处理延迟、过渡、淡入效果 |

## 实用技巧

- **`next()` 是流程控制器。** 立即调用实现快速对话推进，或者保存它直到动画结束。engine 会等待 — 它没有时间概念。
- **清理函数是免费的管家服务。** 从任何 handler 返回一个清理函数，engine 在移动到下一个 block 时会调用它。非常适合隐藏 UI、停止音频或释放生成的节点。
- **`onBeforeBlock` 处理延迟。** engine 不强制执行 `delay` — 这由 `onBeforeBlock` handler 读取 `nativeProperties.delay` 并在计时器后调用 `resolve()` 来实现。完全由 handler 控制。
- **异步轨道是并行故事线。** 如果过场动画需要同时进行对话和镜头移动，在编辑器中将 block 标记为 `isAsync`。每条轨道独立运行。
