import { defineConfig } from "vitepress";
import typedocSidebar from "../api-ref/typedoc-sidebar.json";

const labels: Record<string, Record<string, string>> = {
	"": {
		introduction: "Introduction",
		whatIs: "What is LSDEDE?",
		gettingStarted: "Getting Started",
		concepts: "Concepts",
		blueprints: "Blueprints & Scenes",
		blockTypes: "Block Types",
		choiceVisibility: "Choice Visibility",
		handlers: "Handlers & Lifecycle",
		integration: "Game Engine Integration",
	},
	"/ja": {
		introduction: "はじめに",
		whatIs: "LSDEDEとは？",
		gettingStarted: "はじめる",
		concepts: "コンセプト",
		blueprints: "ブループリントとシーン",
		blockTypes: "ブロックタイプ",
		choiceVisibility: "選択肢の表示制御",
		handlers: "ハンドラーとライフサイクル",
		integration: "ゲームエンジン統合",
	},
	"/zh": {
		introduction: "介绍",
		whatIs: "什么是 LSDEDE？",
		gettingStarted: "快速开始",
		concepts: "概念",
		blueprints: "蓝图与场景",
		blockTypes: "区块类型",
		choiceVisibility: "选项可见性",
		handlers: "处理器与生命周期",
		integration: "游戏引擎集成",
	},
	"/fr": {
		introduction: "Introduction",
		whatIs: "C'est quoi LSDEDE?",
		gettingStarted: "Démarrage rapide",
		concepts: "Concepts",
		blueprints: "Blueprints & Scènes",
		blockTypes: "Types de blocs",
		choiceVisibility: "Visibilité des choix",
		handlers: "Handlers & Lifecycle",
		integration: "Intégration game engine",
	},
};

const guideSidebar = (prefix: string) => {
	const l = labels[prefix] ?? labels[""];
	return [
		{
			text: l.introduction,
			items: [
				{ text: l.whatIs, link: `${prefix}/guide/what-is-lsde` },
				{ text: l.gettingStarted, link: `${prefix}/guide/getting-started` },
			],
		},
		{
			text: l.concepts,
			items: [
				{ text: l.blueprints, link: `${prefix}/guide/blueprints` },
				{ text: l.blockTypes, link: `${prefix}/guide/block-types` },
				{ text: l.choiceVisibility, link: `${prefix}/guide/choice-visibility` },
				{ text: l.handlers, link: `${prefix}/guide/handlers` },
				{ text: l.integration, link: `${prefix}/guide/integration` },
			],
		},
	];
};

export default defineConfig({
	title: "LSDEDE",
	description:
		"Callback-driven graph dispatcher for interactive dialogue blueprints",
	base: "/LS-Dialog-Editor-Engine/",

	locales: {
		root: {
			label: "English",
			lang: "en",
		},
		ja: {
			label: "日本語",
			lang: "ja",
			description:
				"インタラクティブな対話ブループリントのためのコールバック駆動グラフディスパッチャー",
		},
		zh: {
			label: "中文",
			lang: "zh",
			description: "用于交互式对话蓝图的回调驱动图调度器",
		},
		fr: {
			label: "Français",
			lang: "fr-CA",
			description:
				"Dispatcher de graphe callback-driven pour blueprints de dialogue interactifs",
		},
	},

	themeConfig: {
		nav: [
			{ text: "Guide", link: "/guide/getting-started" },
			{ text: "API Reference", link: "/api-ref/" },
			{ text: "RAW Guide (for LLM)", link: "/guide/llm-full-guide" },
		],

		sidebar: {
			"/guide/": guideSidebar(""),
			"/ja/guide/": guideSidebar("/ja"),
			"/zh/guide/": guideSidebar("/zh"),
			"/fr/guide/": guideSidebar("/fr"),
			"/api-ref/": typedocSidebar,
		},

		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/jonlepage/LS-Dialog-Editor-Engine",
			},
		],

		outline: { level: [2, 3] },
		search: { provider: "local" },
	},
});
