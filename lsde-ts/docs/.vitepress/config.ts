import { defineConfig } from "vitepress";
import typedocSidebar from "../api-ref/typedoc-sidebar.json";

export default defineConfig({
	title: "LSDEDE",
	description:
		"Callback-driven graph dispatcher for interactive dialogue blueprints",
	base: "/LS-Dialog-Editor-Engine/",

	themeConfig: {
		nav: [
			{ text: "Guide", link: "/guide/getting-started" },
			{ text: "API Reference", link: "/api-ref/" },
			{ text: "RAW Guide (for LLM)", link: "/guide/llm-full-guide" },
		],

		sidebar: {
			"/guide/": [
				{
					text: "Introduction",
					items: [
						{ text: "What is LSDEDE?", link: "/guide/what-is-lsde" },
						{ text: "Getting Started", link: "/guide/getting-started" },
					],
				},
				{
					text: "Concepts",
					items: [
						{ text: "Blueprints & Scenes", link: "/guide/blueprints" },
						{ text: "Block Types", link: "/guide/block-types" },
						{ text: "Choice Visibility", link: "/guide/choice-visibility" },
						{ text: "Handlers & Lifecycle", link: "/guide/handlers" },
						{ text: "Game Engine Integration", link: "/guide/integration" },
					],
				},
			],
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
