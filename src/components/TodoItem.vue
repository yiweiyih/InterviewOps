<script setup>
// 【Vue核心概念：Props】
// 定义组件的props，用于接收父组件传递的数据
// 这里我们定义了两个prop：
// 1. todo: 待办事项对象，必须提供
// 2. is-selected: 是否被选中，默认值为false
const props = defineProps({
  todo: {
    type: Object,
    required: true
  },
  isSelected: {
    type: Boolean,
    default: false
  }
})

// 【Vue核心概念：Emits】
// 定义组件的事件，用于向父组件发送消息
// 这里我们定义了三个事件：delete、toggle和toggle-selection
const emit = defineEmits(['delete', 'toggle', 'toggle-selection'])

// 【Vue核心概念：事件处理】
// 删除待办事项的方法
// 当点击删除按钮时，通过emit向父组件发送delete事件，并传递todo的id
const handleDelete = () => {
  emit('delete', props.todo.id)
}

// 切换待办事项完成状态的方法
// 当点击完成状态复选框时，通过emit向父组件发送toggle事件，并传递todo的id
const handleToggle = () => {
  emit('toggle', props.todo.id)
}

// 【新增功能：切换选中状态】
// 切换待办事项的选中状态
// 当点击选中复选框时，通过emit向父组件发送toggle-selection事件，并传递todo的id
const handleToggleSelection = () => {
  emit('toggle-selection', props.todo.id)
}
</script>

<template>
  <div class="todo-item" :class="{ completed: todo.completed, selected: isSelected }">
    <!-- 【新增功能：选中复选框】使用Element Plus的Checkbox组件 -->
    <el-checkbox 
      :checked="isSelected" 
      @change="handleToggleSelection"
      style="margin-right: 10px;"
    />
    
    <!-- 完成状态复选框 使用Element Plus的Checkbox组件 -->
    <el-checkbox 
      :checked="todo.completed" 
      @change="handleToggle"
      style="margin-right: 10px;"
    />
    
    <span class="todo-text">{{ todo.text }}</span>
    <!-- 使用Element Plus的Button组件 -->
    <el-button 
      type="danger" 
      size="small" 
      @click="handleDelete"
      style="margin-left: auto;"
    >
      删除
    </el-button>
  </div>
</template>

<style scoped>
.todo-item {
  display: flex;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #f0f0f0;
  transition: all 0.3s ease;
  background-color: #fff;
}

/* 【新增样式：选中状态】 */
.todo-item.selected {
  background-color: #f0f9eb;
  border-left: 4px solid #67c23a;
}

.todo-item:last-child {
  border-bottom: none;
}

.todo-item:hover {
  background-color: #fafafa;
}

.todo-item.completed .todo-text {
  text-decoration: line-through;
  color: #909399;
}

.todo-text {
  flex: 1;
  margin: 0 15px;
  font-size: 15px;
  color: #303133;
  line-height: 1.5;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-checkbox) {
  font-size: 16px;
}

:deep(.el-button) {
  margin-left: auto;
}
</style>