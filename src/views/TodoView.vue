<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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
    ElMessage.success('提升动作已加入计划')
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

async function confirmDeleteTodo(id) {
  try {
    await ElMessageBox.confirm('删除后无法恢复，确定移除这项提升动作吗？', '确认删除？', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  await runAction(() => todoStore.deleteTodo(id), '删除任务失败')
}

async function confirmBatchDelete() {
  const count = todoStore.selectedTodoIds.size
  if (!count) return
  try {
    await ElMessageBox.confirm(`将删除选中的 ${count} 项提升动作，且无法恢复。`, '确认批量删除？', {
      confirmButtonText: `删除 ${count} 项`,
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }
  await runAction(todoStore.batchDeleteTodos, '批量删除失败')
}
</script>

<template>
  <div class="task-page">
    <section class="task-hero">
      <div>
        <span class="eyebrow">IMPROVEMENT BACKLOG</span>
        <h1>把复盘结论变成可验收的提升动作</h1>
        <p>记录要补充的项目指标、要重答的问题和要复习的知识点；备战教练也可以根据复盘结果自动写入计划。</p>
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
        <div><span>QUICK CREATE</span><h2>新增提升动作</h2></div>
        <small>也可以对备战教练说：“把这个薄弱点加入计划”</small>
      </div>
      <div class="add-row">
        <el-input v-model="newTodoText" size="large" maxlength="120" show-word-limit
          placeholder="例如：用 STAR 结构重写实习中最有挑战的一次协作…" @keyup.enter="addTodo" />
        <el-button type="primary" size="large" :icon="Plus" :loading="adding" :disabled="!newTodoText.trim()" @click="addTodo">
          加入计划
        </el-button>
      </div>
    </section>

    <section class="list-panel">
      <div class="panel-heading list-heading">
        <div><span>IMPROVEMENT QUEUE</span><h2>提升队列</h2></div>
        <div v-if="todoStore.todos.length" class="batch-actions">
          <el-checkbox :model-value="todoStore.isAllSelected" @change="todoStore.toggleAllSelection">全选</el-checkbox>
          <el-button type="danger" text :icon="Delete" :disabled="!todoStore.hasSelectedTodos"
            @click="confirmBatchDelete">
            删除选中（{{ todoStore.selectedTodoIds.size }}）
          </el-button>
        </div>
      </div>

      <div v-loading="todoStore.loading" class="task-list">
        <div v-if="!todoStore.todos.length && !todoStore.loading" class="empty-state">
          <span class="empty-icon"><el-icon><CircleCheck /></el-icon></span>
          <strong>提升队列为空</strong>
          <p>从一次复盘中选出最值得改进的一件事。</p>
        </div>
        <TodoItem v-for="todo in todoStore.todos" v-else :key="todo.id" :todo="todo"
          :is-selected="todoStore.selectedTodoIds.has(todo.id)"
          @delete="confirmDeleteTodo"
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
.task-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; padding: 30px 34px; color: #fff; border-radius: 22px; background: linear-gradient(125deg, #20203e, #3b367d 68%, #286e70); box-shadow: 0 16px 36px rgba(34,31,76,.16); }
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
@media (min-width: 1181px) { .task-hero p { max-width: none; white-space: nowrap; } }
@media (max-width: 920px) { .task-hero { align-items: flex-start; flex-direction: column; } }
@media (max-width: 680px) { .task-page { padding: 16px; } .task-hero { padding: 24px; } .task-metrics { width: 100%; justify-content: center; } .add-row { flex-direction: column; } .panel-heading, .task-footer { align-items: flex-start; flex-direction: column; } }
</style>
