// LSDE Dialog Engine — Playground (C++ port of playground.ts)

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <lsde/utils.h>

// Include JSON deserializer (same as tests)
// In a real project this would be a shared library
#include "../../tests/json_deserializer.h"
#include "../../tests/json_deserializer.cpp"

using namespace lsde;

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const char* R = "\x1b[0m";
std::string Red(const std::string& s) { return "\x1b[31m" + s + R; }
std::string Green(const std::string& s) { return "\x1b[32m" + s + R; }
std::string Yellow(const std::string& s) { return "\x1b[33m" + s + R; }
std::string Blue(const std::string& s) { return "\x1b[34m" + s + R; }
std::string Magenta(const std::string& s) { return "\x1b[35m" + s + R; }
std::string Cyan(const std::string& s) { return "\x1b[36m" + s + R; }
std::string White(const std::string& s) { return "\x1b[37m" + s + R; }
std::string Dim(const std::string& s) { return "\x1b[2m" + s + R; }
std::string Bold(const std::string& s) { return "\x1b[1m" + s + R; }
std::string Gray(const std::string& s) { return "\x1b[90m" + s + R; }

std::string Label(const BlueprintBlock& b) {
    return b.label.value_or(b.uuid.substr(0, std::min<size_t>(8, b.uuid.size())));
}

// ─── StateBridge ─────────────────────────────────────────────────────────────

class PlaygroundBridge : public IStateBridge {
public:
    bool evaluateCondition(const ExportCondition& c) override {
        std::cout << Gray("       [bridge] eval: " + c.key + " " + c.op + " " + c.value + " -> true") << "\n";
        return true;
    }
    void executeAction(const ExportAction& a, const ActionSignature* sig) override {
        std::cout << Gray("       [bridge] exec: " + (sig ? sig->label.value_or(a.actionId) : a.actionId) + "()") << "\n";
    }
    PropertyValue resolveDictionary(const std::string& group, const std::string& key) override {
        return std::string(group + "." + key);
    }
};

// ─── Main ────────────────────────────────────────────────────────────────────

int main(int argc, char* argv[]) {
    // Find blueprint
    std::string blueprintPath;
    if (argc > 1) {
        blueprintPath = argv[1];
    } else {
        // Try to find blueprints/blueprint.json walking up
        std::string dir = ".";
        for (int i = 0; i < 8; i++) {
            std::string candidate = dir + "/blueprints/blueprint.json";
            std::ifstream test(candidate);
            if (test.good()) { blueprintPath = candidate; break; }
            dir += "/..";
        }
    }

    if (blueprintPath.empty()) {
        std::cout << "Usage: lsde_playground <blueprint.json>\n";
        return 1;
    }

    std::ifstream f(blueprintPath);
    if (!f.is_open()) { std::cerr << "Cannot open: " << blueprintPath << "\n"; return 1; }
    auto j = nlohmann::json::parse(f);
    auto blueprint = j.get<BlueprintExport>();

    std::cout << Dim("Loaded: " + blueprintPath) << "\n";

    // Init engine
    DialogueEngine engine;
    auto report = engine.init({blueprint});

    std::cout << Bold(Cyan("Init")) << " Errors: "
              << (report.errors.empty() ? Green("0") : Red(std::to_string(report.errors.size()))) << "\n";
    std::cout << Dim("     Stats: " + std::to_string(report.stats.sceneCount) + " scenes, "
        + std::to_string(report.stats.blockCount) + " blocks, "
        + std::to_string(report.stats.connectionCount) + " connections") << "\n";

    if (!report.errors.empty()) {
        for (const auto& e : report.errors)
            std::cout << Red("  [" + e.code + "] " + e.message) << "\n";
        return 1;
    }

    std::string locale = blueprint.primaryLanguage.value_or("en");
    engine.setLocale(locale);
    PlaygroundBridge bridge;
    engine.setStateBridge(&bridge);

    int choiceCount = 0;

    // Handlers
    engine.onDialog([&](ISceneHandle*, const BlueprintBlock* block, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        auto* ch = ctx->character();
        auto charStr = ch ? Magenta(ch->name) + " " + Dim("(" + ch->emotion.value_or("?") + ")") : Dim("(no character)");
        auto it = block->dialogueText.find(locale);
        auto text = it != block->dialogueText.end() ? it->second : block->content.value_or("—");
        std::string flagStr;
        if (block->nativeProperties && block->nativeProperties->portPerCharacter && *block->nativeProperties->portPerCharacter)
            flagStr += "portPerCharacter";

        std::cout << "\n  " << Bold(Blue("DIALOG")) << " " << Cyan(Label(*block)) << " "
                  << (flagStr.empty() ? "" : Yellow("[" + flagStr + "]")) << "\n";
        std::cout << "         " << charStr << "\n";
        std::cout << "         " << White("\"" + text + "\"") << "\n";

        if (block->nativeProperties && block->nativeProperties->portPerCharacter
            && *block->nativeProperties->portPerCharacter && ch) {
            std::cout << Dim("         -> resolveCharacterPort: " + ch->name) << "\n";
            ctx->resolveCharacterPort(ch->name);
        }
        next();
        return [block]() { std::cout << Gray("       [cleanup] " + Label(*block)) << "\n"; };
    });

    engine.onChoice([&](ISceneHandle*, const BlueprintBlock* block, IChoiceContext* ctx, std::function<void()> next) -> CleanupFn {
        choiceCount++;
        std::cout << "\n  " << Bold(Yellow("CHOICE")) << " " << Cyan(Label(*block))
                  << " " << ctx->choices().size() << " visible:\n";
        for (const auto& c : ctx->choices()) {
            auto lbl = c.label.value_or(c.uuid.substr(0, 8));
            auto it = c.dialogueText.find(locale);
            auto txt = it != c.dialogueText.end() ? it->second : "—";
            std::cout << "         " << Yellow(">") << " " << lbl << ": " << White("\"" + txt + "\"") << "\n";
        }
        auto& pick = ctx->choices().size() > 1 && choiceCount > 1 ? ctx->choices()[1] : ctx->choices()[0];
        std::cout << Dim("         -> selecting: " + pick.label.value_or(pick.uuid.substr(0, 8))) << "\n";
        ctx->selectChoice(pick.uuid);
        next();
        return {};
    });

    engine.onCondition([&](ISceneHandle*, const BlueprintBlock* block, IConditionContext* ctx, std::function<void()> next) -> CleanupFn {
        bool result = !block->conditions.empty();
        std::cout << "\n  " << Bold(Magenta("CONDITION")) << " " << Cyan(Label(*block))
                  << " " << block->conditions.size() << " conditions -> "
                  << (result ? Green("true") : Red("false")) << "\n";
        ctx->resolve(result);
        next();
        return {};
    });

    engine.onAction([&](ISceneHandle*, const BlueprintBlock* block, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
        std::cout << "\n  " << Bold(Green("ACTION")) << " " << Cyan(Label(*block))
                  << " " << block->actions.size() << " actions\n";
        for (const auto& a : block->actions)
            std::cout << "         " << Green(">") << " " << a.actionId << "()\n";
        ctx->resolve();
        next();
        return [block]() { std::cout << Gray("       [cleanup] " + Label(*block)) << "\n"; };
    });

    engine.onSceneEnter([](const SceneLifecycleArgs&) {
        std::cout << "\n" << Bold(Green("--- Scene Enter ---")) << "\n";
    });
    engine.onSceneExit([](const SceneLifecycleArgs&) {
        std::cout << Bold(Red("--- Scene Exit ---")) << "\n\n";
    });

    engine.onValidateNextBlock([](const ValidateNextBlockArgs& args) -> ValidationResult {
        if (args.fromBlock) {
            std::cout << Gray("       [validate] " + Label(*args.fromBlock) + " -> " + Label(*args.nextBlock)) << "\n";
        }
        return ValidationResult::ok();
    });

    // Launch
    if (blueprint.scenes.empty()) { std::cout << "No scenes.\n"; return 0; }
    auto& firstScene = blueprint.scenes[0];
    std::cout << Dim("\nLaunching scene: " + firstScene.label + " (" + firstScene.uuid.substr(0, 12) + ")") << "\n";

    auto handle = engine.scene(firstScene.uuid);
    handle->start();

    // Summary
    std::cout << Bold("Visited:") << " ";
    bool first = true;
    for (const auto& uuid : handle->getVisitedBlocks()) {
        if (!first) std::cout << ", ";
        // Find label
        std::string lbl = uuid.substr(0, 8);
        for (const auto& s : blueprint.scenes) {
            for (const auto& b : s.blocks) {
                if (b.uuid == uuid) { lbl = b.label.value_or(lbl); break; }
            }
        }
        std::cout << Cyan(lbl);
        first = false;
    }
    std::cout << "\n" << Bold("Engine:") << " running=" << (engine.isRunning() ? Green("true") : Dim("false")) << "\n";

    return 0;
}
