# はじめに

## インストール

<!--@include: ../../_shared/install-tabs.md-->

## 基本的な使い方

engine はグラフ走査マシンです — block を handler にディスパッチし、ホストアプリケーション側でそれに意味を与えます。handler がなければ、engine は何も出力しません。

<!--@include: ../../_shared/getting-started-usage.md-->

## Blueprint の検証

`engine.init()` はエラー、警告、統計情報を含む[診断レポート](/api-ref/interfaces/DiagnosticReport)を返します。`check` オプションでゲーム側の機能とのクロスバリデーションが可能です：

<!--@include: ../../_shared/getting-started-validation.md-->

