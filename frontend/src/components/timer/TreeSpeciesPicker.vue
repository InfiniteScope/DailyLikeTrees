<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
        <h3 class="modal-title">选择树种</h3>
        <div class="species-grid">
          <button
            v-for="species in TREE_SPECIES"
            :key="species.id"
            class="species-card"
            :class="{ selected: species.id === store.selectedSpeciesId }"
            @click="selectAndClose(species.id)"
          >
            <img
              :src="getSpeciesPreviewPath(species.id)"
              :alt="species.name"
              class="species-preview-img"
              width="44" height="44"
            />
            <span class="species-name">{{ species.name }}</span>
            <span class="species-desc">{{ species.description }}</span>
          </button>
        </div>
        <button class="close-btn" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useTimerStore } from '../../stores/timer'
import { TREE_SPECIES } from '../../utils/constants'
import { getSpeciesPreviewPath } from '../../utils/assetPaths'

const emit = defineEmits<{ (e: 'close'): void }>()
const store = useTimerStore()

function selectAndClose(id: string) {
  store.selectSpecies(id)
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: 28px;
  max-width: 600px;
  width: 90vw;
  box-shadow: var(--shadow-md);
}

.modal-title {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: var(--fw-medium);
  text-align: center;
  color: var(--color-text);
}

.species-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
}

.species-grid::-webkit-scrollbar {
  width: 4px;
}

.species-grid::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

.species-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
}

.species-card:hover {
  transform: translateY(-1px);
  border-color: var(--color-primary);
}

.species-card.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.species-name {
  font-size: 11px;
  font-weight: var(--fw-medium);
  color: var(--color-text);
}

.species-preview-img {
  image-rendering: auto;
  object-fit: contain;
}

.species-desc {
  font-size: 10px;
  font-weight: var(--fw-light);
  color: var(--color-text-secondary);
  text-align: center;
  line-height: 1.3;
}

.close-btn {
  display: block;
  margin: 20px auto 0;
  padding: 8px 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 13px;
  font-weight: var(--fw-regular);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-hover-bg);
}
</style>
