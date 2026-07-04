import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const JSON_LIMIT_BYTES = 1024 * 1024 * 12;

const relationTypes = new Set(["mentions", "belongs_to", "uses", "depends_on", "solves", "generates", "related_to"]);
const nodeTypes = new Set(["project", "document", "tech", "problem", "output", "tag", "concept"]);
const ADMIN_USER_ID = "admin_default";
const ADMIN_PUBLIC_WORKSPACE_ID = "admin_public_default";
const DB_PATH = resolve(process.cwd(), process.env.ZHIMAI_DB_PATH || "server/data/zhimai-db.json");

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password, salt) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  return { passwordSalt: salt, passwordHash: hashPassword(password, salt) };
}

function verifyPassword(user, password) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  return hashPassword(password, user.passwordSalt) === user.passwordHash;
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return safe;
}

function privateWorkspaceId(userId) {
  return `user_private_${userId}`;
}

function createAdminUser() {
  const stamp = nowIso();
  return {
    id: ADMIN_USER_ID,
    username: "admin",
    email: "admin@zhimai.local",
    role: "admin",
    status: "active",
    createdAt: stamp,
    lastActiveAt: stamp,
    lastLoginIp: "",
    isOnline: false,
    online: false,
    enabled: true,
    canManageWorkspace: true,
    canAccessAdminPanel: true,
    canEditAdminGraph: true,
    mustChangePassword: true,
    loginCount: 0,
    ...createPasswordRecord("123456"),
  };
}

function createWorkspace(user) {
  const stamp = nowIso();
  return {
    id: privateWorkspaceId(user.id),
    name: `${user.username} 的个人星图`,
    type: "user_private",
    ownerId: user.id,
    visibility: "private",
    createdAt: stamp,
    updatedAt: stamp,
    description: "用户个人知识空间。",
    version: 1,
  };
}

function createAdminWorkspace() {
  const stamp = nowIso();
  return {
    id: ADMIN_PUBLIC_WORKSPACE_ID,
    name: "管理员共享星图",
    type: "admin_public",
    ownerId: ADMIN_USER_ID,
    visibility: "public",
    permissionMode: "admin_edit_user_read",
    createdAt: stamp,
    updatedAt: stamp,
    lastPublishedAt: stamp,
    description: "管理员维护的共享知识空间。",
    version: 1,
    updateSummary: "初始化共享知识空间。",
  };
}

function emptyDataset(workspaceId = ADMIN_PUBLIC_WORKSPACE_ID) {
  return {
    workspaceId,
    documents: [],
    graph: { nodes: [], edges: [] },
    outputs: [],
    recentActivities: [],
    revision: 0,
    updatedAt: nowIso(),
  };
}

function defaultMetrics() {
  return {
    todayVisits: 0,
    totalVisits: 0,
    loginCount: 0,
    uniqueVisitors: 0,
    sharedGraphVisits: 0,
    copilotUses: 0,
    uploadCount: 0,
  };
}

function defaultSettings() {
  return {
    siteName: "知脉 AI",
    allowRegistration: true,
    storageMode: "api",
    version: "0.1.0",
    updatedAt: nowIso(),
  };
}

function normalizeDb(db) {
  const stamp = nowIso();
  const admin = createAdminUser();
  const users = Array.isArray(db?.users) ? db.users : [];
  const adminIndex = users.findIndex((user) => user.id === ADMIN_USER_ID || String(user.username).toLowerCase() === "admin" || user.role === "admin");
  if (adminIndex === -1) {
    users.unshift(admin);
  } else {
    users[adminIndex] = {
      ...admin,
      ...users[adminIndex],
      id: ADMIN_USER_ID,
      username: "admin",
      role: "admin",
      status: "active",
      enabled: true,
      canManageWorkspace: true,
      canAccessAdminPanel: true,
      canEditAdminGraph: true,
      passwordHash: users[adminIndex].passwordHash || admin.passwordHash,
      passwordSalt: users[adminIndex].passwordSalt || admin.passwordSalt,
    };
  }

  const workspaces = Array.isArray(db?.workspaces) ? db.workspaces : [];
  const workspaceMap = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  workspaceMap.set(ADMIN_PUBLIC_WORKSPACE_ID, { ...createAdminWorkspace(), ...(workspaceMap.get(ADMIN_PUBLIC_WORKSPACE_ID) ?? {}) });
  users.forEach((user) => {
    const privateId = privateWorkspaceId(user.id);
    if (!workspaceMap.has(privateId)) workspaceMap.set(privateId, createWorkspace(user));
  });

  const workspaceData = db?.workspaceData && typeof db.workspaceData === "object" ? db.workspaceData : {};
  for (const workspace of workspaceMap.values()) {
    workspaceData[workspace.id] = { ...emptyDataset(workspace.id), ...(workspaceData[workspace.id] ?? {}), workspaceId: workspace.id };
  }

  return {
    users,
    workspaces: [...workspaceMap.values()],
    workspaceData,
    sessions: Array.isArray(db?.sessions) ? db.sessions : [],
    loginLogs: Array.isArray(db?.loginLogs) ? db.loginLogs : [],
    activityLogs: Array.isArray(db?.activityLogs) ? db.activityLogs : [],
    trafficStats: { ...defaultMetrics(), ...(db?.trafficStats ?? {}) },
    settings: { ...defaultSettings(), ...(db?.settings ?? {}), storageMode: "api", updatedAt: db?.settings?.updatedAt ?? stamp },
  };
}

function readDb() {
  if (!existsSync(DB_PATH)) {
    const initial = normalizeDb({});
    saveDb(initial);
    return initial;
  }
  try {
    return normalizeDb(JSON.parse(readFileSync(DB_PATH, "utf8")));
  } catch {
    return normalizeDb({});
  }
}

function saveDb(db) {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(normalizeDb(db), null, 2), "utf8");
}

function listWorkspaces(db = readDb()) {
  return db.workspaces;
}

function tokenFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function userFromRequest(req, db = readDb()) {
  const token = tokenFromRequest(req);
  if (token) {
    const session = db.sessions.find((item) => item.token === token);
    const user = session ? db.users.find((item) => item.id === session.userId) : null;
    if (user) return user;
  }
  const id = String(req.headers["x-zhimai-user-id"] || "");
  const role = String(req.headers["x-zhimai-user-role"] || "user");
  const known = db.users.find((user) => user.id === id || user.username === id);
  return known || { id: id || "anonymous", username: id || "anonymous", email: "", role: role === "admin" ? "admin" : "user", status: "active" };
}

function workspaceFromRequest(req, payload = {}, db = readDb()) {
  const workspaceId = String(payload.workspaceId || req.headers["x-zhimai-workspace-id"] || ADMIN_PUBLIC_WORKSPACE_ID);
  return listWorkspaces(db).find((workspace) => workspace.id === workspaceId) || null;
}

function canReadWorkspace(user, workspace) {
  if (!user || !workspace) return false;
  if (workspace.type === "admin_public" || workspace.type === "demo_public") return true;
  return workspace.ownerId === user.id;
}

function canEditWorkspace(user, workspace) {
  if (!user || !workspace) return false;
  if (user.role === "admin" && workspace.type === "admin_public") return true;
  return workspace.type === "user_private" && workspace.ownerId === user.id;
}

function enforceWorkspaceAccess(req, payload, mode, db = readDb()) {
  const user = userFromRequest(req, db);
  const workspace = workspaceFromRequest(req, payload, db);
  const allowed = mode === "write" ? canEditWorkspace(user, workspace) : canReadWorkspace(user, workspace);
  if (!allowed) {
    const reason = workspace?.type === "admin_public" ? "你当前只有查看权限，不能修改管理员共享星图。" : "你没有访问或编辑该知识空间的权限。";
    const error = new Error(reason);
    error.statusCode = mode === "write" ? 403 : 401;
    throw error;
  }
  return { user, workspace };
}

function findUserByLogin(db, login) {
  const normalized = String(login || "").trim().toLowerCase();
  return db.users.find((user) => String(user.username).toLowerCase() === normalized || String(user.email).toLowerCase() === normalized);
}

function accessibleWorkspaces(db, user) {
  return db.workspaces.filter((workspace) => canReadWorkspace(user, workspace));
}

function createToken(db, user, req) {
  const token = randomBytes(32).toString("hex");
  db.sessions = db.sessions.filter((session) => session.userId !== user.id);
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    ip: requestIp(req),
    userAgent: String(req.headers["user-agent"] || ""),
  });
  return token;
}

function requestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
}

function recordLogin(db, user, req, success, reason = "") {
  db.loginLogs.unshift({
    id: `login-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: user?.id,
    username: user?.username || "",
    actorId: user?.id,
    actorName: user?.username || "",
    type: "login",
    detail: success ? `${user.username} 登录系统` : reason,
    ip: requestIp(req),
    userAgent: String(req.headers["user-agent"] || ""),
    loginAt: nowIso(),
    createdAt: nowIso(),
    success,
    reason,
  });
  db.loginLogs = db.loginLogs.slice(0, 240);
  if (success) {
    db.trafficStats.loginCount += 1;
    db.trafficStats.totalVisits += 1;
    db.trafficStats.todayVisits += 1;
    db.trafficStats.uniqueVisitors = new Set(db.users.filter((item) => item.lastLoginAt).map((item) => item.id)).size;
  }
}

function recordActivity(db, { user, workspaceId, actionType, targetType = "", targetId = "", detail = "", req }) {
  const log = {
    id: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: user?.id,
    actorId: user?.id,
    actorName: user?.username,
    workspaceId,
    type: actionType,
    actionType,
    targetType,
    targetId,
    detail,
    ip: req ? requestIp(req) : "",
    createdAt: nowIso(),
  };
  db.activityLogs.unshift(log);
  db.activityLogs = db.activityLogs.slice(0, 300);
  if (actionType === "upload") db.trafficStats.uploadCount += 1;
  if (actionType === "ask") db.trafficStats.copilotUses += 1;
  if (actionType === "enter_shared_graph") db.trafficStats.sharedGraphVisits += 1;
  return log;
}

function authSnapshot(db, user, token = undefined, currentWorkspaceId = null) {
  const safeUser = publicUser(user);
  const admin = user?.role === "admin" && user?.canAccessAdminPanel !== false;
  return {
    ...(token ? { token } : {}),
    user: safeUser,
    users: admin ? db.users.map(publicUser) : [safeUser].filter(Boolean),
    workspaces: accessibleWorkspaces(db, user),
    currentWorkspaceId,
    metrics: db.trafficStats,
    auditLogs: admin ? [...db.loginLogs, ...db.activityLogs].slice(0, 180) : [],
    settings: db.settings,
  };
}

function loadEnvFile(fileName) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Zhimai-User-Id,X-Zhimai-User-Role,X-Zhimai-Workspace-Id",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolveJson, reject) => {
    let size = 0;
    let body = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > JSON_LIMIT_BYTES) {
        reject(new Error("请求体过大，请减少资料内容后重试。"));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolveJson({});
        return;
      }
      try {
        resolveJson(JSON.parse(body));
      } catch {
        reject(new Error("请求 JSON 格式不正确。"));
      }
    });
    req.on("error", reject);
  });
}

function getProviderConfig() {
  const requested = (process.env.AI_PROVIDER || "").toLowerCase();
  if ((requested === "deepseek" || !requested) && process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      endpoint: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com/chat/completions",
      model: process.env.DEEPSEEK_MODEL || process.env.AI_MODEL || "deepseek-chat",
    };
  }
  if ((requested === "openai" || !requested) && process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      endpoint: process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini",
    };
  }
  return { provider: "mock", apiKey: "", endpoint: "", model: "mock" };
}

function getSearchConfig() {
  if (process.env.WEB_SEARCH_ENABLED === "false") return { enabled: false, configured: false, provider: "disabled" };
  const requested = (process.env.SEARCH_PROVIDER || "").toLowerCase();
  if ((requested === "tavily" || !requested) && process.env.TAVILY_API_KEY) {
    return { enabled: true, configured: true, provider: "tavily", apiKey: process.env.TAVILY_API_KEY };
  }
  if ((requested === "brave" || !requested) && process.env.BRAVE_SEARCH_API_KEY) {
    return { enabled: true, configured: true, provider: "brave", apiKey: process.env.BRAVE_SEARCH_API_KEY };
  }
  if ((requested === "serpapi" || !requested) && process.env.SERPAPI_KEY) {
    return { enabled: true, configured: true, provider: "serpapi", apiKey: process.env.SERPAPI_KEY };
  }
  return { enabled: false, configured: false, provider: requested || "none" };
}

function slug(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function sourceFor(content, title = "用户上传资料") {
  const snippet = String(content || "").replace(/\s+/g, " ").trim().slice(0, 260);
  return [
    {
      sourceType: "local",
      documentId: `doc-${slug(title) || "upload"}`,
      documentTitle: title,
      snippet: snippet || "当前文件尚未完成正文解析，因此无法提供片段依据。",
      score: snippet ? 0.86 : 0.24,
      isParsed: Boolean(snippet),
    },
  ];
}

function mockAnalysis(content, fileName = "用户上传资料") {
  const text = String(content || "");
  const embedded = /stm32|gpio|pwm|oled|小车|电机|红外/i.test(text);
  const title = fileName || (embedded ? "STM32 智能循迹小车项目文档" : "AI 个人知识图谱系统资料");
  const keywords = embedded
    ? ["STM32", "GPIO", "PWM", "OLED", "红外循迹", "电机驱动"]
    : ["知识图谱", "RAG", "Embedding", "向量检索", "资料解析", "可信问答"];
  const projectLabel = embedded ? "STM32 智能循迹小车" : "知脉 AI 个人知识图谱系统";
  const nodes = [
    { id: "project-main", label: projectLabel, type: "project", group: "api", value: 32 },
    { id: "doc-main", label: title, type: "document", group: "api", value: 20 },
    ...keywords.map((keyword, index) => ({
      id: `tech-${slug(keyword) || index}`,
      label: keyword,
      type: index < 4 ? "tech" : "concept",
      group: "api",
      value: 12 + (index % 3) * 2,
    })),
    { id: "problem-source", label: embedded ? "联调问题定位" : "答案缺少来源", type: "problem", group: "api", value: 12 },
    { id: "output-summary", label: "项目总结", type: "output", group: "api", value: 14 },
  ];
  const edges = [
    { id: "edge-project-doc", from: "project-main", to: "doc-main", relationType: "belongs_to", label: "关联资料" },
    ...nodes
      .filter((node) => node.id.startsWith("tech-"))
      .map((node, index) => ({
        id: `edge-doc-${node.id}`,
        from: "doc-main",
        to: node.id,
        relationType: "mentions",
        label: "提到",
        weight: 0.68 + index * 0.03,
      })),
    { id: "edge-problem", from: "problem-source", to: "project-main", relationType: "related_to", label: "问题归因" },
    { id: "edge-output", from: "project-main", to: "output-summary", relationType: "generates", label: "生成" },
  ];
  return normalizeAnalysis({
    title,
    type: embedded ? "项目文档" : "知识库资料",
    summary: embedded
      ? "资料围绕 STM32 智能循迹小车展开，包含 GPIO、PWM、电机控制、OLED 显示和红外循迹等核心内容。"
      : "资料围绕个人知识图谱系统展开，包含资料解析、实体抽取、关系生成、可信问答和成果生成等内容。",
    keywords,
    entities: nodes,
    relations: edges,
    outputs: ["简历项目经历", "项目答辩稿", "PPT 大纲", "面试问答", "复习计划"],
    sources: sourceFor(text, title),
    confidence: 0.82,
  });
}

function mockAsk(question, localSources = [], webSources = []) {
  if (localSources.length === 0 && webSources.length === 0) {
    return {
      answer: "当前文件只有文件名，尚未完成正文解析，无法进行可靠回答。请重新上传可解析正文，或为扫描版 PDF 接入 OCR 后再提问。",
      sources: [],
      webSources: [],
      confidence: 0.12,
    };
  }
  const localText = localSources
    .slice(0, 4)
    .map((source, index) => `${index + 1}. ${source.documentTitle}：${source.snippet}`)
    .join("\n");
  const webText = webSources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. ${source.title}（${source.siteName}）：${source.snippet}`)
    .join("\n");
  return {
    answer: [
      `针对「${question}」，当前回答基于可用来源生成。`,
      localText ? `本地资料依据\n${localText}` : "本地资料依据\n没有命中可用正文片段。",
      webText ? `网页补充\n${webText}` : "",
      "可信度说明：如果没有本地正文片段或真实网页来源，本回答不应作为可靠结论。",
    ]
      .filter(Boolean)
      .join("\n\n"),
    sources: localSources,
    webSources,
    confidence: localSources.length >= 2 ? 0.82 : localSources.length ? 0.62 : 0.4,
  };
}

function mockOutput(type, context) {
  const titles = {
    resume: "简历项目经历",
    defense: "项目答辩稿",
    ppt: "PPT 大纲",
    interview: "面试问答",
    review: "复习计划",
    summary: "项目总结",
  };
  const title = titles[type] || "知识成果";
  const documents = Array.isArray(context?.documents) ? context.documents : [];
  const sources = documents
    .filter((document) => document.canAnswer && Array.isArray(document.chunks))
    .flatMap((document) =>
      document.chunks.slice(0, 1).map((chunk) => ({
        sourceType: "local",
        documentId: document.id,
        documentTitle: document.title,
        snippet: chunk.text,
        score: document.confidence || 0.78,
        isParsed: true,
      })),
    )
    .slice(0, 3);
  const content = `这是基于当前资料生成的「${title}」。当前后端处于 mock 或演示生成状态；配置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY 后，此接口会由后端代理调用真实模型生成内容。`;
  return {
    id: `api-output-${type}-${Date.now()}`,
    type,
    title,
    content,
    body: content,
    sources,
    createdAt: new Date().toISOString(),
    sourceStatus: "mock",
  };
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(raw.slice(first, last + 1));
    throw new Error("模型返回内容不是有效 JSON。");
  }
}

function normalizeSource(source, index = 0) {
  const snippet = String(source?.snippet || source?.text || "").slice(0, 500);
  const parsed = source?.isParsed !== undefined ? Boolean(source.isParsed) : Boolean(snippet.trim());
  return {
    sourceType: source?.sourceType || "local",
    documentId: String(source?.documentId || source?.id || `source-${index + 1}`),
    documentTitle: String(source?.documentTitle || source?.title || "资料来源"),
    snippet,
    score: Number.isFinite(Number(source?.score)) ? Number(source.score) : parsed ? 0.78 : 0.24,
    nodeId: source?.nodeId ? String(source.nodeId) : undefined,
    nodeLabel: source?.nodeLabel ? String(source.nodeLabel) : undefined,
    chunkId: source?.chunkId ? String(source.chunkId) : undefined,
    isParsed: parsed,
  };
}

function normalizeAnalysis(value) {
  const entities = Array.isArray(value?.entities) ? value.entities : [];
  const nodes = entities.slice(0, 120).map((node, index) => {
    const type = nodeTypes.has(node?.type) ? node.type : "concept";
    return {
      id: String(node?.id || `${type}-${index + 1}`),
      label: String(node?.label || node?.name || `节点 ${index + 1}`),
      type,
      group: String(node?.group || "ai"),
      description: node?.description ? String(node.description) : undefined,
      sourceDocumentIds: Array.isArray(node?.sourceDocumentIds) ? node.sourceDocumentIds.map(String) : undefined,
      value: Number.isFinite(Number(node?.value)) ? Number(node.value) : 10,
      confidence: Number.isFinite(Number(node?.confidence)) ? Number(node.confidence) : 0.82,
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const relations = Array.isArray(value?.relations) ? value.relations : [];
  const edges = relations
    .slice(0, 180)
    .map((edge, index) => ({
      id: String(edge?.id || `edge-${index + 1}`),
      from: String(edge?.from || ""),
      to: String(edge?.to || ""),
      label: edge?.label ? String(edge.label) : undefined,
      relationType: relationTypes.has(edge?.relationType) ? edge.relationType : "related_to",
      weight: Number.isFinite(Number(edge?.weight)) ? Number(edge.weight) : 0.68,
      confidence: Number.isFinite(Number(edge?.confidence)) ? Number(edge.confidence) : 0.8,
      evidence: edge?.evidence ? String(edge.evidence) : undefined,
    }))
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));

  return {
    title: String(value?.title || "AI 资料分析结果"),
    type: String(value?.type || "资料"),
    summary: String(value?.summary || "AI 已完成资料分析。"),
    keywords: Array.isArray(value?.keywords) ? value.keywords.map(String).slice(0, 16) : [],
    entities: nodes,
    relations: edges,
    outputs: Array.isArray(value?.outputs) ? value.outputs.map(String).slice(0, 8) : [],
    sources: Array.isArray(value?.sources) ? value.sources.map(normalizeSource) : [],
    confidence: Number.isFinite(Number(value?.confidence)) ? Number(value.confidence) : 0.82,
  };
}

function normalizeAsk(value) {
  return {
    answer: String(value?.answer || "当前资料不足以可靠回答。"),
    sources: Array.isArray(value?.sources) ? value.sources.map(normalizeSource) : [],
    webSources: Array.isArray(value?.webSources) ? value.webSources.map(normalizeWebSource) : [],
    confidence: Number.isFinite(Number(value?.confidence)) ? Number(value.confidence) : 0.62,
    warnings: Array.isArray(value?.warnings) ? value.warnings.map(String) : [],
    sourceStatus: value?.sourceStatus || "api",
  };
}

function normalizeWebSource(source) {
  return {
    title: String(source?.title || "网页来源"),
    siteName: String(source?.siteName || source?.site || "web"),
    url: String(source?.url || ""),
    snippet: String(source?.snippet || source?.summary || "").slice(0, 500),
    retrievedAt: String(source?.retrievedAt || new Date().toISOString()),
    relevance: Number.isFinite(Number(source?.relevance ?? source?.score)) ? Number(source?.relevance ?? source?.score) : undefined,
  };
}

function normalizeOutput(value, type) {
  const content = String(value?.content || value?.body || "当前资料不足以生成可靠成果。");
  return {
    id: String(value?.id || `api-output-${type}-${Date.now()}`),
    type,
    title: String(value?.title || "生成成果"),
    content,
    body: content,
    sources: Array.isArray(value?.sources) ? value.sources.map(normalizeSource) : [],
    createdAt: new Date().toISOString(),
    sourceStatus: value?.sourceStatus || "api",
  };
}

async function callChatJson(messages, temperature = 0.25, allowMock = true) {
  const config = getProviderConfig();
  if (config.provider === "mock") {
    if (!allowMock) {
      throw new Error("后端未检测到模型 API Key。请配置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY，或将前端切换到 VITE_AI_PROVIDER=mock。");
    }
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 45000));
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`模型接口返回 ${response.status}: ${text.slice(0, 240)}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型响应缺少 message.content。");
    return extractJson(content);
  } finally {
    clearTimeout(timer);
  }
}

function systemPrompt() {
  return [
    "你是知脉 AI 的后端分析代理。只返回严格 JSON，不要返回 Markdown。",
    "图谱节点 type 必须是 project/document/tech/problem/output/tag/concept。",
    "关系 relationType 必须是 mentions/belongs_to/uses/depends_on/solves/generates/related_to。",
    "所有回答必须基于用户资料、localSources 或 webSources；无法确认时降低 confidence，并在 sources 中给出依据片段。",
  ].join("\n");
}

async function analyze(payload) {
  const content = String(payload.content || "");
  const fileName = String(payload.fileName || payload.title || "用户上传资料");
  const allowMock = payload.allowMock !== false;
  if (!content.trim()) throw new Error("资料内容为空，无法分析。");
  const modelJson = await callChatJson(
    [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: `请分析以下资料并返回 JSON，字段必须包含 title,type,summary,keywords,entities,relations,outputs,sources,confidence。\n资料标题：${fileName}\n资料内容：\n${content.slice(0, 16000)}`,
      },
    ],
    0.18,
    allowMock,
  );
  if (modelJson) return normalizeAnalysis(modelJson);
  if (!allowMock) throw new Error("真实 AI 未返回分析结果。");
  return mockAnalysis(content, fileName);
}

async function ask(payload) {
  const question = String(payload.question || "");
  const allowMock = payload.allowMock !== false;
  if (!question.trim()) throw new Error("问题为空，无法回答。");
  const localSources = Array.isArray(payload.localSources) ? payload.localSources.map(normalizeSource) : [];
  const webSources = Array.isArray(payload.webSources) ? payload.webSources.map(normalizeWebSource) : [];
  if (localSources.length === 0 && webSources.length === 0) {
    return {
      ...mockAsk(question, [], []),
      sourceStatus: "local_rule",
      warnings: ["当前文件尚未生成可用正文片段，无法进行可靠回答。"],
    };
  }

  const modelJson = await callChatJson(
    [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: `请基于 sources 回答问题并返回 JSON，字段必须包含 answer,sources,webSources,confidence,warnings。\n问题：${question}\n本地来源：${JSON.stringify(localSources).slice(0, 12000)}\n网页来源：${JSON.stringify(webSources).slice(0, 6000)}\n上下文：${JSON.stringify(payload.context || {}).slice(0, 3000)}`,
      },
    ],
    0.28,
    allowMock,
  );
  if (modelJson) return normalizeAsk(modelJson);
  if (!allowMock) throw new Error("真实 AI 未返回问答结果。");
  return { ...mockAsk(question, localSources, webSources), sourceStatus: "mock" };
}

async function generateOutput(payload) {
  const type = String(payload.type || "summary");
  const context = payload.context ?? "";
  const allowMock = payload.allowMock !== false;
  const modelJson = await callChatJson(
    [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: `请生成指定成果并返回 JSON，字段必须包含 title,content,sources。\n成果类型：${type}\n上下文：${JSON.stringify(context).slice(0, 18000)}`,
      },
    ],
    0.34,
    allowMock,
  );
  if (modelJson) return normalizeOutput(modelJson, type);
  if (!allowMock) throw new Error("真实 AI 未返回成果生成结果。");
  return mockOutput(type, context);
}

async function searchWithTavily(config, query, retrievedAt) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.apiKey,
      query,
      search_depth: "basic",
      include_answer: false,
      max_results: 5,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily Search API 返回 ${response.status}: ${text.slice(0, 240)}`);
  }
  const data = await response.json();
  return Array.isArray(data?.results)
    ? data.results.slice(0, 5).map((item) => ({
        title: String(item.title || "网页来源"),
        siteName: safeHost(item.url),
        url: String(item.url || ""),
        snippet: String(item.content || item.snippet || "").slice(0, 500),
        retrievedAt,
        relevance: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
      }))
    : [];
}

async function searchWithBrave(config, query, retrievedAt) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": config.apiKey,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Brave Search API 返回 ${response.status}: ${text.slice(0, 240)}`);
  }
  const data = await response.json();
  return Array.isArray(data?.web?.results)
    ? data.web.results.slice(0, 5).map((item, index) => ({
        title: String(item.title || "网页来源"),
        siteName: safeHost(item.url),
        url: String(item.url || ""),
        snippet: String(item.description || item.extra_snippets?.[0] || "").slice(0, 500),
        retrievedAt,
        relevance: Number((1 - index * 0.08).toFixed(2)),
      }))
    : [];
}

async function searchWithSerpApi(config, query, retrievedAt) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("num", "5");
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SerpApi 返回 ${response.status}: ${text.slice(0, 240)}`);
  }
  const data = await response.json();
  return Array.isArray(data?.organic_results)
    ? data.organic_results.slice(0, 5).map((item, index) => ({
        title: String(item.title || "网页来源"),
        siteName: safeHost(item.link),
        url: String(item.link || ""),
        snippet: String(item.snippet || "").slice(0, 500),
        retrievedAt,
        relevance: Number((1 - index * 0.08).toFixed(2)),
      }))
    : [];
}

async function searchWeb(payload) {
  const query = String(payload.query || "").trim();
  if (!query) throw new Error("搜索问题为空。");
  const config = getSearchConfig();
  if (!config.enabled || !config.configured) {
    return {
      sources: [],
      warning: "联网搜索暂未配置，请在后端配置搜索 API。",
    };
  }

  const retrievedAt = new Date().toISOString();
  const sources =
    config.provider === "tavily"
      ? await searchWithTavily(config, query, retrievedAt)
      : config.provider === "brave"
        ? await searchWithBrave(config, query, retrievedAt)
        : config.provider === "serpapi"
          ? await searchWithSerpApi(config, query, retrievedAt)
          : [];
  return { sources, provider: config.provider };
}

function safeHost(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

async function route(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    jsonResponse(res, 204, {});
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    const config = getProviderConfig();
    const search = getSearchConfig();
    jsonResponse(res, 200, {
      ok: true,
      provider: config.provider,
      model: config.model,
      search: { enabled: search.enabled, configured: search.configured, provider: search.provider },
      ocr: {
        enabled: false,
        configured: Boolean(process.env.OCR_API_KEY || process.env.OCR_PROVIDER),
        provider: process.env.OCR_PROVIDER || "none",
      },
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/auth/demo-users") {
    const db = readDb();
    jsonResponse(res, 200, { users: db.users.map(publicUser) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const db = readDb();
    const token = tokenFromRequest(req);
    const session = db.sessions.find((item) => item.token === token);
    const user = session ? db.users.find((item) => item.id === session.userId) : null;
    if (!user) {
      jsonResponse(res, 401, { error: "登录会话已失效，请重新登录。" });
      return;
    }
    session.lastSeenAt = nowIso();
    user.lastActiveAt = nowIso();
    user.isOnline = true;
    user.online = true;
    saveDb(db);
    jsonResponse(res, 200, authSnapshot(db, user, undefined, session.currentWorkspaceId ?? null));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/admin/overview") {
    const db = readDb();
    const user = userFromRequest(req, db);
    if (user.role !== "admin" || user.canAccessAdminPanel === false) {
      jsonResponse(res, 403, { error: "只有管理员可以查看后台数据。" });
      return;
    }
    jsonResponse(res, 200, {
      users: db.users.map(publicUser),
      loginLogs: db.loginLogs,
      activityLogs: db.activityLogs,
      metrics: db.trafficStats,
      settings: db.settings,
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    const db = readDb();
    const user = userFromRequest(req, db);
    jsonResponse(res, 200, {
      workspaces: accessibleWorkspaces(db, user),
    });
    return;
  }
  const dataMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/data$/);
  if (req.method === "GET" && dataMatch) {
    const db = readDb();
    const workspaceId = decodeURIComponent(dataMatch[1]);
    const { user, workspace } = enforceWorkspaceAccess(req, { workspaceId }, "read", db);
    if (workspace.type === "admin_public") {
      recordActivity(db, { user, workspaceId, actionType: "enter_shared_graph", targetType: "workspace", targetId: workspaceId, detail: "进入管理员共享星图", req });
      saveDb(db);
    }
    jsonResponse(res, 200, db.workspaceData[workspaceId] ?? emptyDataset(workspaceId));
    return;
  }
  if (req.method !== "POST") {
    jsonResponse(res, 405, { error: "只支持 POST 请求。" });
    return;
  }

  try {
    const payload = await readJson(req);
    if (url.pathname === "/api/auth/login") {
      const db = readDb();
      const username = String(payload.username || "").trim().toLowerCase();
      const password = String(payload.password || "");
      const user = findUserByLogin(db, username);
      if (!user) {
        recordLogin(db, { username }, req, false, "账号不存在，请检查账号或先注册。");
        saveDb(db);
        jsonResponse(res, 404, { error: "账号不存在，请检查账号或先注册。" });
        return;
      }
      if (user.status === "disabled" || user.enabled === false) {
        recordLogin(db, user, req, false, "该账号已被停用，请联系管理员。");
        saveDb(db);
        jsonResponse(res, 403, { error: "该账号已被停用，请联系管理员。" });
        return;
      }
      if (!verifyPassword(user, password)) {
        recordLogin(db, user, req, false, "密码错误，请重新输入。");
        saveDb(db);
        jsonResponse(res, 401, { error: "密码错误，请重新输入。" });
        return;
      }
      const token = createToken(db, user, req);
      user.lastLoginAt = nowIso();
      user.lastLoginIp = requestIp(req);
      user.lastIp = user.lastLoginIp;
      user.lastActiveAt = nowIso();
      user.isOnline = true;
      user.online = true;
      user.loginCount = (user.loginCount ?? 0) + 1;
      recordLogin(db, user, req, true);
      saveDb(db);
      jsonResponse(res, 200, authSnapshot(db, user, token));
      return;
    }
    if (url.pathname === "/api/auth/register") {
      const db = readDb();
      if (db.settings.allowRegistration === false) {
        jsonResponse(res, 403, { error: "当前系统未开放注册。" });
        return;
      }
      const username = String(payload.username || "").trim();
      const email = String(payload.email || "").trim();
      const password = String(payload.password || "");
      if (username.length < 2 || email.length < 3 || password.length < 6) {
        jsonResponse(res, 400, { error: "请填写有效用户名、邮箱/账号和至少 6 位密码。" });
        return;
      }
      if (username.toLowerCase() === "admin" || email.toLowerCase() === "admin" || email.toLowerCase() === "admin@zhimai.local") {
        jsonResponse(res, 409, { error: "admin 为系统管理员账号，不能用于注册。" });
        return;
      }
      if (findUserByLogin(db, username) || findUserByLogin(db, email)) {
        jsonResponse(res, 409, { error: "该用户名或邮箱/账号已存在。" });
        return;
      }
      const stamp = nowIso();
      const user = {
        id: `user_${Date.now()}_${randomBytes(4).toString("hex")}`,
        username,
        email,
        role: "user",
        status: "active",
        createdAt: stamp,
        lastLoginAt: stamp,
        lastLoginIp: requestIp(req),
        lastIp: requestIp(req),
        lastActiveAt: stamp,
        isOnline: true,
        online: true,
        enabled: true,
        canManageWorkspace: false,
        canAccessAdminPanel: false,
        canEditAdminGraph: false,
        loginCount: 1,
        ...createPasswordRecord(password),
      };
      db.users.push(user);
      db.workspaces.push(createWorkspace(user));
      db.workspaceData[privateWorkspaceId(user.id)] = emptyDataset(privateWorkspaceId(user.id));
      const token = createToken(db, user, req);
      recordLogin(db, user, req, true);
      recordActivity(db, { user, workspaceId: privateWorkspaceId(user.id), actionType: "register", targetType: "user", targetId: user.id, detail: `${username} 注册并创建个人星图`, req });
      saveDb(db);
      jsonResponse(res, 200, authSnapshot(db, user, token));
      return;
    }
    if (url.pathname === "/api/auth/logout") {
      const db = readDb();
      const token = tokenFromRequest(req);
      const session = db.sessions.find((item) => item.token === token);
      const user = session ? db.users.find((item) => item.id === session.userId) : null;
      if (user) {
        user.isOnline = false;
        user.online = false;
        user.lastActiveAt = nowIso();
        recordActivity(db, { user, workspaceId: payload.workspaceId, actionType: "logout", targetType: "user", targetId: user.id, detail: `${user.username} 退出登录`, req });
      }
      db.sessions = db.sessions.filter((item) => item.token !== token);
      saveDb(db);
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/auth/profile") {
      const db = readDb();
      const user = userFromRequest(req, db);
      const username = String(payload.username || user.username).trim();
      const email = String(payload.email || user.email).trim();
      if (username.length < 2 || email.length < 3) {
        jsonResponse(res, 400, { error: "用户名和邮箱/账号不能为空。" });
        return;
      }
      if (username.toLowerCase() === "admin" && user.username !== "admin") {
        jsonResponse(res, 409, { error: "admin 为系统管理员账号，不能用于普通用户。" });
        return;
      }
      const duplicated = db.users.some((item) => item.id !== user.id && (String(item.username).toLowerCase() === username.toLowerCase() || String(item.email).toLowerCase() === email.toLowerCase()));
      if (duplicated) {
        jsonResponse(res, 409, { error: "用户名或邮箱/账号已被占用。" });
        return;
      }
      user.username = user.username === "admin" ? "admin" : username;
      user.email = email;
      user.lastActiveAt = nowIso();
      if (payload.password) {
        if (String(payload.password).length < 6) throw new Error("新密码至少需要 6 位。");
        Object.assign(user, createPasswordRecord(String(payload.password)), { mustChangePassword: false });
      }
      recordActivity(db, { user, workspaceId: payload.workspaceId, actionType: "settings", targetType: "user", targetId: user.id, detail: "更新个人资料", req });
      saveDb(db);
      jsonResponse(res, 200, authSnapshot(db, user));
      return;
    }
    if (url.pathname === "/api/admin/users") {
      const db = readDb();
      const admin = userFromRequest(req, db);
      if (admin.role !== "admin" || admin.canAccessAdminPanel === false) throw Object.assign(new Error("只有管理员可以管理用户。"), { statusCode: 403 });
      const user = db.users.find((item) => item.id === payload.userId);
      if (!user) throw Object.assign(new Error("用户不存在。"), { statusCode: 404 });
      if (user.id === admin.id && (payload.action === "disable" || payload.action === "delete")) throw new Error("不能停用或删除当前管理员账号。");
      if (payload.action === "enable" || payload.action === "disable") {
        user.status = payload.action === "enable" ? "active" : "disabled";
        user.enabled = payload.action === "enable";
        if (!user.enabled) user.isOnline = false;
      } else if (payload.action === "delete") {
        db.users = db.users.filter((item) => item.id !== user.id);
        db.workspaces = db.workspaces.filter((workspace) => workspace.ownerId !== user.id);
        delete db.workspaceData[privateWorkspaceId(user.id)];
      } else if (payload.action === "password") {
        Object.assign(user, createPasswordRecord(String(payload.password || "")), { mustChangePassword: true });
      }
      recordActivity(db, { user: admin, workspaceId: ADMIN_PUBLIC_WORKSPACE_ID, actionType: "settings", targetType: "user", targetId: payload.userId, detail: `管理员执行用户操作：${payload.action}`, req });
      saveDb(db);
      jsonResponse(res, 200, authSnapshot(db, admin));
      return;
    }
    if (dataMatch && url.pathname.endsWith("/data")) {
      const db = readDb();
      const workspaceId = decodeURIComponent(dataMatch[1]);
      const { user, workspace } = enforceWorkspaceAccess(req, { workspaceId }, "write", db);
      const current = db.workspaceData[workspaceId] ?? emptyDataset(workspaceId);
      const nextData = {
        ...current,
        documents: Array.isArray(payload.documents) ? payload.documents : current.documents,
        graph: payload.graph && Array.isArray(payload.graph.nodes) && Array.isArray(payload.graph.edges) ? payload.graph : current.graph,
        outputs: Array.isArray(payload.outputs) ? payload.outputs : current.outputs,
        recentActivities: Array.isArray(payload.recentActivities) ? payload.recentActivities : current.recentActivities,
        revision: (current.revision ?? 0) + 1,
        workspaceId,
        updatedAt: nowIso(),
      };
      db.workspaceData[workspaceId] = nextData;
      const activityType = nextData.documents.length > current.documents.length ? "upload" : "sync_workspace";
      recordActivity(db, { user, workspaceId, actionType: activityType, targetType: "workspace", targetId: workspaceId, detail: `同步空间数据：${workspace.name}`, req });
      const workspaceRecord = db.workspaces.find((item) => item.id === workspaceId);
      if (workspaceRecord) {
        workspaceRecord.updatedAt = nowIso();
        workspaceRecord.version = (workspaceRecord.version ?? 1) + 1;
        if (workspaceRecord.type === "admin_public") workspaceRecord.lastPublishedAt = nowIso();
      }
      saveDb(db);
      jsonResponse(res, 200, nextData);
      return;
    }
    if (url.pathname === "/api/activity") {
      const db = readDb();
      const user = userFromRequest(req, db);
      recordActivity(db, {
        user,
        workspaceId: payload.workspaceId,
        actionType: String(payload.actionType || "activity"),
        targetType: String(payload.targetType || ""),
        targetId: String(payload.targetId || ""),
        detail: String(payload.detail || ""),
        req,
      });
      user.lastActiveAt = nowIso();
      user.isOnline = true;
      user.online = true;
      saveDb(db);
      jsonResponse(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/migrate-local-data") {
      const db = readDb();
      const user = userFromRequest(req, db);
      const workspaceId = String(payload.workspaceId || ADMIN_PUBLIC_WORKSPACE_ID);
      enforceWorkspaceAccess(req, { workspaceId }, "write", db);
      const data = payload.data ?? {};
      db.workspaceData[workspaceId] = {
        ...emptyDataset(workspaceId),
        documents: Array.isArray(data.documents) ? data.documents : [],
        graph: data.graph && Array.isArray(data.graph.nodes) && Array.isArray(data.graph.edges) ? data.graph : { nodes: [], edges: [] },
        outputs: Array.isArray(data.outputs) ? data.outputs : [],
        recentActivities: Array.isArray(data.recentActivities) ? data.recentActivities : [],
        revision: (db.workspaceData[workspaceId]?.revision ?? 0) + 1,
        updatedAt: nowIso(),
      };
      recordActivity(db, { user, workspaceId, actionType: "migrate_local_data", targetType: "workspace", targetId: workspaceId, detail: "迁移本地 Demo 数据到云端共享星图", req });
      saveDb(db);
      jsonResponse(res, 200, db.workspaceData[workspaceId]);
      return;
    }
    if (url.pathname === "/api/ai/analyze") {
      const db = readDb();
      enforceWorkspaceAccess(req, payload, "write", db);
      jsonResponse(res, 200, {
        ...(await analyze(payload)),
      });
      return;
    }
    if (url.pathname === "/api/ai/ask") {
      const db = readDb();
      const { user, workspace } = enforceWorkspaceAccess(req, payload, "read", db);
      recordActivity(db, { user, workspaceId: workspace?.id, actionType: "ask", targetType: "copilot", detail: String(payload.question || "").slice(0, 120), req });
      saveDb(db);
      jsonResponse(res, 200, await ask(payload));
      return;
    }
    if (url.pathname === "/api/ai/generate-output") {
      const db = readDb();
      enforceWorkspaceAccess(req, payload, "write", db);
      jsonResponse(res, 200, await generateOutput(payload));
      return;
    }
    if (url.pathname === "/api/search") {
      const db = readDb();
      enforceWorkspaceAccess(req, payload, "read", db);
      const result = await searchWeb(payload);
      jsonResponse(res, result.warning ? 501 : 200, result);
      return;
    }
    jsonResponse(res, 404, { error: "接口不存在。" });
  } catch (error) {
    console.error("[ai-proxy]", error);
    const statusCode = Number.isFinite(error?.statusCode) ? error.statusCode : 400;
    jsonResponse(res, statusCode, { error: error instanceof Error ? error.message : "AI 代理服务处理失败。" });
  }
}

createServer((req, res) => {
  void route(req, res);
}).listen(PORT, "127.0.0.1", () => {
  const config = getProviderConfig();
  const search = getSearchConfig();
  console.log(`Zhimai AI proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`AI provider: ${config.provider}${config.provider === "mock" ? " (no API key detected)" : ` / ${config.model}`}`);
  console.log(`Search provider: ${search.enabled ? search.provider : "not configured"}`);
});
