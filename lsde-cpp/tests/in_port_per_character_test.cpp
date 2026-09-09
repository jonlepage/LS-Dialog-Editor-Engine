// LSDE Dialog Engine — inPortPerCharacter (C++ port of in-port-per-character.test.ts)
//
// The wire names the actor, and BOTH places that ask the game about a character must be told
// which one: the handler's context, and the onValidateNextBlock gate. Passing the entry port to
// only one of them is not a cosmetic slip — a game gating on "is this character here?" was
// answered about whichever actor the whole cast produced, which for a resolver written as
// `actors[0]` is the FIRST one, every single pass.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <functional>
#include <string>
#include <vector>

using namespace lsde;

namespace {

/// "<none>" stands for a null character, so a list of ids can say "nobody" too.
const std::string kNone = "<none>";

BlueprintBlock block(const std::string& id, const std::string& type) {
    BlueprintBlock b;
    b.id = id;
    b.key = "__blueprints__.s1." + id;
    b.type = type;
    return b;
}

ConditionTest test(const std::string& entry) {
    ConditionTest t;
    t.dict = "party";
    t.entry = entry;
    t.op = ConditionOperator::Equals;
    t.value = true;
    return t;
}

ConditionCase whenCase(const std::string& port, std::vector<ConditionTest> tests) {
    ConditionCase c;
    c.port = port;
    c.when = std::move(tests);
    return c;
}

BlueprintExport blueprint(std::vector<BlueprintBlock> blocks, const std::string& start) {
    BlueprintScene scene;
    scene.scene = "s1";
    scene.id = "sc_test0001";
    scene.start = start;
    scene.blocks = std::move(blocks);

    BlueprintExport bp;
    bp.format = "lsde-blueprints";
    bp.version = 1;
    bp.generator = Generator{"LSDE", "2.0.3"};
    bp.exportedAt = "2026-09-07T00:00:00.000Z";
    bp.project = "Test";
    bp.locales = {"en"};
    bp.referenceLocale = "en";
    bp.cards = {Card{"l1", "bran", CardRole::Characters}, Card{"l2", "ada", CardRole::Characters}};
    bp.scenes.push_back(std::move(scene));
    return bp;
}

/// A router whose two routes reach the SAME block through two entry ports.
BlueprintExport payload() {
    auto router = block("ROUTER-001", BlockType::Router);
    router.cases = {whenCase("K1", {test("l1")}), whenCase("K2", {test("l2")})};
    router.next = {Link{"K1", "DIALOG-009", "l1"}, Link{"K2", "DIALOG-009", "l2"}};

    auto line = block("DIALOG-009", BlockType::Dialog);
    line.actors = {"l1", "l2"};
    line.props["isAsync"] = true;
    line.props["inPortPerCharacter"] = true;

    return blueprint({router, line}, "ROUTER-001");
}

void registerBase(DialogueEngine& engine) {
    engine.onResolveCondition([](const ConditionTest&) { return true; });
    engine.onResolveCharacter([](const std::vector<Card>& actors) -> const Card* {
        return actors.empty() ? nullptr : &actors[0];
    });
    engine.onChoice([](ISceneHandle*, const BlueprintBlock*, IChoiceContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onAction([](ISceneHandle*, const BlueprintBlock*, IActionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
}

std::string idOf(const Card* card) { return card ? card->id : kNone; }

using Ids = std::vector<std::string>;

} // namespace

TEST(InPortPerCharacter, OffersTheWiredActorToOnValidateNextBlockAndToTheHandler) {
    Ids gate;
    Ids spoke;

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({payload()}).errors.empty());
    registerBase(engine);
    engine.onValidateNextBlock([&gate](const ValidateNextBlockArgs& args) {
        if (args.nextBlock->id == "DIALOG-009") gate.push_back(idOf(args.nextContext.character));
        return ValidationResult::ok();
    });
    engine.onDialog([&spoke](ISceneHandle*, const BlueprintBlock*, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        spoke.push_back(idOf(ctx->character()));
        next();
        return {};
    });

    engine.scene("s1")->start();

    EXPECT_EQ(spoke, Ids({"l1", "l2"}));
    EXPECT_EQ(gate, Ids({"l1", "l2"}));
}

TEST(InPortPerCharacter, TheCastStaysWholeOnlyTheCharacterFollowsTheDoor) {
    std::vector<size_t> casts;

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({payload()}).errors.empty());
    registerBase(engine);
    engine.onDialog([&casts](ISceneHandle*, const BlueprintBlock*, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        casts.push_back(ctx->actors().size());
        next();
        return {};
    });

    engine.scene("s1")->start();

    // `actors()` is the list posted on the block, unchanged by the door.
    EXPECT_EQ(casts, std::vector<size_t>({2, 2}));
}

TEST(InPortPerCharacter, EnteringThroughInNamesNobodyAndOffersTheWholeCast) {
    std::vector<size_t> offered;
    Ids spoke;

    auto first = block("DIALOG-001", BlockType::Dialog);
    first.next = {Link{Ports::Out, "DIALOG-009", "in"}};
    auto line = block("DIALOG-009", BlockType::Dialog);
    line.actors = {"l1", "l2"};
    line.props["inPortPerCharacter"] = true;

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({blueprint({first, line}, "DIALOG-001")}).errors.empty());
    registerBase(engine);
    engine.onResolveCharacter([&offered](const std::vector<Card>& actors) -> const Card* {
        offered.push_back(actors.size());
        return actors.empty() ? nullptr : &actors[0];
    });
    engine.onDialog([&spoke](ISceneHandle*, const BlueprintBlock*, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        spoke.push_back(idOf(ctx->character()));
        next();
        return {};
    });

    engine.scene("s1")->start();

    // DIALOG-001 cites nobody (0 offered); DIALOG-009 was entered through "in", so the whole cast
    // (2) is offered and the default picks the first.
    EXPECT_EQ(offered, std::vector<size_t>({0, 2}));
    EXPECT_EQ(spoke, Ids({kNone, "l1"}));
}

TEST(InPortPerCharacter, TheGameMayAnswerThatTheCharacterDoesNotExist) {
    Ids spoke;

    DialogueEngine engine;
    ASSERT_TRUE(engine.init({payload()}).errors.empty());
    registerBase(engine);
    engine.onResolveCharacter([](const std::vector<Card>&) -> const Card* { return nullptr; });
    engine.onDialog([&spoke](ISceneHandle*, const BlueprintBlock*, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        spoke.push_back(idOf(ctx->character()));
        next();
        return {};
    });

    engine.scene("s1")->start();

    // The engine ASKS; it never decides on its own. Both passes still play.
    EXPECT_EQ(spoke, Ids({kNone, kNone}));
}
