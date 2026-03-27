# LSDEDE とは？

**LSDE**（LepaSoft Dialogue Editor）は、インタラクティブな対話システムを設計するためのビジュアルエディターです。対話グラフを、scene、block、connection、dictionary、action signature を含む JSON blueprint として出力します。

**LSDEDE**（LSDE Dialog Engine）は、これらの blueprint を読み込み実行するマルチランタイム engine です。複数の言語で利用可能なため、お好みのゲームエンジンやフレームワークにネイティブ統合できます。

## 利用可能なランタイム

| ランタイム | 言語 | 対象 | ソース |
|---------|----------|--------|--------|
| **TypeScript** | TypeScript / JavaScript | リファレンス実装 | [lsde-ts](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-ts) |
| **C#** | C# (.NET Standard 2.1) | Unity, Godot Mono, .NET | [lsde-csharp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-csharp) |
| **C++** | C++17 | Unreal Engine, カスタムエンジン | [lsde-cpp](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-cpp) |
| **GDScript** | GDScript | Godot 4 | [lsde-gdscript](https://github.com/jonlepage/LS-Dialog-Editor-Engine/tree/master/lsde-gdscript) |

すべてのランタイムは同じ blueprint フォーマットを共有し、共通のクロス言語テストスイート（42テストケース）に合格しています。

## アーキテクチャ

すべてのランタイムは同じ **callback 駆動型グラフディスパッチャー** パターンに従います：

1. **Blueprint** — LSDE から出力された JSON ファイル。scene、block、connection を含みます。
2. **Engine** — blueprint を検証し、内部グラフを構築して block を handler にディスパッチします。
3. **Handler** — 各 block タイプ（dialog、choice、condition、action）に反応するあなたの関数です。
4. **ゲーム本体** — condition、action、キャラクター解決は、あなたの handler callback によって処理されます。

```
Blueprint JSON → engine.init() → engine.scene(id).start()
                                        ↓
                              onDialog / onChoice / ...
                                        ↓
                                  next() → next block
```

## 設計原則

- **ゼロ依存** — どの言語でもランタイム依存関係なし。
- **フレームワーク非依存** — あらゆるゲームエンジンや UI フレームワークで動作します。
- **Callback 駆動型** — 内部レンダーループなし。準備ができたら `next()` を呼びます。
- **2階層 handler** — グローバル（engine レベル）と scene レベルの handler、`preventGlobalHandler()` 付き。
- **クロス言語準拠** — すべてのランタイムが同じ blueprint に対して同一の出力を生成します。
