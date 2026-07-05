# 知脉 AI

知脉 AI 是一个个人知识图谱与智能信息库工作台。用户上传 PDF、Word、笔记和项目资料后，系统会解析正文、检测质量、切片保存来源、抽取节点与关系，并写入 Obsidian 风格知识星图。Copilot 可基于星图节点、文件正文片段和来源引用进行问答、总结和成果生成。

## 核心能力

- 多用户登录与知识空间：管理员共享星图、个人私有星图、只读/可编辑权限。
- 管理后台：管理员可管理成员、密码、访问概览、在线状态、系统配置和操作日志。
- 知识导入：支持批量上传，解析正文，展示解析质量、可用片段、AI 分析和图谱写入状态。
- 知识星图：基于 `vis-network` 的 Obsidian Global Graph 风格星图，支持拖动、筛选、搜索、节点详情和侧栏独立滚动。
- 知源 Copilot：支持仅资料库、联网增强、混合验证三种问答模式，回答带本地资料来源和网页来源。
- 成果工坊：基于资料片段生成总结、答辩稿、PPT 大纲、面试问答等成果，并可保存回星图。
- AI 状态统一：顶部、首页、导入页、Copilot 和成果页共享同一个 AI 运行状态源，避免旧失败状态误报。

## 技术栈

- 前端：React 18、Vite、TypeScript、Tailwind CSS、Framer Motion、lucide-react
- 图谱：vis-network、vis-data
- 后端：Node.js 原生 HTTP 服务
- 存储：后端服务端 JSON 数据库 `server/data/zhimai-db.json`，前端仅保存 session token 和最近 workspace 偏好，后续可替换为 SQLite/Postgres/MySQL

## 本地运行

```bash
npm install
npm run dev
```

另开一个终端启动后端 AI 代理：

```bash
npm run dev:api
```

默认前端地址：

```text
http://localhost:5173
```

默认后端地址：

```text
http://127.0.0.1:3001
```

## 账号与注册

登录页不展示 Demo 账号或密码。新用户通过注册页创建账号，系统会自动创建个人知识星图。

系统初始化时会创建管理员种子账号；首次进入管理员后台会提示尽快修改密码。管理员可维护共享星图和系统设置，普通用户可查看管理员共享星图，也可进入个人星图上传和管理自己的资料。

## 云端共享存储

当前核心业务数据以后端数据库为准，部署到服务器后不同浏览器和不同用户会读取同一份服务端数据：

- `users`：用户、角色、状态、密码哈希、最后登录 IP、在线状态。
- `workspaces`：管理员共享星图和用户个人星图。
- `workspaceData`：资料、正文片段、星图节点、关系边、成果和空间活动。
- `loginLogs` / `activityLogs` / `trafficStats`：管理员后台统计和审计数据。

`localStorage` 只用于保存 `zhimai-ai-session-token`、最近访问空间和旧 Demo 数据迁移检测，不再作为核心业务数据源。

## 环境变量

前端 `.env` 示例：

```env
VITE_AI_PROVIDER=api
VITE_API_BASE_URL=https://api.example.com
```

本地开发不配置 `VITE_API_BASE_URL` 时，前端会默认请求 `http://127.0.0.1:3001`。生产构建不配置该变量时，前端会请求相对路径 `/api`，需要由同域反向代理转发到后端。

后端 `.env` 示例：

```env
DEEPSEEK_API_KEY=your_deepseek_key
OPENAI_API_KEY=your_openai_key
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat
WEB_SEARCH_ENABLED=false
TAVILY_API_KEY=
OCR_PROVIDER=
OCR_API_KEY=
```

如果没有配置真实模型 Key，系统会降级为 Mock 演示模式，不会让页面崩溃。联网搜索未配置时会明确提示“联网搜索暂未配置”，不会伪造网页来源。

## 构建

```bash
npm run build
```

构建产物位于：

```text
dist/
```

## EdgeOne / 静态部署配置

当前仓库根目录已经包含 `package.json` 和 `package-lock.json`，部署平台应使用仓库根目录作为构建根目录。

- Root Directory：`./`
- Install Command：`npm ci`
- Build Command：`npm run build`
- Output Directory：`dist`

EdgeOne Pages 只部署前端静态资源，不会托管 `server/index.mjs` 里的 Node 后端。后端必须单独部署到云服务器、容器或其他 Node 运行环境，并保证浏览器可以访问对应 API。

生产环境有两种推荐接入方式：

1. 在 EdgeOne Pages 环境变量中配置 `VITE_API_BASE_URL=https://你的后端公网域名`。
2. 不配置 `VITE_API_BASE_URL`，让前端请求相对路径 `/api`，再用同域 Nginx、EdgeOne 规则或其他网关把 `/api` 反向代理到 Node 后端。

不要在 EdgeOne Pages 生产环境把 `VITE_API_BASE_URL` 配成 `localhost` 或 `127.0.0.1`。预览链接和手机端访问时，这些地址会指向访问者自己的设备，而不是你的服务器。

## 生产部署注意事项

1. 前端生产环境不要使用 `localhost` 作为 API 地址。
2. 后端可用 `HOST=0.0.0.0 API_HOST=0.0.0.0 PORT=3001 node server/index.mjs` 启动，或交给 PM2 / systemd 守护；启动日志应显示 `http://0.0.0.0:3001`。
3. 如果使用 Nginx，前端静态资源指向 `dist`，`/api` 代理到 Node 后端。
4. React/Vite 单页应用需要配置 fallback 到 `index.html`，否则刷新 `/graph`、`/upload`、`/copilot` 会 404。
5. 腾讯云安全组至少放行 80/443；后端端口建议只由 Nginx 内部代理，不直接暴露。
6. 上传功能需要确认后端上传目录存在且有写入权限，并配置 Nginx 上传大小限制。
7. 部署后先访问 `https://你的后端域名/api/health` 或同域 `/api/health`，确认返回健康状态后再验证注册、登录、共享星图和 AI 提问。

## 最近更新

2026-07-04（浅色高级视觉迁移）：

- 默认主题切换为 `lightPremium`：全局 Design Tokens 从深黑 Aurora 改为陶瓷白、浅雾蓝、科技蓝和黛青的浅色高级知识工作台体系。
- 全站背景改为浅色动态知识星图：新增轻量 3D canvas 星图、柔和蓝青光晕、玻璃噪点和低强度鼠标视差，避免大面积黑色背景。
- 登录页 / 注册页迁移为浅色陶瓷白玻璃体验：保留 WebGL/CSS 动态背景、轻微 3D tilt、输入聚焦 glow 和主按钮流光，但整体改为明亮专业风格。
- 首页、空间选择页、星图页、Copilot、上传、成果和后台的通用卡片、按钮、状态胶囊、输入框、toast、空状态和面板统一读取浅色 tokens。
- 星图页外部 UI 改为浅灰蓝与白色玻璃侧栏，真实图谱画布改为浅色星图容器，节点和关系线使用低饱和科技蓝、黛青、柔紫和琥珀色。

2026-07-04：

- 重建全站 Ambient 背景层：基础深海背景、Aurora 流体光、柔光团、噪点、暗角和桌面鼠标弱光晕统一落地，避免内页退化成纯黑后台。
- 重新调高页面视觉强度分层：首页和空间选择页保留更明显的品牌光感，星图、Copilot 和管理员后台保持更克制的工作区氛围。
- 登录页和注册页恢复更明显的动态体验：增强 WebGL Aurora 色彩、CSS fallback 流体背景、鼠标光晕、卡片入场、输入聚焦 glow 和主按钮流光反馈。
- 升级全局液态玻璃材质：主卡片、次卡片、首页主视觉卡、统计卡和空间选择卡新增半透明层、边缘高光、内发光和 hover 反光。
- 优化内页背景性能：鼠标光晕改为 DOM CSS 变量驱动，避免 React 在鼠标移动时频繁重渲染；移动端和 reduced-motion 自动降级但保留弱 Aurora 氛围。

2026-07-03：

- 全站颜色系统统一为登录页同源的液态玻璃 Design Tokens，新增页面视觉强度分层：登录/注册最高，首页中高，星图中等，Copilot 中低，管理员后台最低。
- 顶部导航、玻璃卡片、按钮、输入框、状态胶囊、星图 canvas 颜色统一读取全局 tokens，减少页面之间的视觉割裂。
- 登录页和注册页升级为液态玻璃认证体验：WebGL 流体极光背景、胶片噪点、液态玻璃卡片、底线式输入、磁性按钮、桌面轻量 3D tilt，并提供移动端和 reduced-motion 降级。
- 认证页面继续调用后端真实登录 / 注册接口，不展示默认管理员密码，保留 `admin` 管理员后端初始化能力。
- 新增服务端 JSON 数据库和 token session，修复管理员共享星图、普通用户注册登录、后台成员/日志无法跨浏览器共享的问题。
- 新增 workspace 云端读写接口，管理员写入 `admin_public_default` 后普通用户刷新即可读取共享资料、节点和关系，普通用户写共享空间会被拒绝。
- 管理员后台改为读取后端真实 users、loginLogs、activityLogs 和 trafficStats。
- 新增多用户登录、知识空间和权限控制。
- 新增正式登录 / 注册流程，移除登录页和首页上的 Demo 密码提示。
- 新增管理员“设置 / 管理后台”，包含成员管理、密码账号、访问概览、在线/IP、系统配置和操作日志。
- 统一收口用户、空间、系统设置、访问统计和审计日志数据结构。
- 修复旧本地存储下默认管理员未补齐导致无法登录的问题，登录现在支持 username / email 双匹配并区分账号不存在与密码错误。
- 新增统一 AI 状态管理，修复真实 AI 已接入但页面误报失败或 Mock 的问题。
- 重构顶部导航为三段式信息架构。
- 修复星图页左右侧栏内容显示不完整、右侧节点详情截断、侧栏内部滚动和横向溢出问题。
- 优化首页动态短句、工作台状态信息和顶部导航响应式稳定性。
- 优化 Copilot 三栏工作台滚动边界。
- 保留深色知识宇宙与液态玻璃视觉体系，并增加页面切换动效。

## 验证命令

```bash
npx tsc -b
npm run build
```

建议每次提交前执行以上命令。Vite 如果提示部分 chunk 超过 500 kB，这是体积优化提示，不影响运行；后续可通过动态 import 拆分页面模块。
