# 快速入门

## 安装

<!--@include: ../../_shared/install-tabs.md-->

## 基本用法

engine 是一个图遍历机器 — 它将 block 分发给已注册的 handler，由 handler 赋予其意义。没有 handler 的话，engine 不会产生任何输出。

<!--@include: ../../_shared/getting-started-usage.md-->

## Blueprint 验证

`engine.init()` 返回包含错误、警告和统计信息的[诊断报告](/api-ref/interfaces/DiagnosticReport)。`check` 选项可与宿主应用程序的功能进行交叉验证：

<!--@include: ../../_shared/getting-started-validation.md-->

