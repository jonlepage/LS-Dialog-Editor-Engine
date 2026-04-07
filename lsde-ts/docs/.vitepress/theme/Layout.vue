<script setup>
import DefaultTheme from 'vitepress/theme'
import { useRoute } from 'vitepress'
import { computed } from 'vue'
import HeroCode from './HeroCode.vue'
import PlaygroundCards from './PlaygroundCards.vue'

const route = useRoute()
const isApiRef = computed(() => route.path.includes('/api-ref'))
</script>

<template>
  <div :class="{ 'is-api-ref': isApiRef }">
    <DefaultTheme.Layout>
      <template #home-hero-before>
        <div class="hero-nodes">
          <svg viewBox="0 0 400 560" fill="none" preserveAspectRatio="xMidYMid meet">
            <!-- Dialog(65,30) out-bottom → Choice(220,30) in-top : horizontal -->
            <path d="M 95 50 C 95 70, 245 10, 245 30" stroke="#6366f1" stroke-width="1" fill="none"/>

            <!-- Choice(245,50) out-bottom → Condition(140,170) in-top -->
            <path d="M 245 50 C 245 110, 140 110, 140 170" stroke="#f59e0b" stroke-width="1" fill="none"/>

            <!-- Choice(245,50) out-bottom → Action(310,170) in-top -->
            <path d="M 245 50 C 245 110, 310 110, 310 170" stroke="#f59e0b" stroke-width="1" fill="none"/>

            <!-- Condition(140,190) out-bottom → Dialog(75,340) in-top -->
            <path d="M 140 190 C 140 265, 75 265, 75 340" stroke="#10b981" stroke-width="1" fill="none"/>

            <!-- Action(310,190) out-bottom → Action(245,340) in-top -->
            <path d="M 310 190 C 310 265, 245 265, 245 340" stroke="#ef4444" stroke-width="1" fill="none"/>

            <!-- Dialog(75,360) out-bottom → Dialog(140,480) in-top -->
            <path d="M 75 360 C 75 420, 140 420, 140 480" stroke="#6366f1" stroke-width="1" fill="none"/>

            <!-- Action(245,360) out-bottom → End(280,480) in-top -->
            <path d="M 245 360 C 245 420, 280 420, 280 480" stroke="#8b5cf6" stroke-width="1" fill="none"/>

            <!-- Red angular lines — cross-connections -->
            <path d="M 310 190 L 310 270 L 75 300 L 75 340" stroke="#ef4444" stroke-width="1.5" fill="none" stroke-linejoin="miter"/>
            <path d="M 245 360 L 245 410 L 140 440 L 140 480" stroke="#ef4444" stroke-width="1.5" fill="none" stroke-linejoin="miter"/>
          </svg>
          <span class="gn gn1">Dialog</span>
          <span class="gn gn2">Choice</span>
          <span class="gn gn3">Condition</span>
          <span class="gn gn4">Action</span>
          <span class="gn gn5">Dialog</span>
          <span class="gn gn6">Action</span>
          <span class="gn gn7">Dialog</span>
          <span class="gn gn8">End</span>
        </div>
      </template>
      <template #home-hero-image>
        <HeroCode />
      </template>
      <template #home-hero-actions-after>
        <PlaygroundCards />
      </template>
    </DefaultTheme.Layout>
  </div>
</template>

<style scoped>
.hero-nodes {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 400px;
  height: 560px;
  pointer-events: none;
  z-index: 0;
  opacity: .2;
  transform: translateY(-50%) scale(1.2);
}

.hero-nodes svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.gn {
  position: absolute;
  border: 1.5px solid;
  padding: 4px 11px;
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* Row 1 — y:30 */
.gn1 { border-color: #6366f1; color: #6366f1; top: 30px; left: 35px; }
.gn2 { border-color: #f59e0b; color: #f59e0b; top: 30px; left: 210px; }
/* Row 2 — y:170 */
.gn3 { border-color: #10b981; color: #10b981; top: 170px; left: 100px; }
.gn4 { border-color: #ef4444; color: #ef4444; top: 170px; left: 275px; }
/* Row 3 — y:340 */
.gn5 { border-color: #6366f1; color: #6366f1; top: 340px; left: 40px; }
.gn6 { border-color: #ef4444; color: #ef4444; top: 340px; left: 210px; }
/* Row 4 — y:480 */
.gn7 { border-color: #6366f1; color: #6366f1; top: 480px; left: 105px; }
.gn8 { border-color: #8b5cf6; color: #8b5cf6; top: 480px; left: 250px; }
</style>
