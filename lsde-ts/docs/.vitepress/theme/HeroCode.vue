<script setup>
import { ref } from 'vue'

const activeTab = ref(0)

const tabs = [
  { label: 'TS', file: 'playground.ts' },
  { label: 'C#', file: 'Program.cs' },
  { label: 'C++', file: 'main.cpp' },
  { label: 'GD', file: 'playground.gd' },
]

const snippets = [
  // TypeScript
  [
    { text: '// Blueprint → Engine → Handlers → Game', cls: 'c' },
    { text: '', parts: [['const', 'k'], [' engine = ', ''], ['new', 'k'], [' ', ''], ['DialogueEngine', 'g'], ['();', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['init', 'g'], ['({ ', ''], ['data', 's'], [': blueprint });', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['setLocale', 'g'], ['(', ''], ["'en'", 's'], [');', '']] },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['onDialog', 'g'], ['(({ block, next }) => {', '']] },
    { text: '', parts: [['  ', ''], ['showUI', 'w'], ['(block);', '']] },
    { text: '', parts: [['  ', ''], ['next', 'g'], ['();', '']] },
    { text: '});' },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['scene', 'g'], ['(', ''], ["'quest-01'", 's'], [').', ''], ['start', 'g'], ['();', '']] },
  ],
  // C#
  [
    { text: '// Blueprint → Engine → Handlers → Game', cls: 'c' },
    { text: '', parts: [['var', 'k'], [' engine = ', ''], ['new', 'k'], [' ', ''], ['DialogueEngine', 'g'], ['();', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['Init', 'g'], ['(', ''], ['data', 's'], [');', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['SetLocale', 'g'], ['(', ''], ['"en"', 's'], [');', '']] },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['OnDialog', 'g'], ['(args => {', '']] },
    { text: '', parts: [['  ', ''], ['ShowUI', 'w'], ['(args.Block);', '']] },
    { text: '', parts: [['  args.', ''], ['Next', 'g'], ['();', '']] },
    { text: '});' },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['Scene', 'g'], ['(', ''], ['"quest-01"', 's'], [').', ''], ['Start', 'g'], ['();', '']] },
  ],
  // C++
  [
    { text: '// Blueprint → Engine → Handlers → Game', cls: 'c' },
    { text: '', parts: [['auto', 'k'], [' engine = ', ''], ['DialogueEngine', 'g'], ['();', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['init', 'g'], ['(data);', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['setLocale', 'g'], ['(', ''], ['"en"', 's'], [');', '']] },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['onDialog', 'g'], ['([](', ''], ['auto', 'k'], ['* s, ', ''], ['auto', 'k'], ['* b, ', ''], ['auto', 'k'], ['* c, ', ''], ['auto', 'k'], [' n) {', '']] },
    { text: '', parts: [['  ', ''], ['showUI', 'w'], ['(b);', '']] },
    { text: '', parts: [['  ', ''], ['n', 'g'], ['();', '']] },
    { text: '});' },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['scene', 'g'], ['(', ''], ['"quest-01"', 's'], [')->', ''], ['start', 'g'], ['();', '']] },
  ],
  // GDScript
  [
    { text: '# Blueprint → Engine → Handlers → Game', cls: 'c' },
    { text: '', parts: [['var', 'k'], [' engine = ', ''], ['LsdeDialogEngine', 'g'], ['.new()', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['init', 'g'], ['(data)', '']] },
    { text: '', parts: [['engine', ''], ['.', ''], ['set_locale', 'g'], ['(', ''], ['"en"', 's'], [')', '']] },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['on_dialog', 'g'], ['(', ''], ['func', 'k'], ['(args):', '']] },
    { text: '', parts: [['  ', ''], ['show_ui', 'w'], ['(args[', ''], ['"block"', 's'], ['])', '']] },
    { text: '', parts: [['  args[', ''], ['"next"', 's'], ['].', ''], ['call', 'g'], ['()', '']] },
    { text: ')' },
    { text: ' ' },
    { text: '', parts: [['engine', ''], ['.', ''], ['scene', 'g'], ['(', ''], ['"quest-01"', 's'], [').', ''], ['start', 'g'], ['()', '']] },
  ],
]
</script>

<template>
  <div class="hero-code-block">
    <div class="hcb-header">
      <span class="hcb-file">{{ tabs[activeTab].file }}</span>
      <div class="hcb-tabs">
        <button
          v-for="(tab, i) in tabs"
          :key="tab.label"
          class="hcb-tab"
          :class="{ active: i === activeTab }"
          @click="activeTab = i"
        >{{ tab.label }}</button>
      </div>
    </div>
    <div class="hcb-body">
      <div v-for="(line, j) in snippets[activeTab]" :key="j" class="hcb-line">
        <span v-if="line.cls" :class="'hcb-' + line.cls">{{ line.text }}</span>
        <template v-else-if="line.parts">
          <span v-for="(part, k) in line.parts" :key="k" :class="part[1] ? 'hcb-' + part[1] : ''">{{ part[0] }}</span>
        </template>
        <template v-else>{{ line.text }}</template>
      </div>
      <span class="hcb-cursor"></span>
    </div>
  </div>
</template>

<style scoped>
.hero-code-block {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  width: 100%;
  max-width: 420px;
  font-family: var(--vp-font-family-mono);
}

.hcb-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 12px;
}

.hcb-file {
  padding: 8px 14px;
  color: var(--vp-c-text-3);
  border-right: 1px solid var(--vp-c-divider);
  white-space: nowrap;
}

.hcb-tabs {
  display: flex;
  margin-left: auto;
}

.hcb-tab {
  padding: 8px 11px;
  color: var(--vp-c-text-3);
  border: none;
  border-left: 1px solid var(--vp-c-divider);
  background: none;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  letter-spacing: 0.5px;
  opacity: 0.35;
  cursor: pointer;
  transition: opacity 0.15s, color 0.15s;
}

.hcb-tab:hover {
  opacity: 0.7;
}

.hcb-tab.active {
  opacity: 1;
  color: var(--vp-c-brand-1);
  background: rgba(99, 102, 241, 0.05);
}

.hcb-body {
  padding: 18px 20px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--vp-c-text-2);
}

.hcb-line {
  white-space: pre;
}

.hcb-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--vp-c-brand-1);
  vertical-align: middle;
  animation: hcb-blink 1s step-end infinite !important;
  margin-top: 4px;
}

@keyframes hcb-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.hcb-k { color: #6366f1; }
.hcb-g { color: #10b981; }
.hcb-s { color: #f59e0b; }
.hcb-c { color: var(--vp-c-text-3); opacity: 0.5; }
.hcb-w { color: var(--vp-c-text-1); }
</style>
