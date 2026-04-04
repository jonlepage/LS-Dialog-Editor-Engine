---
layout: home

hero:
  name: LSDEDE
  text: LSDE Dialog Engine
  tagline: インタラクティブな対話 blueprint 向けのマルチランタイム、callback 駆動型グラフディスパッチャー
  actions:
    - theme: brand
      text: はじめに
      link: /ja/guide/getting-started
    - theme: alt
      text: API リファレンス
      link: /api-ref/
    - theme: alt
      text: ⚡ ライブで試す
      link: https://jonlepage.github.io/LSDEDE-DEMO-TS/

features:
  - title: ビジュアル Blueprint
    details: LSDE エディターから出力された JSON をそのまま使用 — scene、block、connection、dictionary、signature。
  - title: マルチランタイム
    details: TypeScript、C#、C++、GDScript で利用可能。同じ blueprint フォーマット、同じテストスイート、ネイティブ統合。
  - title: Callback 駆動型
    details: 内部レンダーループなし。engine が block を handler にディスパッチし、フローの制御はホストアプリケーション側で行います。
  - title: ゼロマジック
    details: engine は純粋なグラフ走査マシン。4つの handler が各 block に意味を与えます — 隠れたフォールバックも自動評価もありません。
---

## ランタイム

| ランタイム | 言語 | 対象 | ソース |
|---------|----------|--------|--------|
| **TypeScript** | TypeScript | リファレンス実装 | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, カスタムエンジン | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |
