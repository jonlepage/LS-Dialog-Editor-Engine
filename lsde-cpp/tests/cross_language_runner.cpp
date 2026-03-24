// Cross-language test runner — reads JSON test specs and executes against the C++ engine.

#include <gtest/gtest.h>
#include <nlohmann/json.hpp>
#include <fstream>
#include <algorithm>

#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include "test_models.h"
#include "json_deserializer.h"

using namespace lsde;
using namespace lsde::tests;

// ─── TestStateBridge ─────────────────────────────────────────────────────────

class TestStateBridge : public IStateBridge {
    StateBridgeConfig _config;
public:
    explicit TestStateBridge(const std::optional<StateBridgeConfig>& config)
        : _config(config.value_or(StateBridgeConfig{})) {}

    bool evaluateCondition(const ExportCondition& condition) override {
        auto it = _config.conditions.find(condition.key);
        return it != _config.conditions.end() ? it->second : true;
    }

    void executeAction(const ExportAction& action, const ActionSignature*) override {
        auto it = _config.actions.find(action.actionId);
        if (it != _config.actions.end() && it->second == "fail") {
            throw std::runtime_error("Action " + action.actionId + " failed");
        }
    }

    PropertyValue resolveDictionary(const std::string& group, const std::string& key) override {
        auto k = group + "." + key;
        auto it = _config.dictionaries.find(k);
        return it != _config.dictionaries.end() ? PropertyValue{it->second} : PropertyValue{std::string{}};
    }

    const BlockCharacter* resolveCharacter(const std::vector<BlockCharacter>& characters) override {
        return characters.empty() ? nullptr : &characters[0];
    }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

static TestFile loadTestFile(const std::string& filename) {
    std::string path = std::string(TEST_DATA_DIR) + "/" + filename;
    std::ifstream f(path);
    if (!f.is_open()) throw std::runtime_error("Cannot open: " + path);
    auto j = nlohmann::json::parse(f);
    return j.get<TestFile>();
}

struct TestState {
    int stepIndex = 0;
    int cleanupCalls = 0;
};

static void executeStepAction(const std::optional<StepAction>& action, IBaseBlockContext* ctx, std::function<void()> next) {
    if (!action) return;
    const auto& a = *action;
    if (a.type == "next") { next(); }
    else if (a.type == "selectChoice") { dynamic_cast<IChoiceContext*>(ctx)->selectChoice(*a.choiceUuid); next(); }
    else if (a.type == "resolve") { dynamic_cast<IConditionContext*>(ctx)->resolve(a.value.value_or(true)); next(); }
    else if (a.type == "resolveAction") { dynamic_cast<IActionContext*>(ctx)->resolve(); next(); }
    else if (a.type == "rejectAction") { dynamic_cast<IActionContext*>(ctx)->reject(a.error.value_or("test error")); next(); }
    else if (a.type == "resolveCharacterPort") {
        auto name = a.characterName ? *a.characterName : (a.name ? *a.name : std::string{});
        dynamic_cast<IDialogContext*>(ctx)->resolveCharacterPort(name);
        next();
    }
}

static CleanupFn handleStep(
    const std::string& blockType,
    const BlueprintBlock* block,
    IBaseBlockContext* context,
    std::function<void()> next,
    const std::vector<TestStep>& steps,
    TestState& state)
{
    const TestStep* step = state.stepIndex < static_cast<int>(steps.size()) ? &steps[state.stepIndex] : nullptr;

    if (step && step->expect.type == blockType
        && (!step->expect.blockUuid || *step->expect.blockUuid == block->uuid)) {
        state.stepIndex++;
        executeStepAction(step->action, context, next);
    } else {
        next();
    }

    return [&state]() { state.cleanupCalls++; };
}

// ─── Flow Test Param ─────────────────────────────────────────────────────────

struct FlowTestParam {
    std::string displayName;
    TestSuite suite;
    TestCase testCase;
};

class CrossLanguageFlowTest : public ::testing::TestWithParam<FlowTestParam> {};

TEST_P(CrossLanguageFlowTest, Run) {
    auto& p = GetParam();
    auto& suite = p.suite;
    auto& tc = p.testCase;

    DialogueEngine engine;
    auto report = engine.init({suite.blueprint});
    ASSERT_TRUE(report.errors.empty()) << "Init errors for " << p.displayName;

    engine.setLocale(suite.locale.value_or("en"));
    TestStateBridge bridge(suite.stateBridge);
    engine.setStateBridge(&bridge);

    auto& steps = tc.steps;
    TestState state;

    std::unordered_set<std::string> stepTypes;
    for (const auto& s : steps) stepTypes.insert(s.expect.type);

    auto handle = engine.scene(*suite.sceneId);

    if (stepTypes.count("DIALOG")) {
        handle->onDialog([&](ISceneHandle*, const DialogBlock* block, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
            return handleStep("DIALOG", block, ctx, std::move(next), steps, state);
        });
    }

    if (stepTypes.count("CHOICE")) {
        handle->onChoice([&](ISceneHandle*, const ChoiceBlock* block, IChoiceContext* ctx, std::function<void()> next) -> CleanupFn {
            auto* step = state.stepIndex < static_cast<int>(steps.size()) ? &steps[state.stepIndex] : nullptr;
            if (step && step->expect.type == "CHOICE"
                && (!step->expect.blockUuid || *step->expect.blockUuid == block->uuid)) {
                if (step->expect.visibleChoiceCount) {
                    EXPECT_EQ(*step->expect.visibleChoiceCount, static_cast<int>(ctx->choices().size()));
                }
            }
            return handleStep("CHOICE", block, ctx, std::move(next), steps, state);
        });
    }

    if (stepTypes.count("CONDITION")) {
        handle->onCondition([&](ISceneHandle*, const ConditionBlock* block, IConditionContext* ctx, std::function<void()> next) -> CleanupFn {
            return handleStep("CONDITION", block, ctx, std::move(next), steps, state);
        });
    }

    if (stepTypes.count("ACTION")) {
        handle->onAction([&](ISceneHandle*, const ActionBlock* block, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
            return handleStep("ACTION", block, ctx, std::move(next), steps, state);
        });
    }

    handle->start();

    EXPECT_FALSE(handle->isRunning());

    if (!tc.expectedVisited.empty()) {
        std::vector<std::string> visited(handle->getVisitedBlocks().begin(), handle->getVisitedBlocks().end());
        if (tc.orderIndependent && *tc.orderIndependent) {
            std::sort(visited.begin(), visited.end());
            auto expected = tc.expectedVisited;
            std::sort(expected.begin(), expected.end());
            EXPECT_EQ(expected, visited);
        } else {
            EXPECT_EQ(tc.expectedVisited, visited);
        }
    }

    if (tc.expectedCleanupCalls) {
        EXPECT_EQ(*tc.expectedCleanupCalls, state.cleanupCalls);
    }
}

// ─── Validation Test Param ───────────────────────────────────────────────────

struct ValidationTestParam {
    std::string displayName;
    TestSuite suite;
    TestCase testCase;
};

class CrossLanguageValidationTest : public ::testing::TestWithParam<ValidationTestParam> {};

TEST_P(CrossLanguageValidationTest, Run) {
    auto& p = GetParam();
    auto& suite = p.suite;
    auto& tc = p.testCase;

    DialogueEngine engine;
    auto report = engine.init({suite.blueprint});

    if (!tc.expectedErrors.empty()) {
        std::vector<std::string> errorCodes;
        for (const auto& e : report.errors) errorCodes.push_back(e.code);
        for (const auto& code : tc.expectedErrors) {
            EXPECT_NE(std::find(errorCodes.begin(), errorCodes.end(), code), errorCodes.end())
                << "Missing error: " << code;
        }
    } else if (tc.expectedErrors.empty() && tc.expectedStats.has_value()) {
        // expectedErrors explicitly empty = expect no errors
        EXPECT_TRUE(report.errors.empty());
    }

    if (!tc.expectedWarnings.empty()) {
        std::vector<std::string> warningCodes;
        for (const auto& w : report.warnings) warningCodes.push_back(w.code);
        for (const auto& code : tc.expectedWarnings) {
            EXPECT_NE(std::find(warningCodes.begin(), warningCodes.end(), code), warningCodes.end())
                << "Missing warning: " << code;
        }
    } else if (tc.expectedWarnings.empty() && tc.expectedStats.has_value()) {
        EXPECT_TRUE(report.warnings.empty());
    }

    if (tc.expectedStats) {
        EXPECT_EQ(tc.expectedStats->sceneCount, report.stats.sceneCount);
        EXPECT_EQ(tc.expectedStats->blockCount, report.stats.blockCount);
        EXPECT_EQ(tc.expectedStats->connectionCount, report.stats.connectionCount);
    }
}

// ─── Test generation ─────────────────────────────────────────────────────────

static std::string sanitize(const std::string& s) {
    std::string r;
    for (char c : s) r += (std::isalnum(c) || c == '_') ? c : '_';
    return r;
}

static std::vector<FlowTestParam> loadFlowParams(const std::string& filename) {
    std::vector<FlowTestParam> params;
    auto tf = loadTestFile(filename);
    for (const auto& suite : tf.suites) {
        for (const auto& tc : suite.cases) {
            params.push_back({suite.id + "/" + tc.id, suite, tc});
        }
    }
    return params;
}

static std::vector<ValidationTestParam> loadValidationParams(const std::string& filename) {
    std::vector<ValidationTestParam> params;
    auto tf = loadTestFile(filename);
    for (const auto& suite : tf.suites) {
        for (const auto& tc : suite.cases) {
            params.push_back({suite.id + "/" + tc.id, suite, tc});
        }
    }
    return params;
}

INSTANTIATE_TEST_SUITE_P(TestCases, CrossLanguageFlowTest,
    ::testing::ValuesIn(loadFlowParams("test-cases.json")),
    [](const auto& info) { return sanitize(info.param.displayName); });

INSTANTIATE_TEST_SUITE_P(PortRouting, CrossLanguageFlowTest,
    ::testing::ValuesIn(loadFlowParams("test-port-routing.json")),
    [](const auto& info) { return sanitize(info.param.displayName); });

INSTANTIATE_TEST_SUITE_P(InitValidation, CrossLanguageValidationTest,
    ::testing::ValuesIn(loadValidationParams("test-init-validation.json")),
    [](const auto& info) { return sanitize(info.param.displayName); });
