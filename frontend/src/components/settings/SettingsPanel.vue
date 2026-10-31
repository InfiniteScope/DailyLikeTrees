<template>
  <div class="settings-fab">
    <button v-if="!openOnMount" class="fab-btn" @click="open = !open" title="设置">
      <IconSvg name="settings" :size="20" />
    </button>

    <Teleport to="body">
      <div v-if="open" class="settings-overlay" @click.self="closeDrawer">
        <div class="settings-drawer">
          <h3>设置</h3>

          <div class="setting-item">
            <span>主题</span>
            <button class="toggle-btn" @click="settings.toggleTheme()">
              <IconSvg :name="settings.theme === 'dark' ? 'moon' : 'sun'" :size="14" />
              {{ settings.theme === 'dark' ? '深色' : '浅色' }}
            </button>
          </div>

          <div class="setting-item">
            <span>音量</span>
            <div class="volume-row">
              <input
                type="range"
                min="0"
                max="100"
                :value="audio.masterVolume"
                @input="audio.setMasterVolume(Number(($event.target as HTMLInputElement).value))"
                class="volume-slider"
              />
              <span class="volume-val">{{ audio.masterVolume }}</span>
            </div>
          </div>

          <div class="setting-item">
            <span>静音</span>
            <button
              class="toggle-btn"
              :class="{ active: audio.isMuted }"
              @click="audio.toggleMute()"
            >
              <IconSvg :name="audio.isMuted ? 'volume-off' : 'volume-on'" :size="14" />
              {{ audio.isMuted ? '已静音' : '未静音' }}
            </button>
          </div>

          <div class="setting-item">
            <span>显示天气</span>
            <button
              class="toggle-btn"
              :class="{ active: settings.weatherEnabled }"
              @click="settings.toggleWeatherEnabled()"
            >
              <Eye v-if="settings.weatherEnabled" :size="14" />
              <EyeOff v-else :size="14" />
              {{ settings.weatherEnabled ? '开启' : '关闭' }}
            </button>
          </div>

          <div class="setting-item">
            <span>专注悬浮球</span>
            <button
              class="toggle-btn"
              :class="{ active: settings.floatingBallEnabled }"
              @click="settings.toggleFloatingBallEnabled()"
            >
              <IconSvg v-if="settings.floatingBallEnabled" name="timer" :size="14" />
              <TimerOff v-else :size="14" />
              {{ settings.floatingBallEnabled ? '开启' : '关闭' }}
            </button>
          </div>

          <!-- Developer options toggle -->
          <div class="setting-item">
            <span>开发者选项</span>
            <button
              v-if="!settings.devMode"
              class="toggle-btn dev-toggle"
              @click="showDevConfirm = true"
            >
              <IconSvg name="sparkle" :size="14" />
              开启
            </button>
            <span v-else class="dev-enabled-badge">
              <IconSvg name="sparkle" :size="14" />
              已开启
            </span>
          </div>

          <button class="close-drawer" @click="closeDrawer">关闭</button>
        </div>
      </div>

      <!-- Developer mode confirmation dialog -->
      <div v-if="showDevConfirm" class="confirm-overlay" @click.self="showDevConfirm = false">
        <div class="confirm-dialog">
          <div class="confirm-icon">
            <IconSvg name="sparkle" :size="28" />
          </div>
          <h4>开启开发者选项？</h4>
          <p class="confirm-body">
            开启后将在页面左下角显示测试工具，包括快速种树和清空树木等功能。
            这些操作<strong>不可撤销</strong>，确定要继续吗？
          </p>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click="showDevConfirm = false">取消</button>
            <button class="confirm-btn proceed" @click="confirmDevMode">确定开启</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useAudioStore } from '../../stores/audio'
import { Eye, EyeOff, TimerOff } from '@lucide/vue'
import IconSvg from '../icons/IconSvg.vue'

const props = defineProps<{ openOnMount?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const settings = useSettingsStore()
const audio = useAudioStore()
const open = ref(props.openOnMount ?? false)
const showDevConfirm = ref(false)

function closeDrawer() {
  open.value = false
  emit('close')
}

function confirmDevMode() {
  settings.enableDevMode()
  showDevConfirm.value = false
}
</script>

<style scoped>
.settings-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 200;
}

.fab-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: transform var(--transition-fast);
}

.fab-btn:hover {
  transform: scale(1.05);
}

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.25);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
}

.settings-drawer {
  position: fixed;
  bottom: 0;
  right: 0;
  width: 300px;
  max-width: 90vw;
  background: var(--color-bg);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  padding: 24px;
  box-shadow: var(--shadow-md);
  animation: drawer-slide-in 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes drawer-slide-in {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.settings-drawer h3 {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: var(--fw-medium);
  color: var(--color-text);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 14px;
  font-weight: var(--fw-regular);
}

.volume-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-slider {
  width: 100px;
  accent-color: var(--color-primary);
}

.volume-val {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 28px;
  font-variant-numeric: tabular-nums;
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 12px;
  font-weight: var(--fw-regular);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.toggle-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.close-drawer {
  margin-top: 16px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-secondary);
  color: var(--color-text);
  font-size: 13px;
  font-weight: var(--fw-regular);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.close-drawer:hover {
  background: var(--color-hover-bg);
}

/* ── Developer toggle ── */
.dev-toggle {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.dev-enabled-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-primary);
  font-weight: var(--fw-medium);
}

/* ── Confirmation dialog ── */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  width: 360px;
  max-width: 90vw;
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: 28px 24px 20px;
  box-shadow: var(--shadow-lg);
  text-align: center;
  animation: confirm-pop 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes confirm-pop {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.confirm-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.confirm-dialog h4 {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: var(--fw-medium);
  color: var(--color-text);
}

.confirm-body {
  margin: 0 0 20px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.confirm-body strong {
  color: var(--color-danger, #e05555);
}

.confirm-actions {
  display: flex;
  gap: 10px;
}

.confirm-btn {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: var(--fw-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.confirm-btn.cancel {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.confirm-btn.cancel:hover {
  background: var(--color-hover-bg);
}

.confirm-btn.proceed {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.confirm-btn.proceed:hover {
  filter: brightness(1.08);
}

</style>
