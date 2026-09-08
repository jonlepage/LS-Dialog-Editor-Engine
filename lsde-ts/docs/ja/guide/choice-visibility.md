# Choice の表示制御

## 概要

CHOICE block がディスパッチされると、`context.options` には blueprint で定義された**すべての** choice が常に含まれます — 事前にフィルタリングされるものはありません。engine は配列から choice を削除することはありません。

表示制御フィルタリングが必要な場合（例：ゲームステートや以前の選択に基づいて choice を非表示にする）、engine は**オプトイン方式のタグ付け**システムを提供します。condition リゾルバーを一度インストールすると、`onChoice` handler が呼ばれる前に、engine が各 choice に `visible: true | false` をタグ付けします。

## セットアップ

engine に condition リゾルバーを登録します — scene を開始する前に一度だけ：

<!--@include: ../../_shared/choice-filter-setup.md-->

インストールされると、engine は `onChoice` を呼び出す**前に**各 choice の `when` を評価します。同じリゾルバーは condition block のグループも事前評価します — 詳細は [Condition blocks](/ja/guide/block-types#condition) を参照してください。

- **`choice:` condition**（以前のプレイヤー選択を参照）は、engine の内部 choice 履歴によって自動的に解決されます — 登録された callback には渡されません。
- **ゲームステート condition**（その他すべて）は、登録された callback に委任されます。
- `&`（AND）と `|`（OR）によるチェーンは、両方のタイプにまたがって正しく動作します。

## onChoice でのフィルタリング

handler 内で、1行でフィルタリングできます：

<!--@include: ../../_shared/choice-visibility-handler.md-->

### なぜ `visible !== false` であって `=== true` ではないのか？

**リゾルバーがインストールされていない**場合、`visible` は `undefined` です。`undefined !== false` は `true` に評価されるため、すべての choice が通過します — デフォルトで後方互換性があります。リゾルバーが**インストールされている**場合、choice は明示的に `true` または `false` でタグ付けされます。

| `visible` の値 | 意味 | `!== false` |
|---|---|---|
| `true` | リゾルバーインストール済み、choice は通過 | `true` |
| `false` | リゾルバーインストール済み、choice は非表示 | `false` |
| `undefined` | リゾルバー未インストール | `true` |

## RuntimeOption

リゾルバーがインストールされている場合、`context.options` 内の各 choice は `RuntimeOption` です — `visible` タグが追加された `Option` の拡張です：

::: code-group
```ts [TypeScript]
interface RuntimeOption extends Option {
  visible?: boolean; // true | false | undefined
}
```
```csharp [C#]
public class RuntimeOption : Option
{
    public bool? Visible { get; set; } // true | false | null
}
```
```cpp [C++]
struct RuntimeOption : Option {
    std::optional<bool> visible; // true | false | nullopt
};
```
```gdscript [GDScript]
# RuntimeOption is a Dictionary with an extra "visible" key:
# { "id": "C1", "key": "...", "text": {...}, "visible": true/false/absent }
```
:::

リゾルバーなしの場合、choice は `RuntimeOption` のままですが、`visible` は `undefined`/`null`/`nullopt`/absent のままです。

## 使用例

### 標準 — 表示可能な choice を表示

::: code-group
```ts [TypeScript]
engine.onChoice(({ context, next }) => {
  const offered = context.options.filter(c => c.visible !== false);
  ui.showOptions(visible, (optionId) => {
    context.selectChoice(optionId);
    next();
  });
});
```
```csharp [C#]
engine.OnChoice(args => {
    var visible = args.Context.Options
        .Where(c => c.Visible != false).ToList();
    ShowChoicesUI(visible, optionId => {
        args.Context.SelectChoice(optionId);
        args.Next();
    });
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeOption*> visible;
    for (const auto& c : ctx->options())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);
    showOptionsUI(visible, [ctx, next](const auto& optionId) {
        ctx->selectChoice(optionId);
        next();
    });
    return {};
});
```
```gdscript [GDScript]
engine.on_choice(func(args):
    var visible = []
    for c in args["context"].options:
        if c.get("visible") != false:
            visible.append(c)
    show_options_ui(visible, func(option_id):
        args["context"].select_choice(option_id)
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
  const offered = context.options.filter(c => c.visible !== false);
  const timeout = LsdeUtils.getNativeProperties(block)?.timeout;

  const resolve = (choice) => {
    context.selectChoice(choice.id);
    next();
  };

  if (timeout) {
    const timer = setTimeout(() => resolve(visible[0]), timeout * 1000);
    ui.showOptions(visible, (optionId) => {
      clearTimeout(timer);
      resolve(visible.find(c => c.id === optionId));
    });
  } else {
    ui.showOptions(visible, (optionId) => resolve(visible.find(c => c.id === optionId)));
  }
});
```
```csharp [C#]
engine.OnChoice(args => {
    var (_, block, context, next) = args;
    var visible = context.Options
        .Where(c => c.Visible != false).ToList();
    var timeout = block.NativeProperties?.Timeout;

    void Resolve(RuntimeOption choice) {
        context.SelectChoice(choice.Id);
        next();
    }

    if (timeout.HasValue)
    {
        // use your engine's timer — cancel on player selection
        var timer = ScheduleTimer((float)timeout.Value, () => Resolve(visible[0]));
        ShowChoicesUI(visible, optionId => {
            timer.Cancel();
            Resolve(visible.First(c => c.Id == optionId));
        });
    }
    else
    {
        ShowChoicesUI(visible, optionId => Resolve(visible.First(c => c.Id == optionId)));
    }
    return null;
});
```
```cpp [C++]
engine.onChoice([](auto*, auto* block, auto* ctx, auto next) -> CleanupFn {
    std::vector<const RuntimeOption*> visible;
    for (const auto& c : ctx->options())
        if (!c.visible.has_value() || c.visible.value())
            visible.push_back(&c);

    auto timeout = block->props
        ? block->props->timeout : std::nullopt;

    auto resolve = [ctx, next](const std::string& optionId) {
        ctx->selectChoice(optionId);
        next();
    };

    if (timeout.has_value()) {
        // use your engine's timer — cancel on player selection
        auto timer = scheduleDelay(timeout.value(), [&]() { resolve(visible[0]->id); });
        showOptionsUI(visible, [resolve, timer](const auto& optionId) {
            timer->cancel();
            resolve(optionId);
        });
    } else {
        showOptionsUI(visible, resolve);
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
    for c in ctx.options:
        if c.get("visible") != false:
            visible.append(c)

    var timeout_val = block.get("props", {}).get("timeout", 0)

    if timeout_val > 0:
        # use your engine's timer — cancel on player selection
        var timer = get_tree().create_timer(timeout_val)
        timer.timeout.connect(func():
            ctx.select_choice(visible[0]["id"])
            next_fn.call()
        )
        show_options_ui(visible, func(option_id):
            timer.time_left = 0  # cancel
            ctx.select_choice(option_id)
            next_fn.call()
        )
    else:
        show_options_ui(visible, func(option_id):
            ctx.select_choice(option_id)
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
  for (const choice of context.options) {
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
    foreach (var choice in args.Context.Options)
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
    for (const auto& choice : ctx->options()) {
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
    for choice in args["context"].options:
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
  context.selectChoice(context.options[0].id);
  next();
});
```
```csharp [C#]
tutorial.OnChoice(args => {
    // force-select the first choice, no filtering
    args.Context.SelectChoice(args.Context.Options[0].Id);
    args.Next();
    return null;
});
```
```cpp [C++]
tutorial->onChoice([](auto*, auto*, auto* ctx, auto next) -> CleanupFn {
    // force-select the first choice, no filtering
    ctx->selectChoice(ctx->options()[0].id);
    next();
    return {};
});
```
```gdscript [GDScript]
tutorial.on_choice(func(args):
    # force-select the first choice, no filtering
    args["context"].select_choice(args["context"].options[0]["id"])
    args["next"].call()
    return Callable()
)
```
:::

## エバリュエーターの共有

`onResolveCondition` を使えば、1つの callback で choice の可視性と condition block の事前評価の**両方**を処理できます。ロジックを重複させる必要はありません：

<!--@include: ../../_shared/choice-reusable-filter.md-->

::: tip なぜ1つの callback なのか？
`onResolveCondition` 以前は、同じ `gameState.check(...)` ロジックを `onResolveCondition` と `onCondition` に別々に登録する必要がありました。統合リゾルバーでは1つの callback で済みます — engine が両方を自動的に処理します。
:::

## 上級: 手動フィルタリング

グローバルリゾルバーをインストールしたくない場合、`LsdeUtils` がローレベルのユーティリティを提供します：

::: code-group
```ts [TypeScript]
import { LsdeUtils } from '@lsde/dialog-engine';

const offered = LsdeUtils.tagOptionVisibility(
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

`scene` パラメーターを指定すると、`choice:` condition の自動解決が有効になります。指定しない場合、すべての condition は登録されたリゾルバー callback に委任されます。
