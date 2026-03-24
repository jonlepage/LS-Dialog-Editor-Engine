import { defineConfig } from 'vitepress';
import typedocSidebar from '../api-ref/typedoc-sidebar.json';

export default defineConfig({
	title: 'LSDE Dialog Engine',
	description: 'TypeScript reference implementation — callback-driven graph dispatcher for dialogue blueprints',
	base: '/LS-Dialog-Editor-Engine/',

	themeConfig: {
		nav: [
			{ text: 'Guide', link: '/guide/getting-started' },
			{ text: 'API Reference', link: '/api-ref/' },
		],

		sidebar: {
			'/guide/': [
				{
					text: 'Introduction',
					items: [
						{ text: 'Qu\'est-ce que LSDE?', link: '/guide/what-is-lsde' },
						{ text: 'Démarrage rapide', link: '/guide/getting-started' },
					],
				},
				{
					text: 'Concepts',
					items: [
						{ text: 'Blueprints & Scènes', link: '/guide/blueprints' },
						{ text: 'Types de blocs', link: '/guide/block-types' },
						{ text: 'StateBridge', link: '/guide/state-bridge' },
						{ text: 'Handlers & Lifecycle', link: '/guide/handlers' },
					],
				},
			],
			'/api-ref/': typedocSidebar,
		},

		socialLinks: [
			{ icon: 'github', link: 'https://github.com/nicmusic/LS-Dialog-Editor-Engine' },
		],

		outline: { level: [2, 3] },
		search: { provider: 'local' },
	},
});
