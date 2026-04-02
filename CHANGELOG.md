# Changelog

## v0.3.0 (2026-04-01)

### Features
 Ajouter des modes d'évaluation pour le block condition avec support pour le mode dispatcher
 Enhance condition evaluation with 2D condition groups
 implement unified condition resolver for choice visibility and condition evaluation
 refactor condition handling to support multi-group evaluation
 Add JSON loaders for LSDE blueprints using Newtonsoft.Json and System.Text.Json

### Other
- Refactor documentation to replace deprecated `setChoiceFilter` with `onResolveCondition` across multiple language guides. Update descriptions for choice visibility handling, condition evaluation, and related concepts to improve clarity and consistency. Ensure all instances reflect the new unified condition resolver approach, enhancing the overall understanding of the engine's functionality.
- Add integration and unit tests for OnResolveCondition and condition evaluator
- Refactor condition handling in the dialogue engine
- Enhance LSDE documentation and parsing guides
- Add initial blueprint configuration with scenes, actions, choices, and dialogues
- Refactor code structure for improved readability and maintainability



## v0.2.0 (2026-03-30)

### Features
 add type-safe block overrides for dialog, choice, condition, and action handlers
 mettre à jour les imports de LsdeUtils pour utiliser le nouveau chemin '@lsde/dialog-engine' dans plusieurs fichiers de documentation
 mettre à jour la documentation pour le cycle de vie des blocks et la visibilité des choix, en clarifiant les appels de fonction et les propriétés d'exécution
 mettre à jour la documentation pour le cycle de vie des scènes et l'intégration des dialogues
 mettre à jour la documentation des handlers pour inclure le cycle de vie des scènes et ajouter des exemples de code
 mettre à jour la documentation des types de blocks pour inclure des détails sur les handlers et leur validation
 ajouter des gestionnaires de blocs sans nettoyage pour DIALOG, CHOICE, CONDITION et ACTION dans le moteur
 ajouter un nouveau fichier de jeu pour tester l'API du moteur avec un blueprint réel
 externaliser les instructions d'installation dans un fichier partagé
 améliorer l'intégration et la documentation des gestionnaires pour les moteurs C++, C#, GDScript et TypeScript
 ajouter un logo et un composant HeroCode avec des extraits de code pour plusieurs langages
 ajouter _previews/ au fichier .gitignore
 enhance block validation with character context
 add waitForBlocks handling in AsyncTrack and improve block execution flow
 enhance async track handling with waitForBlocks and track info API

### Fixes
 corriger le chemin d'accès à SceneHandle dans la documentation des types de blocks

### Other
- Update documentation for lifecycle, async tracks, and choice visibility
- Refactor integration documentation for LSDE engine
- Refactor documentation for action signatures, block types, and handlers across multiple languages
- Refactor block handlers to use unified action execution and condition evaluation methods across TypeScript, C#, C++, and GDScript. Update documentation for block types to reflect changes in dialog, choice, condition, and action handling, including cleanup functions and character resolution. Enhance clarity and consistency in descriptions and examples.
- Refactor documentation and code structure for Blueprint system
- Add documentation for various engine features and handlers
- Add Japanese and Chinese documentation for async tracks and lifecycle
- Enhance async track functionality and documentation
- Update blueprint schema and types to include new properties for block execution control



## v0.1.1 (2026-03-27)

### Features
 add publish script and update package management for npm and NuGet
docs): Add comprehensive Chinese documentation for LSDE Dialog Engine
 add script to generate plain text LLM guide and API reference
 enhance choice visibility handling and metadata structure
 Enhance choice visibility handling in Dialogue Engine
 enhance localization support and refactor state bridge integration
 Enhance choice context and history tracking
 Enhance choice handling and history tracking in dialogue engine
 Ajouter un workflow GitHub pour déployer la documentation
 Ajouter un lien vers la documentation complète dans le README
 Mettre à jour la description des runtimes dans les fichiers README pour inclure des détails sur l'automatisation et les intégrations natives
 Mettre à jour la mise en page des bannières dans la section Runtimes du README
 Augmenter la taille des bannières dans la section Runtimes du README
 Ajuster la mise en page du README pour les sections des runtimes
 Update README to use anchor tags for runtime banners
 Update README to include runtime test results and banner images
 Update README files to display banner images for C++, C#, GDScript, and TypeScript implementations
 Implement validation and diagnostic report for LSDE Dialog Engine
 Implement C# port of LSDE Dialog Engine utilities and validation
types): add 'NOTE' block type and enhance interface documentation
docs): restructure documentation and enhance content
 implement async track handling and validation for multiple non-async targets
 add playground for testing IntelliSense and API usage

### Fixes
docs): update banner image URLs to use raw GitHub links and correct French translations feat(docs): enhance integration guide with git submodule instructions and improve TypeScript examples chore(package): update package description, add exports and engines fields, and include LICENSE in files
readme): update banner image URL to use raw GitHub link
tsconfig): add playground-fake-game-engine.ts to exclusion list
tsconfig): exclude playground-fake-game-engine.ts from compilation
docs): mettre à jour les liens vers les sources des runtimes dans la documentation
 mettre à jour les informations de contact dans la licence et le README, ajuster le titre et les descriptions dans la configuration et les documents, et améliorer les commentaires dans le code
docs): translate all pages to English, fix GitHub link, add sharp corners CSS
docs): set VitePress base path for GitHub Pages
ci): add workflow file to trigger paths
ci): use npm install instead of npm ci for docs workflow

### Other
- Refactor code structure for improved readability and maintainability
- Enhance documentation and integration for LSDE engine
- Refactor LSDE Dialog Engine: Enhance scene handling, remove StateBridge, and improve utility functions
- Refactor dialogue engine to enhance condition evaluation and handler registration
- Refactor block context handling to resolve characters through StateBridge
- refactor: améliorer la lisibilité et la structure du code dans plusieurs fichiers
- Add README and banner image for LSDE Dialog Engine TypeScript implementation
- Add LSDE Dialog Engine core classes and playground example
- Enhance documentation and improve code clarity
- Add comprehensive tests for DialogueEngine functionality
- refactor: update character port handling to use index instead of name
- Add new WebP image for blueprints: cond.webp
- [init] Repository initialization with project structure



All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Repository initialization with project structure
- Blueprint types and schemas for TS, C#, C++, GDScript
- Cross-language test specification format
- TypeScript reference implementation scaffold
