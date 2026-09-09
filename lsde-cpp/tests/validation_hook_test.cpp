// LSDE Dialog Engine — onValidateNextBlock and onBeforeBlock (C++ port of the "onValidateNextBlock"
// and "onBeforeBlock" suites of scene-handle.test.ts)
//
// The gate is asked about the RESOLVED character of the block about to run, and told about the
// one just left. The character comes from onResolveCharacter, before the gate is invoked; a block
// that cites no actor has none.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <functional>
#include <optional>
#include <string>
#include <vector>

using namespace lsde;

namespace {

const std::string kNone = "<none>";

BlueprintBlock dialog(const std::string& id) {
    BlueprintBlock b;
    b.id = id;
    b.key = "__blueprints__.s1." + id;
    b.type = BlockType::Dialog;
    return b;
}

BlueprintBlock& wire(BlueprintBlock& b, const std::string& to) {
    b.next.push_back(Link{Ports::Out, to, "in"});
    return b;
}

BlueprintExport oneScene(std::vector<BlueprintBlock> blocks) {
    BlueprintScene scene;
    scene.scene = "s1";
    scene.id = "sc_test0001";
    if (!blocks.empty()) scene.start = blocks[0].id;
    scene.blocks = std::move(blocks);

    BlueprintExport bp;
    bp.format = "lsde-blueprints";
    bp.version = 1;
    bp.generator = Generator{"LSDE", "2.0.3"};
    bp.exportedAt = "2026-09-07T00:00:00.000Z";
    bp.project = "Test";
    bp.locales = {"en"};
    bp.referenceLocale = "en";
    bp.scenes.push_back(std::move(scene));
    return bp;
}

/// b1 cites c1 and leads to b2, which cites nobody.
BlueprintExport withCast() {
    auto b1 = dialog("b1");
    b1.actors = {"c1"};
    wire(b1, "b2");
    auto bp = oneScene({b1, dialog("b2")});
    bp.cards = {Card{"c1", "kael", CardRole::Characters}};
    return bp;
}

void registerAll(DialogueEngine& engine) {
    engine.onDialog([](ISceneHandle*, const BlueprintBlock*, IDialogContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onChoice([](ISceneHandle*, const BlueprintBlock*, IChoiceContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onCondition([](ISceneHandle*, const BlueprintBlock*, IConditionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onAction([](ISceneHandle*, const BlueprintBlock*, IActionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
}

std::string idOf(const Card* card) { return card ? card->id : kNone; }

using Ids = std::vector<std::string>;

} // namespace

TEST(ValidationHook, OnValidateNextBlockReceivesTheResolvedCharacterOfTheNextBlock) {
    Ids seen;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({withCast()}).errors.empty());
    registerAll(engine);
    engine.onValidateNextBlock([&seen](const ValidateNextBlockArgs& args) {
        seen.push_back(idOf(args.nextContext.character));
        return ValidationResult::ok();
    });

    engine.scene("s1")->start();

    // b1 cites c1; b2 cites nobody.
    EXPECT_EQ(seen, Ids({"c1", kNone}));
}

TEST(ValidationHook, FromContextIsAbsentOnTheFirstBlock) {
    Ids fromBlocks;
    std::vector<bool> fromContexts;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({withCast()}).errors.empty());
    registerAll(engine);
    engine.onValidateNextBlock([&](const ValidateNextBlockArgs& args) {
        fromBlocks.push_back(args.fromBlock ? args.fromBlock->id : kNone);
        fromContexts.push_back(args.hasFromContext);
        return ValidationResult::ok();
    });

    engine.scene("s1")->start();

    EXPECT_EQ(fromBlocks, Ids({kNone, "b1"}));
    EXPECT_EQ(fromContexts, std::vector<bool>({false, true}));
}

TEST(ValidationHook, FromContextCarriesTheCharacterOfTheBlockJustLeft) {
    Ids fromCharacters;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({withCast()}).errors.empty());
    registerAll(engine);
    engine.onValidateNextBlock([&fromCharacters](const ValidateNextBlockArgs& args) {
        if (args.hasFromContext) fromCharacters.push_back(idOf(args.fromContext.character));
        return ValidationResult::ok();
    });

    engine.scene("s1")->start();

    EXPECT_EQ(fromCharacters, Ids({"c1"}));
}

TEST(ValidationHook, OnBeforeBlockHandsOverTheNativePropertiesReadOutOfProps) {
    std::optional<NativeProperties> natives;
    auto b1 = dialog("b1");
    b1.props["delay"] = 250.0;
    b1.props["timeout"] = 5000.0;
    b1.props["waitInput"] = true;
    b1.props["portraitSide"] = std::string("left");

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({oneScene({b1})}).errors.empty());
    registerAll(engine);
    engine.onBeforeBlock([&natives](const BeforeBlockArgs& args) {
        if (args.context.nativeProperties) natives = *args.context.nativeProperties;
        args.resolve();
    });

    engine.scene("s1")->start();

    ASSERT_TRUE(natives.has_value());
    EXPECT_EQ(natives->delay, 250.0);
    EXPECT_EQ(natives->timeout, 5000.0);
    EXPECT_EQ(natives->waitInput, true);
    EXPECT_FALSE(natives->isAsync.has_value());
}
