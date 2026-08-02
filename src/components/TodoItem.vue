<script setup>
import { Delete } from '@element-plus/icons-vue'

const props = defineProps({
  todo: { type: Object, required: true },
  isSelected: { type: Boolean, default: false }
})

const emit = defineEmits(['delete', 'toggle', 'toggle-selection'])
</script>

<template>
  <article class="todo-item" :class="{ completed: todo.completed, selected: isSelected }">
    <el-checkbox :model-value="isSelected" aria-label="选择任务" @change="emit('toggle-selection', props.todo.id)" />
    <button class="status-toggle" :class="{ done: todo.completed }" :aria-label="todo.completed ? '标记为未完成' : '标记为完成'"
      @click="emit('toggle', props.todo.id)">
      <span>{{ todo.completed ? '✓' : '' }}</span>
    </button>
    <div class="todo-content">
      <strong>{{ todo.text }}</strong>
      <span>{{ todo.completed ? '已完成' : '等待执行' }}</span>
    </div>
    <el-button type="danger" text :icon="Delete" @click="emit('delete', props.todo.id)">删除</el-button>
  </article>
</template>

<style scoped>
.todo-item { display: flex; align-items: center; gap: 12px; padding: 15px 16px; border-bottom: 1px solid #edf1f5; background: #fff; transition: .18s ease; }
.todo-item:last-child { border-bottom: none; }
.todo-item:hover { background: #fafcff; }
.todo-item.selected { background: #f3f8ff; box-shadow: inset 3px 0 #3a82c9; }
.status-toggle { display: grid; flex: 0 0 auto; place-items: center; width: 24px; height: 24px; border: 1px solid #cbd6e1; border-radius: 50%; color: #fff; background: #fff; cursor: pointer; }
.status-toggle.done { border-color: #25a477; background: #25a477; }
.todo-content { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.todo-content strong { overflow-wrap: anywhere; color: #344256; font-size: 14px; font-weight: 550; }
.todo-content span { color: #9aa5b1; font-size: 10px; }
.todo-item.completed .todo-content strong { color: #8d99a6; text-decoration: line-through; }
</style>
