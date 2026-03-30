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

::: code-group
```ts [TypeScript]
interface RuntimeChoiceItem extends ChoiceItem {
  visible?: boolean; // true | false | undefined
}
```
```csharp [C#]
public class RuntimeChoiceItem : ChoiceItem
{
    public bool? Visible { get; set; } // true | false | null
}
```
```cpp [C++]
struct RuntimeChoiceItem : ChoiceItem {
    std::optional<bool> visible; // true | false | nullopt
};
```
```gdscript [GDScript]
# RuntimeChoiceItem is a Dictionary with an extra "visible" key:
# { "uuid": "...", "dialogueText": {...}, "visible": true/false/absent }
```
:::

フィルターなしの場合、choice は `RuntimeChoiceItem` のままですが、`visible` は `undefined`/`null`/`nullopt`/absent のままです。

## 使用例

### 標準 — 表示可能な choice を表示

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  const visible = context.choices.filter(c => c.visible !== false);
  ui.showChoices(visible, (uuid) => {
    context.selectChoice(uuid);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Choices
        .Where(c => c.Visible != false).ToList();
    ShowChoicesUI(visible, uuid => {
        args.Context.SelectChoice(uuid);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);
    showChoicesUI(visible, [ctx, next](const auto& uuid) {
        ctx->selectChoice(uuid);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].choices:
        if c.get("visible") != false:
            visible.append(c)
    show_choices_ui(visible, func(uuid):
        args["context"].select_choice(uuid)
        args["next"].call()
    )
    return Callable()
)
```
:::

### タイムアウト付き choice — タイムアウト時に自動選択

::: code-group
```ts [TypeScript]
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
```csharp [C#]
engine.OnChoice(args => {
    var (_, block, context, next) = args;
    var visible = context.Choices
        .Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;

    void Resolve(RuntimeChoiceItem choice) {
        context.SelectChoice(choice.Uuid);
        next();
    }

    if (timeout.HasValue)
    {
        // use your engine's timer — cancel on player selection
        var timer = ScheduleTimer((float)timeout.Value, () => Resolve(visible[0]));
        ShowChoicesUI(visible, uuid => {
            timer.Cancel();
            Resolve(visible.First(c => c.Uuid == uuid));
        });
    }
    else
    {
        ShowChoicesUI(visible, uuid => Resolve(visible.First(c => c.Uuid == uuid)));
    }
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeChoiceItem*> visible;
    for (const auto& c : ctx->choices())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    auto timeout = block->nativeProperties
        ? block->nativeProperties->timeout : std::nullopt;

    auto resolve = [ctx, next](const std::string& uuid) {
        ctx->selectChoice(uuid);
        next();
    };

    if (timeout.has_value()) {
        // use your engine's timer — cancel on player selection
        auto timer = scheduleDelay(timeout.value(), [&]() { resolve(visible[0]->uuid); });
        showChoicesUI(visible, [resolve, timer](const auto& uuid) {
            timer->cancel();
            resolve(uuid);
        });
    } else {
        showChoicesUI(visible, resolve);
    }
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var ctx = args["context"]
    var next_fn = args["next"]
    var block = args["block"]
    var visible = []
    for c in ctx.choices:
        if c.get("visible") != false:
            visible.append(c)

    var timeout_val = block.get("nativeProperties", {}).get("timeout", 0)

    if timeout_val > 0:
        # use your engine's timer — cancel on player selection
        var timer = get_tree().create_timer(timeout_val)
        timer.timeout.connect(func():
            ctx.select_choice(visible[0]["uuid"])
            next_fn.call()
        )
        show_choices_ui(visible, func(uuid):
            timer.time_left = 0  # cancel
            ctx.select_choice(uuid)
            next_fn.call()
        )
    else:
        show_choices_ui(visible, func(uuid):
            ctx.select_choice(uuid)
            next_fn.call()
        )
    return Callable()
)
```
:::

### 非表示の choice をグレーアウト表示

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  for (const choice of context.choices) {
    if (choice.visible === false) {
      ui.addGreyed(choice);   // show but disabled
    } else {
      ui.addNormal(choice);   // selectable
    }
  }
  // wait for player selection...
});
```
```csharp [C#]
engine.OnChoice(args => {
    foreach (var choice in args.Context.Choices)
    {
        if (choice.Visible == false)
            AddGreyed(choice);   // show but disabled
        else
            AddNormal(choice);   // selectable
    }
    // wait for player selection...
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    for (const auto& choice : ctx->choices()) {
        if (choice.visible.has_value() && !choice.visible.value())
            addGreyed(choice);   // show but disabled
        else
            addNormal(choice);   // selectable
    }
    // wait for player selection...
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    for choice in args["context"].choices:
        if choice.get("visible") == false:
            add_greyed(choice)   # show but disabled
        else:
            add_normal(choice)   # selectable
    # wait for player selection...
    return Callable()
)
```
:::

### チュートリアル — 表示制御を完全に無視

::: code-group
```ts [TypeScript]
tutorial.onChoice(({ context, next }) => {
  // force-select the first choice, no filtering
  context.selectChoice(context.choices[0].uuid);
  next();
});
```
```csharp [C#]
tutorial.OnChoice(args => {
    // force-select the first choice, no filtering
    args.Context.SelectChoice(args.Context.Choices[0].Uuid);
    args.Next();
    return null;
});
```
```cpp [C++]
tutorial->onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    // force-select the first choice, no filtering
    ctx->selectChoice(ctx->choices()[0].uuid);
    next();
    return {};
});
```
```gdscript [GDScript]
tutorial.on_choice(func(args):
    # force-select the first choice, no filtering
    args["context"].select_choice(args["context"].choices[0]["uuid"])
    args["next"].call()
    return Callable()
)
```
:::

## エバリュエーターの共有

一般的に、condition の評価はインベントリシステム、フラグマネージャー、クエストトラッカーなど1か所で行われます。`setChoiceFilter` と `onCondition` で**同じエバリュエーター関数**を共有することで、ロジックを1か所にまとめることができます：

<!--@include: ../../_shared/choice-reusable-filter.md-->

::: tip なぜ共有するのか？
このパターンを使わないと、同じ `gameState.check(...)` ロジックを2か所に書くことになります。ゲームステート API が変更された場合、一方のみ修正してもう一方を見落とすリスクがあります。1つの関数、2つの登録、ドリフトはゼロです。
:::

## 上級: 手動フィルタリング

グローバルフィルターをインストールしたくない場合、`LsdeUtils` がローレベルのユーティリティを提供します：

::: code-group
```ts [TypeScript]
import { LsdeUtils } from '@lsde/dialog-engine';

const visible = LsdeUtils.filterVisibleChoices(
  block.choices ?? [],
  (cond) => gameState.check(cond.key, cond.operator, cond.value),
  scene, // optional — enables choice: condition resolution via history
);
```
```csharp [C#]
var visible = LsdeUtils.FilterVisibleChoices(
    block.Choices ?? new(),
    cond => GameState.Check(cond.Key, cond.Operator, cond.Value),
    scene // optional — enables choice: condition resolution via history
);
```
```cpp [C++]
auto visible = lsde::LsdeUtils::FilterVisibleChoices(
    block->choices,
    [](const auto& cond) { return gameState.check(cond.key, cond.op, cond.value); },
    scene // optional — enables choice: condition resolution via history
);
```
```gdscript [GDScript]
var visible = LsdeUtils.filter_visible_choices(
    block.get("choices", []),
    func(cond): return game_state.check(cond),
    scene # optional — enables choice: condition resolution via history
)
```
:::

`scene` パラメーターを指定すると、`choice:` condition の自動解決が有効になります。指定しない場合、すべての condition は登録されたエバリュエーター callback に委任されます。
