<script setup>
import { Sunny, Search, List, Clock, Notebook, Connection } from '@element-plus/icons-vue'
</script>

<template>
  <div class="home-container">
    <div class="hero">
      <h1 class="hero-title">Yu Agent</h1>
      <p class="hero-desc">基于 MCP 协议的多工具 AI 智能体平台，支持工具串联编排与自然语言驱动</p>
    </div>

    <div class="feature-grid">
      <el-card class="feature-card" shadow="hover">
        <div class="feature-icon weather"><el-icon><Sunny /></el-icon></div>
        <div class="feature-name">实时天气</div>
        <div class="feature-desc">查询全国城市实时气温、湿度、风速等气象数据</div>
      </el-card>

      <el-card class="feature-card" shadow="hover">
        <div class="feature-icon search"><el-icon><Search /></el-icon></div>
        <div class="feature-name">网络搜索</div>
        <div class="feature-desc">通过 Serper API 实时搜索人物、新闻、百科等信息</div>
      </el-card>

      <el-card class="feature-card" shadow="hover">
        <div class="feature-icon todo"><el-icon><List /></el-icon></div>
        <div class="feature-name">待办管理</div>
        <div class="feature-desc">用自然语言增删查改待办事项，与 AI 双向同步</div>
      </el-card>

      <el-card class="feature-card" shadow="hover">
        <div class="feature-icon time"><el-icon><Clock /></el-icon></div>
        <div class="feature-name">时间感知</div>
        <div class="feature-desc">获取当前日期、时间与星期，为 Agent 提供时间上下文</div>
      </el-card>

      <el-card class="feature-card" shadow="hover">
        <div class="feature-icon note"><el-icon><Notebook /></el-icon></div>
        <div class="feature-name">Agent 记忆</div>
        <div class="feature-desc">持久化笔记读写，让 Agent 跨对话记住关键信息</div>
      </el-card>

      <el-card class="feature-card" shadow="hover">
        <div class="feature-icon loop"><el-icon><Connection /></el-icon></div>
        <div class="feature-name">工具串联</div>
        <div class="feature-desc">Agent Loop 多轮编排，单次请求并行调用多个工具</div>
      </el-card>
    </div>

    <div class="tech-stack">
      <el-tag type="primary">Vue 3</el-tag>
      <el-tag type="success">DeepSeek API</el-tag>
      <el-tag type="warning">MCP Protocol</el-tag>
      <el-tag type="info">Function Calling</el-tag>
      <el-tag>SSE 流式输出</el-tag>
      <el-tag type="danger">Node.js</el-tag>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px;
}

.hero {
  text-align: center;
  padding: 40px 0 32px;
}

.hero-title {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 12px;
}

.hero-desc {
  font-size: 15px;
  color: #666;
  max-width: 520px;
  margin: 0 auto;
  line-height: 1.7;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.feature-card {
  text-align: center;
  padding: 8px 0;
  transition: transform 0.2s;
  cursor: default;
}

.feature-card:hover {
  transform: translateY(-4px);
}

.feature-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  font-size: 24px;
}

.weather { background: #e8f4fd; color: #409eff; }
.search  { background: #f0f9eb; color: #67c23a; }
.todo    { background: #fdf6ec; color: #e6a23c; }
.time    { background: #f4f0fb; color: #8e5af7; }
.note    { background: #fef0f0; color: #f56c6c; }
.loop    { background: #e9faf0; color: #13ce66; }

.feature-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.feature-desc {
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}

.tech-stack {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
