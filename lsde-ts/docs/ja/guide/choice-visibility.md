# Choice の表示制御

## 概要

CHOICE block がディスパッチされると、`context.choices` には blueprint で定義された**すべての** choice が常に含まれます — 事前にフィルタリングされるものはありません。engine は配列から choice を削除することはありません。

表示制御フィルタリングが必要な場合（例：ゲームステートや以前の選択に基づいて choice を非表示にする）、engine は**オプトイン方式のタグ付け**システムを提供します。フィルターを一度インストールすると、`onChoice` handler が呼ばれる前に、engine が各 choice に `visible: true | false` をタグ付けします。

## セットアップ

engine に choice フィルターを登録します — scene を開始する前に一度だけ：

<!--@include: ../../_shared/choice-filter-setup.md-->

インストールされると、engine は `onChoice` を呼び出す**前に**各 choice の `visibilityConditions` を評価します：

- **`choice:` condition**（以前のプレイヤー選択を参照）は、engine の内部 choice 履歴によって自動的に解決されます — 登録された callback には渡されません。
- **ゲームステート condition**（その他すべて）は、登録された callback に委任されます。
- `&`（AND）と `|`（OR）によるチェーンは、両方のタイプにまたがって正しく動作します。

## onChoice でのフィルタリング

handler 内で、1行でフィルタリングできます：

<!--@include: ../../_shared/choice-visibility-handler.md-->

### なぜ `visible !== false` であって `=== true` ではないのか？

**フィルターがインストールされていない**場合、`visible` は `undefined` です。`undefined !== false` は `true` に評価されるため、すべての choice が通過します — デフォルトで後方互換性があります。フィルターが**インストールされている**場合、choice は明示的に `true` または `false` でタグ付けされます。

| `visible` の値 | 意味 | `!== false` |
|---|---|---|
| `true` | フィルターインストール済み、choice は通過 | `true` |
| `false` | フィルターインストール済み、choice は非表示 | `false` |
| `undefined` | フィルター未インストール | `true` |

## RuntimeChoiceItem

フィルターがインストールされている場合、`context.choices` 内の各 choice は `RuntimeChoiceItem` です — `visible` タグが追加された `ChoiceItem` の拡張です：

```ts
interface RuntimeChoiceItem extends ChoiceItem {
  visible?: boolean; // true | false | undefined
}
```

フィルターなしの場合、choice は `RuntimeChoiceItem` のままですが、`visible` は `undefined` のままです。

## 使用例

### 標準 — 表示可能な choice を表示

```ts
engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  ui.showChoices(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```

### タイムアウト付き choice — タイムアウト時に自動選択

```ts
engine.onChoice(({ block, context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  const timeout = block.nativeProperties?.timeout;

  const resolve = (choice) => {
    context.selectChoice(choice.uuid);
    next();
  };

  if (timeout) {
    const timer = setTimeout(() => resolve(visible[0]), timeout * 1000);
    ui.showChoices(visible, (uuid) => {
      clearTimeout(timer);
      resolve(visible.find(c => c.uuid === uuid));
    });
  } else {
    ui.showChoices(visible, (uuid) => resolve(visible.find(c => c.uuid === uuid)));
  }
});
```

### 非表示の choice をグレーアウト表示

```ts
engine.onChoice(({ context, next }) => {
  for (const choice of context.choices) {
    if (choice.visible === false) {
      ui.addGreyed(choice);   // Show but disabled
    } else {
      ui.addNormal(choice);   // Selectable
    }
  }
  // Wait for player selection...
});
```

### チュートリアル — 表示制御を完全に無視

```ts
tutorial.onChoice(({ context, next }) => {
  // Force-select the first choice, no filtering
  context.selectChoice(context.choices[0].uuid);
  next();
});
```

## エバリュエーターの共有

一般的に、condition の評価はインベントリシステム、フラグマネージャー、クエストトラッカーなど1か所で行われます。`setChoiceFilter` と `onCondition` で**同じエバリュエーター関数**を共有することで、ロジックを1か所にまとめることができます：

<!--@include: ../../_shared/choice-reusable-filter.md-->

::: tip なぜ共有するのか？
このパターンを使わないと、同じ `gameState.check(...)` ロジックを2か所に書くことになります。ゲームステート API が変更された場合、一方のみ修正してもう一方を見落とすリスクがあります。1つの関数、2つの登録、ドリフトはゼロです。
:::

## 上級: 手動フィルタリング

グローバルフィルターをインストールしたくない場合、`LsdeUtils` がローレベルのユーティリティを提供します：

```ts
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // Optional — when provided, choice: conditions are resolved via choice history
);
```

`scene` パラメーターを指定すると、`choice:` condition の自動解決が有効になります。指定しない場合、すべての condition は登録されたエバリュエーター callback に委任されます。
