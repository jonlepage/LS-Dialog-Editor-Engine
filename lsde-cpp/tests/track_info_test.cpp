// LSDE Dialog Engine — TrackInfo and the cancel cascade (C++ port of the "TrackInfo" and
// "cancel cascade" suites of multitrack.test.ts)
//
// getTrackInfos() and getActiveTracks() expose the PARALLEL tracks, for debug and rendering. The
// main flow, id 0, is not one of them. Track ids count up from 1 and never repeat within a scene;
// parentTrackId is -1 when the main flow opened the track.
//
// Child tracks SURVIVE the natural end of their parent: only an explicit cancel() cascades.

#include <gtest/gtest.h>
#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <algorithm>
#include <functional>
#include <set>
#include <string>
#include <vector>

using namespace lsde;

namespace {

BlueprintBlock dialog(const std::string& id) {
    BlueprintBlock b;
    b.id = id;
    b.key = "__blueprints__.s1." + id;
    b.type = BlockType::Dialog;
    return b;
}

BlueprintBlock beside(const std::string& id) {
    auto b = dialog(id);
    b.props["isAsync"] = true;
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

/// Register handlers that hold every block in `held` open — never calling next() — and advance
/// the rest at once. Each dialog's cleanup records its id in `cleaned`.
void registerHolding(DialogueEngine& engine, std::set<std::string> held, std::vector<std::string>& cleaned) {
    engine.onChoice([](ISceneHandle*, const BlueprintBlock*, IChoiceContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onCondition([](ISceneHandle*, const BlueprintBlock*, IConditionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onAction([](ISceneHandle*, const BlueprintBlock*, IActionContext*, std::function<void()> next) -> CleanupFn {
        next(); return {};
    });
    engine.onDialog([held, &cleaned](ISceneHandle*, const BlueprintBlock* b, IDialogContext*, std::function<void()> next) -> CleanupFn {
        std::string id = b->id;
        if (held.count(id) == 0) next();
        return [id, &cleaned]() { cleaned.push_back(id); };
    });
}

/// FORK → MAIN (held) and SIDE (isAsync). `side` is the SIDE block, so a test can wire it further.
BlueprintExport forkScene(BlueprintBlock side, std::vector<BlueprintBlock> more = {}) {
    auto fork = dialog("FORK");
    wire(fork, "MAIN");
    wire(fork, "SIDE");
    std::vector<BlueprintBlock> blocks = {fork, dialog("MAIN"), side};
    for (auto& b : more) blocks.push_back(b);
    return oneScene(std::move(blocks));
}

bool contains(const std::vector<std::string>& list, const std::string& id) {
    return std::find(list.begin(), list.end(), id) != list.end();
}

} // namespace

TEST(TrackInfo, GetTrackInfosReturnsCorrectDataForRunningTracks) {
    std::vector<std::string> cleaned;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({forkScene(beside("SIDE"))}).errors.empty());
    registerHolding(engine, {"MAIN", "SIDE"}, cleaned);

    auto handle = engine.scene("s1");
    handle->start();

    auto infos = handle->getTrackInfos();
    ASSERT_EQ(infos.size(), 1u);
    EXPECT_EQ(infos[0].id, 1);
    EXPECT_EQ(infos[0].parentTrackId, -1);
    EXPECT_EQ(infos[0].startBlockId, "SIDE");
    EXPECT_EQ(infos[0].currentBlockId, "SIDE");
    EXPECT_TRUE(infos[0].running);
}

TEST(TrackInfo, SubTrackParentTrackIdMatchesParentTrackId) {
    std::vector<std::string> cleaned;
    auto side = beside("SIDE");
    wire(side, "SUB");
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({forkScene(side, {beside("SUB")})}).errors.empty());
    registerHolding(engine, {"MAIN", "SUB"}, cleaned);

    auto handle = engine.scene("s1");
    handle->start();

    // SIDE opened SUB and then ran out of graph, so SUB is the one still running — and it names
    // SIDE's id (1) as its parent, not the main flow.
    auto infos = handle->getTrackInfos();
    ASSERT_EQ(infos.size(), 1u);
    EXPECT_EQ(infos[0].id, 2);
    EXPECT_EQ(infos[0].parentTrackId, 1);
    EXPECT_EQ(infos[0].startBlockId, "SUB");
}

TEST(TrackInfo, AnEndedTrackDoesNotAppearInGetTrackInfos) {
    std::vector<std::string> cleaned;
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({forkScene(beside("SIDE"))}).errors.empty());
    registerHolding(engine, {"MAIN"}, cleaned);

    auto handle = engine.scene("s1");
    handle->start();

    // SIDE answered at once and ended; MAIN is still holding the scene open.
    EXPECT_TRUE(handle->isRunning());
    EXPECT_TRUE(handle->getTrackInfos().empty());
    EXPECT_EQ(handle->getActiveTracks(), 0);
}

TEST(TrackInfo, ExplicitCancelCascadesToChildTracksButANaturalEndDoesNot) {
    std::vector<std::string> cleaned;
    auto side = beside("SIDE");
    wire(side, "SUB");
    DialogueEngine engine;
    ASSERT_TRUE(engine.init({forkScene(side, {beside("SUB")})}).errors.empty());
    registerHolding(engine, {"MAIN", "SUB"}, cleaned);

    auto handle = engine.scene("s1");
    handle->start();

    // SIDE ended naturally after opening SUB: SUB survives.
    EXPECT_EQ(handle->getActiveTracks(), 1);
    EXPECT_FALSE(contains(cleaned, "SUB"));

    // An explicit cancel() tears everything down, SUB included.
    handle->cancel();
    EXPECT_EQ(handle->getActiveTracks(), 0);
    EXPECT_TRUE(contains(cleaned, "SUB"));
    EXPECT_TRUE(contains(cleaned, "MAIN"));
    EXPECT_FALSE(handle->isRunning());
}
