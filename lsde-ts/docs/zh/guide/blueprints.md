# Blueprint 与 Scene

## Blueprint 结构

`BlueprintExport` 是从 [LSDE](https://lepasoft.com/zh/software/ls-dialog-editor "Lepasoft Dialog Editor") 编辑器导出的 JSON 文件。它包含 engine 所需的全部数据。

<!--@include: ../../_shared/blueprint-export-type.md-->

## Scene

scene 是一个独立的对话序列 — 一段对话、一段过场动画、一个教程提示、一次商店交互。在游戏中，scene 通常由脚本事件触发：玩家与 NPC 对话、进入区域或拾取物品。

每个 scene 拥有自己的入口 block、独立的流程和独立的状态。多个 scene 可以并行运行（例如：主对话和教程覆盖层）。scene 由 [`BlueprintScene`](/api-ref/interfaces/BlueprintScene) 接口定义：

<!--@include: ../../_shared/blueprint-scene-type.md-->

## Connection

Connection 是 block 之间的连线 — 定义哪个 block 通向哪个 block。在编辑器中可视化绘制，导出后变为源 → 目标的扁平列表，由 [`BlueprintConnection`](/api-ref/interfaces/BlueprintConnection) 接口定义：

<!--@include: ../../_shared/blueprint-connection-type.md-->

通常不需要直接检查 connection — engine 会在内部处理路由。如有需要，可以通过 [`onValidateNextBlock`](/api-ref/classes/DialogueEngine#onvalidatenextblock) 访问。

## Dictionary

Dictionary 描述游戏的寄存器 — 开关、变量、背包等。开发者在 [LSDE](https://lepasoft.com/zh/software/ls-dialog-editor "Lepasoft Dialog Editor") 编辑器中声明，向叙事设计师公开游戏中可用的变量。运行时，开发者将每个 dictionary 映射到游戏中对应的系统。[`condition`](/api-ref/interfaces/ExportCondition) 和 [`onResolveCondition`](/api-ref/classes/DialogueEngine#onresolvecondition) 使用这些键来评估游戏状态。由 [`Dictionary`](/api-ref/interfaces/Dictionary) 接口定义：

<!--@include: ../../_shared/blueprint-dictionary-type.md-->

## Action Signature

Signature 描述游戏中可用的动作类型 — `set_flag`、`play_sound`、`give_item`。开发者在 [LSDE](https://lepasoft.com/zh/software/ls-dialog-editor "Lepasoft Dialog Editor") 编辑器中声明，让叙事设计师使用类型化参数组合动作序列。运行时，开发者将 signature 的 `id` 映射到自己的系统。由 [`ActionSignature`](/api-ref/interfaces/ActionSignature) 接口定义：

<!--@include: ../../_shared/blueprint-signature-type.md-->
