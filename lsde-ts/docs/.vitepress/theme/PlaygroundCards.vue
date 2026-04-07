<script setup>
import { withBase, useData } from 'vitepress'
import { computed } from 'vue'

const { lang } = useData()

const titles = {
  'en':    'Try the Runtime — Live Demos',
  'fr-CA': 'Tester le moteur — Démos en direct',
  'ja':    'ランタイムを試す — ライブデモ',
  'zh':    '体验运行时 — 在线演示',
}

const title = computed(() => titles[lang.value] ?? titles['en'])

const playgrounds = [
  {
    name: 'PixiJS',
    sub: 'WebGL',
    url: 'https://jonlepage.github.io/LSDEDE-DEMO-TS/',
    logo: withBase('/pixijslogo.svg'),
  },
  {
    name: 'Unity',
    sub: 'WebGL',
    url: 'https://jonlepage.github.io/LSDEDE-runtime/',
    logo: withBase('/unitylogo.svg'),
  },
]
</script>

<template>
  <div class="playground-section">
    <p class="playground-title">{{ title }}</p>
    <div class="playground-cards">
      <a
        v-for="pg in playgrounds"
        :key="pg.name"
        :href="pg.url"
        target="_blank"
        rel="noopener"
        class="pg-card"
      >
        <img :src="pg.logo" :alt="pg.name" class="pg-logo" />
        <span class="pg-name">{{ pg.name }}</span>
        <span class="pg-sub">{{ pg.sub }}</span>
        <span class="pg-arrow">&#8599;</span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.playground-section {
  padding: 20px 0 0;
  margin-left: 6px;
}

.playground-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  margin: 0 0 8px;
}

.playground-cards {
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.pg-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-alt);
  text-decoration: none;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}

.pg-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.15);
  transform: translateY(-1px);
}

.pg-logo {
  width: 65px;
  height: 65px;
  object-fit: contain;
  flex-shrink: 0;
}

.pg-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.pg-sub {
  font-size: 11px;
  color: var(--vp-c-text-3);
}

.pg-arrow {
  font-size: 13px;
  color: var(--vp-c-text-3);
  transition: color 0.2s;
}

.pg-card:hover .pg-arrow {
  color: var(--vp-c-brand-1);
}

@media (max-width: 480px) {
  .playground-cards {
    flex-direction: column;
  }
}
</style>
