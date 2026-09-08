# Blueprint 与 Scene

## Blueprint 结构

`BlueprintExport` 是从 [LSDE](https://lepasoft.com/zh/software/ls-dialog-editor "Lepasoft Dialog Editor") 编辑器导出的 JSON 文件。它包含 engine 所需的全部数据。

<!--@include: ../../_shared/blueprint-export-type.md-->

## Scene

scene 是一个独立的对话序列 — 一段对话、一段过场动画、一个教程提示、一次商店交互。在游戏中，scene 通常由脚本事件触发：玩家与 NPC 对话、进入区域或拾取物品。

每个 scene 拥有自己的入口 block、独立的流程和独立的状态。多个 scene 可以并行运行（例如：主对话和教程覆盖层）。scene 由 [`BlueprintScene`](/api-ref/type-aliases/BlueprintScene) 接口定义：

<!--@include: ../../_shared/blueprint-scene-type.md-->

## Connection

Connection 是 block 之间的连线 — 定义哪个 block 通向哪个 block。**导出中不存在 connection 表**：每个 block 在 `block.next` 中携带自己的出线，而一条连线只说明它从哪个 port 出发、通向何处。

在这个格式的任何版本中，连线都**从未**跨越过 scene 边界：`to` 始终指向同一个 scene 中的 block。

[`BlueprintConnection`](/api-ref/type-aliases/BlueprintConnection) 是这些连线的**扁平化**视图，也就是 `engine.getSceneConnections(sceneRef)` 返回的内容 — 一条连线加上它的起始 block：

<!--@include: ../../_shared/blueprint-connection-type.md-->

通常不需要检查它们 — engine 会在内部处理路由。`engine.getSceneConnections(sceneRef)` 是为**图检查**而公开的：一个无需播放 scene 即可查看接线的调试视图。

## Dictionary

Dictionary 描述游戏的寄存器 — 开关、变量、背包等。开发者在 [LSDE](https://lepasoft.com/zh/software/ls-dialog-editor "Lepasoft Dialog Editor") 编辑器中声明，向叙事设计师公开游戏中可用的变量。运行时，开发者将每个 dictionary 映射到游戏中对应的系统。[`condition`](/api-ref/interfaces/ConditionTest) 和 [`onResolveCondition`](/api-ref/classes/DialogueEngine#onresolvecondition) 使用这些键来评估游戏状态。由 [`DictionaryDefinition`](/api-ref/interfaces/DictionaryDefinition) 接口定义：

<!--@include: ../../_shared/blueprint-dictionary-type.md-->

## Function

Function 描述游戏能够执行的操作 — `set_flag`、`play_sound`、`give_item`。开发者在 [LSDE](https://lepasoft.com/zh/software/ls-dialog-editor "Lepasoft Dialog Editor") 编辑器中声明，让叙事设计师使用类型化参数组合序列。运行时，开发者将 function 的 `id` 映射到自己的系统：ACTION block 在 `call.fn` 中引用它，其参数**按名称**出现在 `call.args` 中。由 [`FunctionDefinition`](/api-ref/interfaces/FunctionDefinition) 接口定义：

<!--@include: ../../_shared/blueprint-signature-type.md-->
