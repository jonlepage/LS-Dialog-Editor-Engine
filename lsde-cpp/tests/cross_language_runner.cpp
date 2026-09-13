// Cross-language conformance runner — reads the shared JSON specs and drives the C++ engine.
//
// tests/*.json is the contract: the same input, the same expected output, for all four runtimes.
// The TypeScript runner is the reference this one is written against. A behaviour that only holds
// in one runtime is a divergence waiting to be found by a player.

#include <gtest/gtest.h>
#include <nlohmann/json.hpp>
#include <fstream>
#include <iostream>
#include <algorithm>
#include <memory>
#include <stdexcept>

#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <lsde/condition_evaluator.h>
#include <lsde/utils.h>
#include "test_models.h"
#include "json_deserializer.h"

using namespace lsde;
using namespace lsde::tests;

namespace {

TestFile loadTestFile(const std::string& filename) {
    std::string path = std::string(TEST_DATA_DIR) + "/" + filename;
    std::ifstream f(path);
    if (!f.is_open()) throw std::runtime_error("Cannot open: " + path);
    auto j = nlohmann::json::parse(f);
    return j.get<TestFile>();
}

/// The game's answer to one comparison, from the suite's stateBridge.
///
/// A test on the reserved "choice" dictionary never gets here — the engine answers those from the
/// history it kept during the scene. A key in trueTimes is answered true that many times, then
/// false — a counter a loop can run out of. It outranks conditions for the same key.
ConditionEvaluatorFn makeResolver(const TestSuite& suite) {
    // Shared, not captured by value: the resolver is copied into the engine, and every copy has to
    // count down the same counter.
    auto remaining = std::make_shared<std::unordered_map<std::string, int>>();
    if (suite.stateBridge) *remaining = suite.stateBridge->trueTimes;

    return [&suite, remaining](const ConditionTest& test) -> bool {
        const std::string key = test.dict + "." + test.entry;
        bool answer = true;
        auto counter = remaining->find(key);
        if (counter != remaining->end()) {
            answer = counter->second > 0;
            counter->second--;
        } else if (suite.stateBridge) {
            auto it = suite.stateBridge->conditions.find(key);
            if (it != suite.stateBridge->conditions.end()) answer = it->second;
        }
        return test.op == ConditionOperator::NotEquals ? !answer : answer;
    };
}

struct RunState {
    int stepIndex = 0;
    int cleanupCalls = 0;
};

/// What the suite hands to init(): one payload, or the files of a per-scene export.
InitOptions optionsOf(const TestSuite& suite) {
    InitOptions options;
    if (suite.blueprintFiles) options.files = *suite.blueprintFiles;
    else options.data = suite.blueprint;
    return options;
}

/// An empty file list means "no data at all" in the three other runtimes. Here a payload struct
/// always exists, so there is nothing empty to hand over: the case cannot be expressed, and the
/// runner says so rather than passing a default struct and calling INVALID_FORMAT a match.
bool unexpressibleHere(const TestSuite& suite) {
    return suite.blueprintFiles && suite.blueprintFiles->empty();
}

void executeStepAction(
    const std::optional<StepAction>& action,
    IBaseBlockContext* ctx,
    const std::function<void()>& next) {
    if (!action) return;
    const auto& a = *action;

    if (a.type == "next") {
        next();
    } else if (a.type == "selectChoice") {
        dynamic_cast<IChoiceContext*>(ctx)->selectChoice(a.optionId.value_or(""));
        next();
    } else if (a.type == "resolveCondition") {
        dynamic_cast<IConditionContext*>(ctx)->resolve(a.port.value_or(Ports::Out));
        next();
    } else if (a.type == "resolveAction") {
        dynamic_cast<IActionContext*>(ctx)->resolve();
        next();
    } else if (a.type == "rejectAction") {
        dynamic_cast<IActionContext*>(ctx)->reject(a.error.value_or("test error"));
        next();
    } else if (a.type == "resolveCharacterPort") {
        dynamic_cast<IDialogContext*>(ctx)->resolveCharacterPort(a.cardId.value_or(""));
        next();
    } else if (a.type == "throw") {
        throw std::runtime_error(a.error.value_or("thrown by the spec"));
    }
}

/// One handler body for every block type, consuming the steps in order.
///
/// A block that is not the next expected step still reaches here — an async track, or a block the
/// spec does not assert on — and simply advances.
CleanupFn dispatch(
    const std::string& blockType,
    const BlueprintBlock* block,
    IBaseBlockContext* context,
    const std::function<void()>& next,
    const TestSuite& suite,
    const TestCase& testCase,
    RunState& state) {
    const auto& steps = testCase.steps;
    const TestStep* step =
        state.stepIndex < static_cast<int>(steps.size()) ? &steps[state.stepIndex] : nullptr;

    bool isExpected = step != nullptr
        && step->expect.type == blockType
        && (!step->expect.blockId || *step->expect.blockId == block->id);

    if (!isExpected) {
        // Conditions route themselves from the resolver; an action has to say it succeeded before
        // "then" is followed.
        if (auto* actionCtx = dynamic_cast<IActionContext*>(context)) actionCtx->resolve();
        next();
        return {};
    }

    if (step->expect.text) {
        auto line = block->text.find(suite.locale.value_or("en"));
        EXPECT_NE(line, block->text.end()) << "block " << block->id << " has no text";
        if (line != block->text.end()) EXPECT_EQ(*step->expect.text, line->second);
    }

    if (step->expect.visibleOptionCount) {
        // EXPECT, not ASSERT: gtest ASSERT expands to a bare return, which this function cannot
        // do — it owes the engine a cleanup function.
        auto* choiceCtx = dynamic_cast<IChoiceContext*>(context);
        EXPECT_NE(choiceCtx, nullptr);
        if (choiceCtx != nullptr) {
            int offered = 0;
            for (const auto& option : choiceCtx->options()) {
                if (option.visible.value_or(true)) offered++;
            }
            EXPECT_EQ(*step->expect.visibleOptionCount, offered);
        }
    }

    if (step->expect.characterId) {
        const Card* character = context->character();
        EXPECT_NE(character, nullptr) << "block " << block->id << " has no character";
        if (character != nullptr) EXPECT_EQ(*step->expect.characterId, character->id);
    }

    state.stepIndex++;
    executeStepAction(step->action, context, next);
    return [&state]() { state.cleanupCalls++; };
}

void runFlowCase(const TestSuite& suite, const TestCase& testCase) {
    DialogueEngine engine;
    auto report = engine.init(optionsOf(suite));
    ASSERT_TRUE(report.errors.empty())
        << "suite " << suite.id << " failed to load: " << report.errors[0].message;

    engine.setLocale(suite.locale.value_or("en"));
    engine.onResolveCondition(makeResolver(suite));

    RunState state;
    std::vector<SceneContext> exits;
    engine.onSceneExit([&exits](const SceneLifecycleArgs& args) { exits.push_back(args.context); });

    engine.onDialog([&](ISceneHandle*, const BlueprintBlock* b, IDialogContext* c, std::function<void()> next) {
        return dispatch(BlockType::Dialog, b, c, next, suite, testCase, state);
    });
    engine.onChoice([&](ISceneHandle*, const BlueprintBlock* b, IChoiceContext* c, std::function<void()> next) {
        return dispatch(BlockType::Choice, b, c, next, suite, testCase, state);
    });
    engine.onCondition([&](ISceneHandle*, const BlueprintBlock* b, IConditionContext* c, std::function<void()> next) {
        return dispatch(BlockType::Condition, b, c, next, suite, testCase, state);
    });
    engine.onAction([&](ISceneHandle*, const BlueprintBlock* b, IActionContext* c, std::function<void()> next) {
        return dispatch(BlockType::Action, b, c, next, suite, testCase, state);
    });

    auto handle = engine.scene(suite.sceneId.value_or(""));

    // A fault reaches whoever called start() — once the scene is closed. Caught here so that
    // everything after it can be checked, not only that it threw. An exception the spec did not
    // expect is re-thrown as it was.
    std::exception_ptr thrown = nullptr;
    try {
        handle->start();
    } catch (...) {
        thrown = std::current_exception();
    }
    if (thrown && !testCase.expectedThrow) std::rethrow_exception(thrown);
    EXPECT_EQ(testCase.expectedThrow, static_cast<bool>(thrown));

    // Every step the spec described must have been reached.
    EXPECT_EQ(static_cast<int>(testCase.steps.size()), state.stepIndex);
    EXPECT_EQ(testCase.expectedRunning, handle->isRunning());

    if (testCase.expectedExitReason) {
        ASSERT_EQ(1u, exits.size());
        EXPECT_EQ(*testCase.expectedExitReason, exits[0].reason.value_or(""));
    }

    if (testCase.expectedWaitingFor) {
        ASSERT_FALSE(exits.empty());
        EXPECT_EQ(*testCase.expectedWaitingFor, exits[0].waitingFor);
    }

    if (testCase.expectedVisited) {
        std::vector<std::string> visited = handle->getVisitedBlocks();
        std::vector<std::string> expected = *testCase.expectedVisited;
        if (testCase.orderIndependent.value_or(false)) {
            std::sort(visited.begin(), visited.end());
            std::sort(expected.begin(), expected.end());
        }
        EXPECT_EQ(expected, visited);
    }

    if (testCase.expectedCleanupCalls) {
        EXPECT_EQ(*testCase.expectedCleanupCalls, state.cleanupCalls);
    }
}

void runValidationCase(const TestSuite& suite, const TestCase& testCase) {
    DialogueEngine engine;
    auto report = engine.init(optionsOf(suite));

    auto codesOf = [](const std::vector<DiagnosticEntry>& entries) {
        std::vector<std::string> codes;
        for (const auto& entry : entries) codes.push_back(entry.code);
        return codes;
    };

    if (testCase.expectedErrors) {
        auto codes = codesOf(report.errors);
        if (testCase.expectedErrors->empty()) {
            EXPECT_TRUE(codes.empty())
                << "expected no error, got " << (codes.empty() ? "" : codes[0]);
        } else {
            for (const auto& code : *testCase.expectedErrors) {
                EXPECT_NE(std::find(codes.begin(), codes.end(), code), codes.end())
                    << "missing error " << code;
            }
        }
    }

    if (testCase.expectedWarnings) {
        auto codes = codesOf(report.warnings);
        if (testCase.expectedWarnings->empty()) {
            EXPECT_TRUE(codes.empty())
                << "expected no warning, got " << (codes.empty() ? "" : codes[0]);
        } else {
            for (const auto& code : *testCase.expectedWarnings) {
                EXPECT_NE(std::find(codes.begin(), codes.end(), code), codes.end())
                    << "missing warning " << code;
            }
        }
    }

    if (testCase.expectedStats) {
        EXPECT_EQ(testCase.expectedStats->sceneCount, report.stats.sceneCount);
        EXPECT_EQ(testCase.expectedStats->blockCount, report.stats.blockCount);
        EXPECT_EQ(testCase.expectedStats->connectionCount, report.stats.connectionCount);
    }
}

} // namespace

// ─── The three spec files ────────────────────────────────────────────────────

TEST(CrossLanguage, PlaysEverySceneInTestCases) {
    auto spec = loadTestFile("test-cases.json");
    ASSERT_FALSE(spec.suites.empty());

    for (const auto& suite : spec.suites) {
        for (const auto& testCase : suite.cases) {
            SCOPED_TRACE(suite.id + " / " + testCase.id);
            runFlowCase(suite, testCase);
        }
    }
}

TEST(CrossLanguage, RoutesEveryPortInTestPortRouting) {
    auto spec = loadTestFile("test-port-routing.json");
    ASSERT_FALSE(spec.suites.empty());

    for (const auto& suite : spec.suites) {
        for (const auto& testCase : suite.cases) {
            SCOPED_TRACE(suite.id + " / " + testCase.id);
            runFlowCase(suite, testCase);
        }
    }
}

TEST(CrossLanguage, ReportsWhatTestInitValidationExpects) {
    auto spec = loadTestFile("test-init-validation.json");
    ASSERT_FALSE(spec.suites.empty());

    for (const auto& suite : spec.suites) {
        if (unexpressibleHere(suite)) {
            std::cout << "  [skipped] " << suite.id << ": an empty file list cannot be expressed in C++\n";
            continue;
        }
        for (const auto& testCase : suite.cases) {
            SCOPED_TRACE(suite.id + " / " + testCase.id);
            runValidationCase(suite, testCase);
        }
    }
}
