import { defineConfig, type DefaultTheme } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import typedocSidebar from "../api-ref/typedoc-sidebar.json";

const labels: Record<string, Record<string, string>> = {
	"": {
		introduction: "Introduction",
		whatIs: "What is LSDEDE?",
		gettingStarted: "Getting Started",
		concepts: "Concepts",
		blueprints: "Blueprints & Scenes",
		blockTypes: "Block Types",
		handlers: "Handlers",
		integration: "Game Engine Integration",
		advanced: "Advanced",
		lifecycle: "Lifecycle & Validation",
		choiceVisibility: "Choice Visibility",
		asyncTracks: "Async Tracks",
		parsing: "Parsing & Import",
		navGuide: "Guide",
		navApi: "API Reference",
		navLlm: "RAW Guide (for LLM)",
	},
	"/ja": {
		introduction: "はじめに",
		whatIs: "LSDEDEとは？",
		gettingStarted: "はじめる",
		concepts: "コンセプト",
		blueprints: "ブループリントとシーン",
		blockTypes: "ブロックタイプ",
		handlers: "ハンドラー",
		integration: "ゲームエンジン統合",
		advanced: "応用",
		lifecycle: "ライフサイクルと検証",
		choiceVisibility: "選択肢の表示制御",
		asyncTracks: "非同期トラック",
		parsing: "解析とインポート",
		navGuide: "ガイド",
		navApi: "APIリファレンス",
		navLlm: "RAWガイド (LLM用)",
	},
	"/zh": {
		introduction: "介绍",
		whatIs: "什么是 LSDEDE？",
		gettingStarted: "快速开始",
		concepts: "概念",
		blueprints: "蓝图与场景",
		blockTypes: "区块类型",
		handlers: "处理器",
		integration: "游戏引擎集成",
		advanced: "进阶",
		lifecycle: "生命周期与验证",
		choiceVisibility: "选项可见性",
		asyncTracks: "异步轨道",
		parsing: "解析与导入",
		navGuide: "指南",
		navApi: "API 参考",
		navLlm: "RAW 指南 (LLM用)",
	},
	"/fr": {
		introduction: "Introduction",
		whatIs: "C'est quoi LSDEDE?",
		gettingStarted: "Démarrage rapide",
		concepts: "Concepts",
		blueprints: "Blueprints & Scènes",
		blockTypes: "Types de blocs",
		handlers: "Handlers",
		integration: "Intégration game engine",
		advanced: "Avancé",
		lifecycle: "Lifecycle & Validation",
		choiceVisibility: "Visibilité des choix",
		asyncTracks: "Async Tracks",
		parsing: "Parsing & import",
		navGuide: "Guide",
		navApi: "Référence API",
		navLlm: "Guide RAW (pour LLM)",
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
				{ text: l.handlers, link: `${prefix}/guide/handlers` },
				{ text: l.integration, link: `${prefix}/guide/integration` },
			],
		},
		{
			text: l.advanced,
			items: [
				{ text: l.parsing, link: `${prefix}/guide/parsing` },
				{ text: l.lifecycle, link: `${prefix}/guide/lifecycle` },
				{ text: l.choiceVisibility, link: `${prefix}/guide/choice-visibility` },
				{ text: l.asyncTracks, link: `${prefix}/guide/async-tracks` },
			],
		},
	];
};

const localeNav = (prefix: string): DefaultTheme.NavItem[] => {
	const l = labels[prefix] ?? labels[""];
	return [
		{ text: l.navGuide, link: `${prefix}/guide/getting-started` },
		{ text: l.navApi, link: "/api-ref/" },
		{ text: l.navLlm, link: `${prefix}/guide/llm-full-guide` },
	];
};

export default withMermaid(defineConfig({
	title: "LSDEDE",
	description:
		"Callback-driven graph dispatcher for interactive dialogue blueprints",
	base: "/LS-Dialog-Editor-Engine/",

	locales: {
		root: {
			label: "English",
			lang: "en",
			themeConfig: { nav: localeNav("") },
		},
		ja: {
			label: "日本語",
			lang: "ja",
			description:
				"インタラクティブな対話ブループリントのためのコールバック駆動グラフディスパッチャー",
			themeConfig: { nav: localeNav("/ja") },
		},
		zh: {
			label: "中文",
			lang: "zh",
			description: "用于交互式对话蓝图的回调驱动图调度器",
			themeConfig: { nav: localeNav("/zh") },
		},
		fr: {
			label: "Français",
			lang: "fr-CA",
			description:
				"Dispatcher de graphe callback-driven pour blueprints de dialogue interactifs",
			themeConfig: { nav: localeNav("/fr") },
		},
	},

	themeConfig: {
		logo: '/lsde-64x64.webp',
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
}));
