<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Clock, Delete, Plus } from '@element-plus/icons-vue'
import TodoItem from '../components/TodoItem.vue'
import { useTodoStore } from '../stores/todo'

const todoStore = useTodoStore()
const newTodoText = ref('')
const adding = ref(false)
const completedCount = computed(() => todoStore.todos.length - todoStore.remainingCount)
const completionRate = computed(() => todoStore.todos.length
  ? Math.round((completedCount.value / todoStore.todos.length) * 100)
  : 0)

onMounted(async () => {
  try {
    await todoStore.fetchTodos()
  } catch (error) {
    ElMessage.error(error.message || '任务加载失败')
  }
})

async function addTodo() {
  const text = newTodoText.value.trim()
  if (!text || adding.value) return
  adding.value = true
  try {
    await todoStore.addTodo(text)
    newTodoText.value = ''
    ElMessage.success('任务已添加，可继续交给 Agent 管理')
  } catch (error) {
    ElMessage.error(error.message || '添加任务失败')
  } finally {
    adding.value = false
  }
}

async function runAction(action, failureMessage) {
  try {
    await action()
  } catch (error) {
    ElMessage.error(error.message || failureMessage)
  }
}
</script>

<template>
  <div class="task-page">
    <section class="task-hero">
      <div>
        <span class="eyebrow">AGENT-AWARE TASKS</span>
        <h1>把目标沉淀为可执行任务</h1>
        <p>你可以手动维护任务，也可以在 Agent 对话中用自然语言完成新增、查询、完成和删除；两端共享同一份用户级数据。</p>
      </div>
      <div class="task-metrics">
        <div><el-icon><Clock /></el-icon><strong>{{ todoStore.remainingCount }}</strong><span>进行中</span></div>
        <i></i>
        <div><el-icon><CircleCheck /></el-icon><strong>{{ completedCount }}</strong><span>已完成</span></div>
        <i></i>
        <div><strong>{{ completionRate }}%</strong><span>完成率</span></div>
      </div>
    </section>

    <section class="create-panel">
      <div class="panel-heading">
        <div><span>QUICK CREATE</span><h2>新增任务</h2></div>
        <small>也可以对 Agent 说：“帮我添加一条待办”</small>
      </div>
      <div class="add-row">
        <el-input v-model="newTodoText" size="large" maxlength="120" show-word-limit
          placeholder="输入下一步需要完成的具体事项…" @keyup.enter="addTodo" />
        <el-button type="primary" size="large" :icon="Plus" :loading="adding" :disabled="!newTodoText.trim()" @click="addTodo">
          添加任务
        </el-button>
      </div>
    </section>

    <section class="list-panel">
      <div class="panel-heading list-heading">
        <div><span>EXECUTION QUEUE</span><h2>任务队列</h2></div>
        <div v-if="todoStore.todos.length" class="batch-actions">
          <el-checkbox :model-value="todoStore.isAllSelected" @change="todoStore.toggleAllSelection">全选</el-checkbox>
          <el-button type="danger" text :icon="Delete" :disabled="!todoStore.hasSelectedTodos"
            @click="runAction(todoStore.batchDeleteTodos, '批量删除失败')">
            删除选中（{{ todoStore.selectedTodoIds.size }}）
          </el-button>
        </div>
      </div>

      <div v-loading="todoStore.loading" class="task-list">
        <div v-if="!todoStore.todos.length && !todoStore.loading" class="empty-state">
          <span class="empty-icon"><el-icon><CircleCheck /></el-icon></span>
          <strong>任务队列为空</strong>
          <p>添加一条具体任务，或让 Agent 根据目标自动拆解。</p>
        </div>
        <TodoItem v-for="todo in todoStore.todos" v-else :key="todo.id" :todo="todo"
          :is-selected="todoStore.selectedTodoIds.has(todo.id)"
          @delete="id => runAction(() => todoStore.deleteTodo(id), '删除任务失败')"
          @toggle="id => runAction(() => todoStore.toggleTodo(id), '更新状态失败')"
          @toggle-selection="todoStore.toggleTodoSelection" />
      </div>

      <footer v-if="todoStore.todos.length" class="task-footer">
        <span>{{ todoStore.remainingCount }} 项待执行 · {{ completedCount }} 项已完成</span>
        <el-checkbox :model-value="todoStore.isAllCompleted"
          @change="runAction(todoStore.toggleAllTodos, '批量更新失败')">全部标记为完成</el-checkbox>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.task-page { min-width: 0; height: 100%; overflow-y: auto; padding: 28px; background: #f4f7fb; }
.task-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; padding: 30px 34px; color: #fff; border-radius: 18px; background: linear-gradient(135deg, #081d31, #123f67 65%, #1c6284); box-shadow: 0 16px 36px rgba(7,27,48,.15); }
.task-hero > div:first-child { min-width: 0; }
.eyebrow, .panel-heading span { color: #82a5be; font-size: 9px; letter-spacing: .15em; }
.task-hero h1 { margin: 10px 0; font-size: clamp(25px, 3vw, 36px); line-height: 1.2; }
.task-hero p { max-width: 720px; color: #bfd1df; line-height: 1.7; }
.task-metrics { display: flex; flex: 0 0 auto; align-items: center; gap: 18px; padding: 18px 20px; border: 1px solid rgba(255,255,255,.13); border-radius: 13px; background: rgba(255,255,255,.07); }
.task-metrics > div { display: grid; grid-template-columns: auto auto; align-items: center; gap: 3px 7px; min-width: 68px; }
.task-metrics .el-icon { color: #80d8bd; }
.task-metrics strong { font-size: 25px; }
.task-metrics span { grid-column: 1 / -1; color: #9db8ca; font-size: 11px; }
.task-metrics i { width: 1px; height: 42px; background: rgba(255,255,255,.16); }
.create-panel, .list-panel { margin-top: 18px; padding: 22px; border: 1px solid #e4ebf2; border-radius: 14px; background: #fff; box-shadow: 0 6px 20px rgba(31,49,70,.04); }
.panel-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 15px; }
.panel-heading h2 { margin-top: 4px; color: #233248; font-size: 18px; }
.panel-heading small { color: #8c99a7; }
.add-row { display: flex; gap: 12px; }
.add-row .el-button { flex: 0 0 auto; border-radius: 9px; }
.add-row :deep(.el-input__wrapper) { border-radius: 9px; }
.list-heading { align-items: center; }
.batch-actions { display: flex; align-items: center; gap: 8px; }
.task-list { min-height: 150px; border: 1px solid #e7edf3; border-radius: 11px; overflow: hidden; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; color: #8491a0; }
.empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: 12px; border-radius: 14px; color: #2d7bc5; background: #edf5ff; font-size: 25px; }
.empty-state strong { color: #4b5b6d; }
.empty-state p { margin-top: 6px; font-size: 12px; }
.task-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 16px; color: #7b8795; font-size: 12px; }
@media (max-width: 920px) { .task-hero { align-items: flex-start; flex-direction: column; } }
@media (max-width: 680px) { .task-page { padding: 16px; } .task-hero { padding: 24px; } .task-metrics { width: 100%; justify-content: center; } .add-row { flex-direction: column; } .panel-heading, .task-footer { align-items: flex-start; flex-direction: column; } }
</style>
