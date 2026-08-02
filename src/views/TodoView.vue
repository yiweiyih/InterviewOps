<script setup>
import { ref, onMounted } from 'vue'
import TodoItem from '../components/TodoItem.vue'
import { useTodoStore } from '../stores/todo'

const todoStore = useTodoStore()
const newTodoText = ref('')

onMounted(() => {
  todoStore.fetchTodos()
})

const addTodo = () => {
  const trimmedText = newTodoText.value.trim()
  if (trimmedText) {
    todoStore.addTodo(trimmedText)
    newTodoText.value = ''
  }
}
</script>

<template>
  <div class="todo-app">
    <!-- 使用Element Plus的Card组件 -->
    <el-card shadow="hover" class="todo-card">
      <template #header>
        <div class="card-header">
          <h2>Todo List</h2>
        </div>
      </template>
      
      <!-- 添加待办事项 -->
      <div class="add-todo">
        <!-- 使用Element Plus的Input组件 -->
        <el-input 
          v-model="newTodoText" 
          placeholder="添加新的待办事项..."
          @keyup.enter="addTodo"
          style="margin-right: 10px;"
        />
        <!-- 使用Element Plus的Button组件 -->
        <el-button type="primary" @click="addTodo">
          添加
        </el-button>
      </div>
      
      <el-divider />
      
      <!-- 待办事项列表 -->
      <div class="todo-list">
        <!-- 【新增功能：批量操作栏】 -->
        <div class="batch-actions" v-if="todoStore.todos.length > 0">
          <!-- 使用Element Plus的Space组件 -->
          <el-space>
            <el-checkbox 
              :checked="todoStore.isAllSelected" 
              @change="todoStore.toggleAllSelection"
            >
              全选
            </el-checkbox>
            <el-button 
              type="danger" 
              @click="todoStore.batchDeleteTodos"
              :disabled="!todoStore.hasSelectedTodos"
              size="small"
            >
              删除选中 ({{ todoStore.selectedTodoIds.size }})
            </el-button>
          </el-space>
        </div>
        
        <!-- 使用Element Plus的Empty组件 -->
        <el-empty 
          v-if="todoStore.todos.length === 0" 
          description="没有待办事项"
        />
        
        <!-- 待办事项列表 -->
        <div v-else class="todo-items-container">
          <TodoItem 
            v-for="todo in todoStore.todos" 
            :key="todo.id"
            :todo="todo"
            :is-selected="todoStore.selectedTodoIds.has(todo.id)"
            @delete="todoStore.deleteTodo"
            @toggle="todoStore.toggleTodo"
            @toggle-selection="todoStore.toggleTodoSelection"
          />
        </div>
      </div>
      
      <el-divider />
      
      <!-- 统计信息 -->
      <div class="stats">
        <el-space>
          <span>剩余 {{ todoStore.remainingCount }} 项待办</span>
          <el-checkbox 
            :checked="todoStore.isAllCompleted" 
            @change="todoStore.toggleAllTodos"
          >
            全部标记为完成
          </el-checkbox>
        </el-space>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.todo-app {
  max-width: 900px;
  margin: 20px auto;
}

.todo-card {
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h2 {
  color: #333;
  font-weight: 600;
  margin: 0;
}

.add-todo {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  padding: 0 5px;
}

.todo-list {
  margin-bottom: 20px;
}

/* 【新增样式：批量操作栏】 */
.batch-actions {
  margin-bottom: 20px;
  padding: 0 5px;
}

.todo-items-container {
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
}

.stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #666;
  font-size: 14px;
  padding: 0 5px;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-input) {
  flex: 1;
}

:deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

:deep(.el-card__body) {
  padding: 20px;
}

:deep(.el-divider) {
  margin: 16px 0;
}
</style>
