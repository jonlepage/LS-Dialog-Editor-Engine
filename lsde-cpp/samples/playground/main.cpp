// LSDE Dialog Engine — Playground (C++ port of playground.ts)
// Loads a blueprint JSON, registers the new handler-based API, runs the first scene.
// Mirrors the TS playground exactly for cross-language validation.

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

#include <lsde/engine.h>
#include <lsde/scene_handle.h>
#include <lsde/utils.h>
#include <lsde/condition_evaluator.h>

// Include JSON deserializer (same as tests)
#include "../../tests/json_deserializer.h"
#include "../../tests/json_deserializer.cpp"

using namespace lsde;

// ─── Helpers ─────────────────────────────────────────────────────────────────

std::string Label(const BlueprintBlock& b) {
    return b.label.value_or(b.uuid.substr(0, std::min<size_t>(8, b.uuid.size())));
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(int argc, char* argv[]) {
    // Find blueprint
    std::string blueprintPath;
    if (argc > 1) {
        blueprintPath = argv[1];
    } else {
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

    // ─── Init ────────────────────────────────────────────────────────────────

    DialogueEngine engine;
    auto report = engine.init({blueprint});

    std::cout << "\n🔧 Init — " << report.errors.size() << " errors, " << report.warnings.size() << " warnings\n";
    for (const auto& w : report.warnings)
        std::cout << "   ⚠️  " << w.code << ": " << w.message << "\n";
    std::cout << "📊 sceneCount=" << report.stats.sceneCount
              << ", blockCount=" << report.stats.blockCount
              << ", connectionCount=" << report.stats.connectionCount << "\n";

    if (!report.errors.empty()) {
        for (const auto& e : report.errors)
            std::cout << "   ❌ " << e.code << ": " << e.message << "\n";
        return 1;
    }

    // on peut changer les locales on the fly
    engine.setLocale("en");

    // on ajoute l'algorithme de résolution de personnage
    engine.onResolveCharacter([](const std::vector<BlockCharacter>& chars) -> const BlockCharacter* {
        return chars.empty() ? nullptr : &chars[0];
    });

    // Opt-in: install choice visibility filter (playground: all game-state conditions pass)
    engine.setChoiceFilter([](const ExportCondition& cond) -> bool {
        // Simule un game state où variable_0 = "something_else"
        if (cond.key == "variable_0") return cond.value == "something_else";
        return true;
    });

    // ─── 4 Required Handlers ─────────────────────────────────────────────────

    engine.onDialog([](ISceneHandle*, const DialogBlock* block, IDialogContext* ctx, std::function<void()> next) -> CleanupFn {
        auto* ch = ctx->character();
        auto text = LsdeUtils::GetLocalizedText(block->dialogueText);

        std::cout << "\n💬 DIALOG  " << Label(*block) << "\n";
        std::cout << "   🎭 " << (ch ? ch->name : "") << " " << (ch ? ch->id : "")
                  << " [" << (ch && ch->emotion ? *ch->emotion : "") << "]\n";
        std::cout << "   📝 \"" << text.value_or("—") << "\"\n";

        if (block->nativeProperties && block->nativeProperties->portPerCharacter
            && *block->nativeProperties->portPerCharacter && ch) {
            std::cout << "   🔀 resolveCharacterPort: " << ch->uuid << "\n";
            ctx->resolveCharacterPort(ch->uuid);
        }
        next();
        return [block]() { std::cout << "   🧹 cleanup: " << Label(*block) << "\n"; };
    });

    engine.onChoice([](ISceneHandle*, const ChoiceBlock* block, IChoiceContext* ctx, std::function<void()> next) -> CleanupFn {
        const auto& choices = ctx->choices();

        // choices are tagged with .visible by the engine (setChoiceFilter installed above)
        std::vector<const RuntimeChoiceItem*> visible;
        for (const auto& c : choices) {
            if (!c.visible.has_value() || c.visible.value()) {
                visible.push_back(&c);
            }
        }
        std::optional<double> timeout;
        if (block->nativeProperties && block->nativeProperties->timeout) {
            timeout = block->nativeProperties->timeout;
        }
        // le moteur de jeux decidera quel visible choix est actif par default
        const RuntimeChoiceItem* active = visible.empty() ? nullptr : visible[0];

        std::cout << "\n❓ CHOICE  " << Label(*block) << " — " << visible.size() << "/" << choices.size() << " choices visible\n";
        for (const auto* choice : visible) {
            auto text = LsdeUtils::GetLocalizedText(choice->dialogueText);
            bool isActive = (choice == active);
            auto lbl = choice->label.value_or(choice->uuid.substr(0, std::min<size_t>(8, choice->uuid.size())));
            std::cout << "   👉 " << lbl << ": \"" << text.value_or("—") << "\"" << (isActive ? " (active)" : "") << "\n";
        }

        if (timeout.has_value()) {
            std::cout << "💌timeout: " << timeout.value() << "\n";
            // In a real game, we'd use a timer. For playground, just auto-select after logging.
            if (active) {
                auto lbl = active->label.value_or(active->uuid.substr(0, std::min<size_t>(8, active->uuid.size())));
                std::cout << "   ✅ selecting: " << lbl << "\n";
                ctx->selectChoice(active->uuid);
            }
            next();
        } else {
            // si pas de timeout, on va utiliser un waitinput dans le game engine
            if (active) {
                auto lbl = active->label.value_or(active->uuid.substr(0, std::min<size_t>(8, active->uuid.size())));
                std::cout << "   ✅ selecting: " << lbl << "\n";
                ctx->selectChoice(active->uuid);
            }
            next();
        }

        return [block]() { std::cout << "   🧹 cleanup: " << Label(*block) << "\n"; };
    });

    engine.onCondition([](ISceneHandle* scene, const ConditionBlock* block, IConditionContext* ctx, std::function<void()> next) -> CleanupFn {
        const auto& conditions = block->conditions;
        auto result = LsdeUtils::EvaluateConditionChain(
            conditions,
            [scene](const ExportCondition& cond) {
                return isChoiceCondition(cond) ? scene->evaluateCondition(cond) : true; // playground: all game conditions pass
            }
        );
        for (const auto& cond : conditions)
            std::cout << "   ❓ condition: " << cond.key << " " << cond.op << " " << cond.value << "\n";
        std::cout << "\n🔀 CONDITION  " << Label(*block) << " — " << conditions.size() << " conditions → " << (result ? "true" : "false") << "\n";
        ctx->resolve(result);
        next();
        return {};
    });

    engine.onAction([](ISceneHandle*, const ActionBlock* block, IActionContext* ctx, std::function<void()> next) -> CleanupFn {
        const auto& actions = block->actions;
        std::cout << "\n⚡ ACTION  " << Label(*block) << " — " << actions.size() << " actions\n";
        for (const auto& a : actions) {
            std::string paramsStr;
            for (size_t i = 0; i < a.params.size(); ++i) {
                if (i > 0) paramsStr += ", ";
                std::visit([&paramsStr](auto&& val) {
                    using T = std::decay_t<decltype(val)>;
                    if constexpr (std::is_same_v<T, std::string>) paramsStr += val;
                    else if constexpr (std::is_same_v<T, double>) paramsStr += std::to_string(val);
                    else if constexpr (std::is_same_v<T, bool>) paramsStr += val ? "true" : "false";
                }, a.params[i]);
            }
            std::cout << "   🎯 " << a.actionId << "(" << paramsStr << ")\n";
        }
        ctx->resolve();
        next();
        return [block]() { std::cout << "   🧹 cleanup: " << Label(*block) << "\n"; };
    });

    // ─── Optional Handlers ───────────────────────────────────────────────────

    engine.onBeforeBlock([](const BeforeBlockArgs& args) {
        if (args.context.nativeProperties && args.context.nativeProperties->delay) {
            std::cout << "   ⏳ before: " << Label(*args.block) << " delay=" << *args.context.nativeProperties->delay << "s\n";
        }
        args.resolve();
    });

    engine.onSceneEnter([](const SceneLifecycleArgs& args) {
        std::cout << "\n🟢 ━━━ Scene Enter ━━━  running=" << (args.scene->isRunning() ? "true" : "false") << "\n";
    });

    engine.onSceneExit([](const SceneLifecycleArgs&) {
        std::cout << "🔴 ━━━ Scene Exit ━━━\n\n";
    });

    engine.onValidateNextBlock([](const ValidateNextBlockArgs& args) -> ValidationResult {
        if (args.fromBlock) {
            std::cout << "   ✔️  validate: " << Label(*args.fromBlock) << " → " << Label(*args.nextBlock) << "\n";
        }
        return ValidationResult::ok();
    });

    engine.onInvalidateBlock([](const InvalidateBlockArgs& args) {
        std::cout << "   ❌ INVALIDATED: " << args.reason << "\n";
        args.scene->cancel();
    });

    // ─── Run ─────────────────────────────────────────────────────────────────

    if (blueprint.scenes.empty()) { std::cout << "No scenes.\n"; return 0; }
    auto& firstScene = blueprint.scenes[0];
    std::cout << "\n🚀 Launching scene: " << firstScene.label << "\n";

    auto handle = engine.scene(firstScene.uuid);
    handle->start();

    // ─── Summary ─────────────────────────────────────────────────────────────

    std::cout << "\n📋 Visited: ";
    bool first = true;
    for (const auto& uuid : handle->getVisitedBlocks()) {
        if (!first) std::cout << ", ";
        std::string lbl = uuid.substr(0, std::min<size_t>(8, uuid.size()));
        for (const auto& s : blueprint.scenes) {
            for (const auto& b : s.blocks) {
                if (b->uuid == uuid) { lbl = b->label.value_or(lbl); break; }
            }
        }
        std::cout << lbl;
        first = false;
    }
    std::cout << "\n";

    // Choice history
    std::cout << "📊 Choice History: {";
    bool firstH = true;
    for (const auto& [blockUuid, selections] : handle->getChoiceHistory()) {
        if (!firstH) std::cout << ", ";
        std::cout << blockUuid << ": [";
        for (size_t i = 0; i < selections.size(); ++i) {
            if (i > 0) std::cout << ", ";
            std::cout << selections[i];
        }
        std::cout << "]";
        firstH = false;
    }
    std::cout << "}\n";

    std::cout << "🏁 Engine running: " << (engine.isRunning() ? "true" : "false") << "\n";

    return 0;
}
