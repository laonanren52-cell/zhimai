# 知脉 AI 后端代理

前端不要配置模型 API Key。DeepSeek、OpenAI、搜索和 OCR 相关密钥只放在后端环境变量中。

后端现在同时承担服务端共享数据存储职责。默认数据库文件：

```text
server/data/zhimai-db.json
```

该文件会在首次启动时自动创建，并初始化默认管理员、管理员共享星图和对应 workspace 数据。生产环境可以通过 `ZHIMAI_DB_PATH` 指定持久化路径。

## 启动

先进入项目根目录，再启动后端：

```bash
cd C:\Users\cheng\Documents\Codex\2026-07-02\files-mentioned-by-the-user-ai
npm run dev:api
```

默认监听：

```text
http://127.0.0.1:3001
```

前端另开一个终端启动：

```bash
npm run dev
```

## 前端切换

真实后端代理：

```env
VITE_AI_PROVIDER=api
VITE_API_BASE_URL=http://localhost:3001
```

只做演示：

```env
VITE_AI_PROVIDER=mock
```

## 后端模型 Key

优先读取 DeepSeek：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
```

没有 DeepSeek Key 时读取 OpenAI：

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

如果两个 Key 都没有，后端健康状态会显示 `mock`。当前端使用 `VITE_AI_PROVIDER=api` 时，正式 AI 接口不会自动伪装成 mock，会返回明确错误；需要演示时请把前端切换为 `VITE_AI_PROVIDER=mock`。

## 联网搜索

当前代理内置 Tavily、Brave Search、SerpApi 搜索适配：

```env
WEB_SEARCH_ENABLED=true
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=
BRAVE_SEARCH_API_KEY=
SERPAPI_KEY=
```

`SEARCH_PROVIDER` 可选：`tavily`、`brave`、`serpapi`。未填写时按可用 key 自动选择。

未配置时，`POST /api/search` 不会伪造网页结果，会返回：

```text
联网搜索暂未配置，请在后端配置搜索 API。
```

## 接口

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/admin/overview`
- `GET /api/workspaces`
- `GET /api/workspaces/:id/data`
- `POST /api/workspaces/:id/data`
- `POST /api/activity`
- `POST /api/migrate-local-data`
- `POST /api/ai/analyze`
- `POST /api/ai/ask`
- `POST /api/ai/generate-output`
- `POST /api/search`

## 数据共享规则

- 管理员共享星图固定使用 `admin_public_default`。
- 管理员可以写入共享星图；普通用户只能读取和向 Copilot 提问。
- 普通用户注册后会自动创建 `user_private_<userId>` 个人星图。
- 用户登录、注册、进入共享星图、上传、提问、保存成果等行为会写入服务端日志，管理员后台读取真实统计。
- 密码以 salted sha256 哈希存储在服务端数据库中，不返回给前端。
