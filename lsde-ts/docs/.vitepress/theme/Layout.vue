<script setup>
import DefaultTheme from 'vitepress/theme'
import { useRoute } from 'vitepress'
import { computed } from 'vue'

const route = useRoute()
const isApiRef = computed(() => route.path.includes('/api-ref'))
</script>

<template>
  <div :class="{ 'is-api-ref': isApiRef }">
    <DefaultTheme.Layout />
  </div>
</template>
