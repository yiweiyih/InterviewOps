<script setup>
// 关于页面视图组件
</script>

<template>
  <div class="about-container">
    <h2>关于应用</h2>
    <div class="about-content">
      <h3>技术栈</h3>
      <ul>
        <li>Vue 3</li>
        <li>Vue Router</li>
        <li>Pinia (状态管理)</li>
        <li>Element Plus</li>
        <li>Vite</li>
      </ul>
      
      <h3>功能特点</h3>
      <ul>
        <li>待办事项管理</li>
        <li>多选批量删除</li>
        <li>响应式布局</li>
        <li>路由切换</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.about-container {
  padding: 20px;
}

.about-content {
  margin-top: 20px;
}

.about-content h3 {
  margin-top: 20px;
  color: #333;
}

.about-content ul {
  list-style-type: disc;
  padding-left: 20px;
  margin-top: 10px;
}

.about-content li {
  margin-bottom: 5px;
  color: #666;
}
</style>
