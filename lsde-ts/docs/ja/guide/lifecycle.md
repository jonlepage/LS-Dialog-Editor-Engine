# ライフサイクルと検証

## 完全なライフサイクル

### 各 Block の実行順序

1. **前の block のクリーンアップ** — *前の* block の handler が返したクリーンアップ関数が遷移時に実行されます（`next()` が呼ばれた時点）
2. `onValidateNextBlock` — 実行前の検証
3. `onBeforeBlock` — 前処理（続行するには `resolve()` を呼び出す必要あり）
4. タイプ handler（Tier 2、次に Tier 1）

### Scene イベント

<!--@include: ../../_shared/lifecycle-scene-events.md-->

## onValidateNextBlock

各 block 遷移をインターセプトして検証します。handler は次の block (`nextContext`) と前の block (`fromContext`) の**解決されたキャラクター**を受け取ります：

<!--@include: ../../_shared/lifecycle-validate.md-->

### Character Gating

`nextContext.character` を使用して、ゲームの状態に基づいて block の実行を制御します：

<!--@include: ../../_shared/lifecycle-validate-stunned.md-->

`fromContext.character` を使用してキャラクター間の遷移を検証できます（例：関係チェック、クールダウン）。`fromContext` はシーンの最初の block では `null` です。

## onBeforeBlock

各 block の前に呼び出されます。続行するには**必ず `resolve()` を呼び出す**必要があります：

<!--@include: ../../_shared/lifecycle-before-block.md-->

## クリーンアップ関数

handler はクリーンアップ関数を返すことができ、block から離れる際に呼び出されます：

<!--@include: ../../_shared/lifecycle-cleanup.md-->

## エラー境界

すべての handler 呼び出しは try/catch でラップされています。handler がスローした場合：

- エラーは**サイレント**です — ログ出力や再スローは行われません。scene が予期せず終了した場合、handler を確認してください。
- メイントラックの場合：scene はクリーンに終了します
- async トラックの場合：影響を受けたトラックのみが終了し、他のトラックとメインフローは継続します

これはクロス言語互換です（TS、C#、C++、GDScript の try/catch）。

## cancel()

`scene.cancel()` を呼び出すと、以下のシーケンスが実行されます：

1. すべての **async トラック** がキャンセルされます
2. 現在の block の**クリーンアップ関数**が実行されます
3. `onSceneExit` handler が呼び出されます
4. scene が完了としてマークされます

<!--@include: ../../_shared/lifecycle-invalidate.md-->

## NativeProperties

engine が block をディスパッチする方法を制御する実行プロパティ：

| フィールド | 型 | 説明 |
|-------|------|-------------|
| `isAsync` | `boolean?` | 並列 async トラックで実行 |
| `delay` | `number?` | 実行前のディレイ（`onBeforeBlock` で消費） |
| `timeout` | `number?` | 実行タイムアウト |
| `portPerCharacter` | `boolean?` | metadata 内のキャラクターごとに出力ポートを作成 |
| `skipIfMissingActor` | `boolean?` | 参照されたアクターが不在の場合、block をスキップ |
| `debug` | `boolean?` | エディタ用デバッグフラグ |
| `waitForBlocks` | `string[]?` | この block が進行する前に訪問済みでなければならない block の UUID |
| `waitInput` | `boolean?` | 明示的なプレイヤー入力制御用のパッシブフラグ |

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
