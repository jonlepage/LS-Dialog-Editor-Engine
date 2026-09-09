# 快速入门

## 安装

<!--@include: ../../_shared/install-tabs.md-->

## 基本用法

engine 是一个图遍历机器 — 它将 block 分发给已注册的 handler，由 handler 赋予其意义。没有 handler 的话，engine 不会产生任何输出。

::: tip 格式无关
engine 接收 `BlueprintExport` 对象，而非文件。您可以使用平台适配的解析器从 JSON、XML 或 YAML 加载蓝图。请参阅[解析与导入](./parsing)。
:::

<!--@include: ../../_shared/getting-started-usage.md-->

## Blueprint 验证

`engine.init()` 返回包含错误、警告和统计信息的[诊断报告](/api-ref/interfaces/DiagnosticReport)。`check` 选项可与宿主应用程序的功能进行交叉验证：

<!--@include: ../../_shared/getting-started-validation.md-->

### 十七种诊断

**错误 —— payload 被拒绝，什么都不会播放。** `errors` 非空，`engine.scene()` 也无从交付。

| 代码 | 发生了什么 |
|---|---|
| `MISSING_DATA` | 没有向 `init()` 传入 `data` |
| `MISMATCHED_EXPORTS` | 合并了来自不同导出的多个文件 —— `project` 或 `exportedAt` 不一致。请一次只传一个导出的文件 |
| `WRONG_NAMING_CONVENTION` | 以 `snake_case` 或 `PascalCase` 导出；engine 读取的是 camelCase。项目设置 › 导出器 › 命名约定 |
| `INVALID_FORMAT` | `format` 不是 `lsde-blueprints`。C# 和 C++ 对上一种情况也报告这个：它们校验的是已反序列化的类型化对象，原始键名早已丢失 |
| `UNSUPPORTED_FORMAT_VERSION` | `version` 不是 `1`。仍在 LSDE 1.6 的项目属于 engine 0.3.x —— 没有双读取器 |
| `NO_SCENES` | payload 里没有任何 scene |
| `DUPLICATE_SCENE` | 两个 scene 共用了 path 或稳定 id |
| `MISSING_SCENE_PATH` | 某个 scene 没有 path |
| `DUPLICATE_BLOCK_ID` | **同一** scene 里两个 block 共用 id。跨 scene 则合法且正常 —— 一个 block 是 (scene, id) |
| `INVALID_START_BLOCK` | scene 指定的起始 block 并不属于它 |
| `BROKEN_LINK` | 有连线指向 scene 中不存在的 block。遍历将无处可去 |

**警告 —— 能播放，但有东西会静默失效。** 请阅读它们，没有一条是噪音。

| 代码 | 你会失去什么 |
|---|---|
| `NO_START_BLOCK` | scene 没有起始 block，`start()` 无处开始 |
| `UNKNOWN_WAIT_BLOCK` | 某个 `waitForBlocks` id 不是本 scene 的 block，于是那条轨道**永久**停留。检查无法更进一步：一个确实存在的 id 也可能永远不会被播放 |
| `UNKNOWN_FUNCTION` | 某个 action 调用了 `check.functions` 未列出的函数 id |
| `UNKNOWN_DICTIONARY` | 某个 condition 测试了 `check.dictionaries` 未列出的字典 id |
| `UNKNOWN_DICTIONARY_ENTRY` | 字典已知，条目键未知 |
| `UNKNOWN_CARD` | 某个 block 引用了 `check.cards` 未列出的角色卡**名称** |

最后四条只在你传入 `check` 时出现 —— 不传，engine 就没有可比对的东西。


