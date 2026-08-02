<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/github-dark.css'

Object.entries({ bash, css, java, javascript, json, markdown, python, sql, typescript, xml })
  .forEach(([name, language]) => hljs.registerLanguage(name, language))

const renderer = new marked.Renderer()
renderer.code = ({ text, lang }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : null
  const highlighted = language
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value
  const languageClass = language ? ` language-${language}` : ''
  return `<pre><code class="hljs${languageClass}">${highlighted}</code></pre>`
}

const props = defineProps({
  content: {
    type: String,
    required: true
  }
})

const safeHtml = computed(() => DOMPurify.sanitize(
  marked.parse(props.content, { renderer })
))
</script>

<template>
  <div class="markdown-body" v-html="safeHtml" />
</template>

<style scoped>
.markdown-body :deep(p) { margin: 0 0 8px 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) { margin: 12px 0 6px 0; font-weight: 600; }
.markdown-body :deep(ul),
.markdown-body :deep(ol) { padding-left: 20px; margin: 6px 0; }
.markdown-body :deep(li) { margin: 4px 0; }
.markdown-body :deep(code) {
  background-color: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}
.markdown-body :deep(pre) {
  background-color: #1e1e1e;
  color: #d4d4d4;
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.markdown-body :deep(pre code) { background: none; padding: 0; color: inherit; font-size: 13px; }
.markdown-body :deep(blockquote) {
  border-left: 3px solid #0284c7;
  padding-left: 12px;
  color: #666;
  margin: 8px 0;
}
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; margin: 8px 0; }
.markdown-body :deep(th),
.markdown-body :deep(td) { border: 1px solid #e5e7eb; padding: 6px 12px; text-align: left; }
.markdown-body :deep(th) { background-color: #f9fafb; font-weight: 600; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
</style>
