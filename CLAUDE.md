# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend
```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run preview   # Preview production build
```

### Backend
```bash
cd backend
node index.js     # Start backend server (port 3000)
```

Both must run simultaneously during development. The frontend calls `http://localhost:3000/api/chat`.

## Architecture

This is a full-stack AI chat app — Vue 3 SPA frontend + Node.js proxy backend.

### Frontend (`src/`)
- **App.vue** — Root layout: left sidebar nav (200px) + header + `<router-view>`
- **router/index.js** — 4 routes: `/`, `/todo`, `/about`, `/ai`
- **views/AIVIew.vue** — Main chat UI: session management, message display, streaming response handling
- **stores/chat.js** — Pinia store for multi-session chat; persists to localStorage under key `chat-sessions-v1` using a reactive `Map`
- **stores/todo.js** — Pinia store for todo list with batch operations

### Backend (`backend/`)
- **index.js** — HTTP server that proxies `POST /api/chat` to the Xunfei MaaS API and streams responses back to the client via SSE (Server-Sent Events)
- **simple-stream-server.js** — Simplified alternative server implementation
- **test-stream.js** — Utility for testing stream behavior
- **.env** — API keys and `PORT` (default 3000); required for backend to function

### AI Integration
The backend proxies to Xunfei MaaS (讯飞MaaS) using model `xop3qwen1b7`. OpenAI and Google Generative AI SDKs are also installed but not the primary integration. Streaming uses SSE — the frontend reads `data:` lines from the response stream.

### State & Persistence
Chat sessions are stored in `localStorage` (key: `chat-sessions-v1`). No database. No TypeScript — the project is plain JavaScript throughout.
