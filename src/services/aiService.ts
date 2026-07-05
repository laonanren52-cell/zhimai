import { mockDocuments } from "../data/mockDocuments";
import { getAuthHeaders } from "./authService";
import { apiClient, getApiBaseUrl } from "./apiClient";
import type { AnswerMode, GeneratedOutput, GeneratedOutputType, QAResult, WebSourceReference } from "../types/ai";
import type { KnowledgeDocument, ParsedDocument } from "../types/document";
import type { AnalysisResult, GraphData, GraphEdge, GraphNode, GraphNodeType, SourceReference } from "../types/graph";

const provider = import.meta.env.VITE_AI_PROVIDER ?? "mock";

export type ClientAiProvider = "mock" | "api" | "deepseek" | "openai" | "local" | string;

export interface BackendHealth {
  ok: boolean;
  provider: string;
  model: string;
  search?: { enabled: boolean; provider: string; configured?: boolean };
  ocr?: { enabled: boolean; configured?: boolean; provider?: string };
}

export interface AskOptions {
  mode?: AnswerMode;
  context?: {
    nodeId?: string;
    nodeLabel?: string;
    nodeType?: GraphNodeType;
    relatedDocumentIds?: string[];
    sourceSnippets?: SourceReference[];
    neighborLabels?: string[];
  } | null;
}

type TopicPreset = {
  title: string;
  type: string;
  summary: string;
  keywords: string[];
  project: string;
  tech: string[];
  problems: string[];
  concepts: string[];
  outputs: string[];
  tag: string;
  confidence: number;
};

export function getClientAiConfig() {
  return { provider: provider as ClientAiProvider, apiBaseUrl: getApiBaseUrl(), isMockMode: provider === "mock" };
}

export async function getBackendAiHealth(): Promise<BackendHealth> {
  return apiClient<BackendHealth>("/api/health");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function slug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .slice(0, 42);
}

function buildNode(baseId: string, label: string, type: GraphNodeType, index: number, group: string, description: string): GraphNode {
  const angle = index * 0.72;
  const ring = type === "project" ? 0 : type === "tech" ? 2 : type === "problem" ? 3 : 1;
  const radius = type === "project" ? 0 : 110 + ring * 44 + (index % 3) * 18;
  return {
    id: `${baseId}-${type}-${slug(label) || index}`,
    label,
    type,
    group,
    cluster: group,
    description,
    value: type === "project" ? 34 : type === "document" ? 20 : type === "output" ? 16 : type === "tech" ? 13 : 10,
    confidence: Number((0.82 + (index % 9) / 100).toFixed(2)),
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
  };
}

function connect(baseId: string, from: GraphNode, to: GraphNode, index: number, label: string): GraphEdge {
  const relationType: GraphEdge["relationType"] =
    index % 5 === 0 ? "uses" : index % 5 === 1 ? "mentions" : index % 5 === 2 ? "depends_on" : index % 5 === 3 ? "solves" : "related_to";
  return {
    id: `${baseId}-edge-${slug(from.label)}-${slug(to.label)}-${index}`,
    from: from.id,
    to: to.id,
    label,
    relationType,
    weight: Number((0.58 + (index % 5) * 0.08).toFixed(2)),
    confidence: Number((0.8 + (index % 12) / 100).toFixed(2)),
    evidence: `${from.label} 与 ${to.label} 在上传资料中形成「${label}」关系。`,
  };
}

function topicPreset(content: string, fileName = "上传资料"): TopicPreset {
  const normalized = `${fileName}\n${content}`.toLowerCase();
  if (/stm32|gpio|pwm|oled|小车|电机|红外|循迹/.test(normalized)) {
    return {
      title: fileName.replace(/\.[^.]+$/, "") || "STM32 智能小车项目资料",
      type: "项目文档",
      summary: "资料围绕 STM32 智能循迹小车展开，涉及 GPIO 采样、PWM 调速、OLED 状态显示、电机驱动和红外循迹调试。",
      keywords: ["STM32", "GPIO", "PWM", "OLED", "红外循迹", "电机驱动", "嵌入式答辩"],
      project: "STM32 智能循迹小车",
      tech: ["STM32F103", "GPIO", "PWM", "OLED", "I2C", "红外循迹", "电机驱动"],
      problems: ["红外误判", "PWM 抖动", "OLED 不亮"],
      concepts: ["差速控制", "软硬件联调", "传感器采样"],
      outputs: ["简历项目经历", "嵌入式项目答辩稿", "PPT 大纲", "面试问答"],
      tag: "嵌入式项目",
      confidence: 0.91,
    };
  }
  if (/福伴|老人|健康|陪伴|购物|家属|机器人|饮食/.test(normalized)) {
    return {
      title: fileName.replace(/\.[^.]+$/, "") || "福伴机器人项目资料",
      type: "产品项目资料",
      summary: "资料聚焦老人健康生活陪伴机器人，包含饮食管理、购物导航、健康提醒、家属反馈和低打扰陪伴体验。",
      keywords: ["福伴机器人", "老人", "饮食管理", "购物导航", "家属反馈", "健康提醒"],
      project: "福伴 AI 健康陪伴机器人",
      tech: ["任务规划", "语音交互", "用户画像", "健康提醒", "异常检测"],
      problems: ["提醒打扰过多", "老人配置困难", "家属信息滞后"],
      concepts: ["低打扰陪伴", "家庭协同", "场景化任务", "可信解释"],
      outputs: ["路演稿", "商业计划摘要", "用户故事", "答辩问答"],
      tag: "健康陪伴",
      confidence: 0.88,
    };
  }
  return {
    title: fileName.replace(/\.[^.]+$/, "") || "个人知识资料",
    type: "知识资料",
    summary: "资料已被整理为项目、概念、技术点、问题和成果节点，可进入知识星图继续追溯、问答和生成。",
    keywords: ["知识图谱", "资料解析", "来源追溯", "可信问答", "成果生成"],
    project: "个人知识资产",
    tech: ["知识图谱", "RAG", "资料解析", "来源引用", "任务型助手"],
    problems: ["资料分散", "来源难追溯", "成果复用低"],
    concepts: ["实体抽取", "关系推理", "知识星图", "可信生成"],
    outputs: ["资料摘要", "项目总结", "PPT 大纲", "复习计划"],
    tag: "知识沉淀",
    confidence: 0.84,
  };
}

function sourceFromContent(content: string, fileName?: string): SourceReference[] {
  const snippet = content.replace(/\s+/g, " ").trim().slice(0, 360);
  if (!snippet) return [];
  return [
    {
      sourceType: "local",
      documentId: `pending-${slug(fileName ?? "upload") || "upload"}`,
      documentTitle: fileName ?? "上传资料",
      snippet,
      score: 0.82,
      isParsed: true,
    },
  ];
}

function getMockAnalysis(content: string, fileName?: string, parsed?: ParsedDocument): AnalysisResult {
  const preset = topicPreset(content, fileName);
  const baseId = `upload-${Date.now()}-${slug(fileName ?? preset.title) || "doc"}`;
  const group = baseId;
  const description = (label: string) => `${label} 来自「${preset.title}」的资料解析，可用于问答、追溯和成果生成。`;
  const nodes = [
    buildNode(baseId, preset.project, "project", 0, group, description(preset.project)),
    ...preset.tech.map((label, index) => buildNode(baseId, label, "tech", index + 1, group, description(label))),
    ...preset.problems.map((label, index) => buildNode(baseId, label, "problem", index + 20, group, description(label))),
    ...preset.concepts.map((label, index) => buildNode(baseId, label, "concept", index + 32, group, description(label))),
    buildNode(baseId, preset.tag, "tag", 48, group, description(preset.tag)),
    buildNode(baseId, preset.outputs[0], "output", 52, group, description(preset.outputs[0])),
  ];
  const project = nodes[0];
  const relations = nodes.slice(1).map((node, index) => connect(baseId, project, node, index, index < 8 ? "提及" : "相关"));
  const techNodes = nodes.filter((node) => node.type === "tech");
  const problemNodes = nodes.filter((node) => node.type === "problem");
  const crossRelations = problemNodes.flatMap((problem, index) => {
    const tech = techNodes[index % Math.max(1, techNodes.length)];
    return tech ? [connect(baseId, tech, problem, index + 60, "解决")] : [];
  });
  return {
    title: preset.title,
    type: preset.type,
    summary: preset.summary,
    keywords: preset.keywords,
    entities: nodes,
    relations: [...relations, ...crossRelations],
    outputs: preset.outputs,
    sources: sourceFromContent(content, fileName),
    confidence: confidenceForParsed(preset.confidence, parsed),
    parsing: parsed?.diagnostics,
  };
}

function confidenceForParsed(baseConfidence: number, parsed?: ParsedDocument) {
  const diagnostics = parsed?.diagnostics;
  if (!diagnostics) return baseConfidence;
  if (!diagnostics.canAnswer) return Math.min(baseConfidence, 0.2);
  if (diagnostics.status === "moderate_anomaly") return Math.min(Number((baseConfidence * 0.58).toFixed(2)), 0.56);
  if (diagnostics.status === "mild_anomaly" || diagnostics.status === "short_text") return Math.min(Number((baseConfidence * 0.82).toFixed(2)), 0.78);
  return baseConfidence;
}

export function buildUnavailableAnalysis(fileName: string, parsed: ParsedDocument): AnalysisResult {
  return {
    title: fileName,
    type: "解析失败资料",
    summary: parsed.diagnostics.message,
    keywords: ["正文不可用", parsed.kind.toUpperCase(), parsed.diagnostics.needsOcr ? "需要 OCR" : "需要重新解析"].filter(Boolean),
    entities: [],
    relations: [],
    outputs: [],
    sources: [],
    confidence: 0.18,
    parsing: parsed.diagnostics,
  };
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  return apiClient<T>(path, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
}

async function callApiStrict<T>(operation: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    throw new Error(`${operation} 请求失败：${reason}`);
  }
}

function normalizeSourceReference(source: SourceReference): SourceReference {
  const snippet = source.snippet || "";
  const isParsed = source.isParsed ?? Boolean(snippet.trim());
  return {
    ...source,
    sourceType: source.sourceType ?? "local",
    snippet,
    score: source.score ?? (isParsed ? 0.78 : 0.24),
    isParsed,
  };
}

function normalizeApiAnalysis(value: AnalysisResult): AnalysisResult {
  return {
    ...value,
    keywords: value.keywords ?? [],
    entities: value.entities ?? [],
    relations: value.relations ?? [],
    outputs: value.outputs ?? [],
    sources: (value.sources ?? []).map(normalizeSourceReference),
    confidence: value.confidence ?? 0.75,
  };
}

function normalizeApiAnswer(value: QAResult, mode: AnswerMode, extraWarnings: string[] = []): QAResult {
  return {
    answer: value.answer || "当前资料不足以可靠回答。",
    sources: uniqueSources((value.sources ?? []).map(normalizeSourceReference)),
    webSources: value.webSources ?? [],
    confidence: value.confidence ?? 0.62,
    mode: value.mode ?? mode,
    warnings: [...new Set([...(value.warnings ?? []), ...extraWarnings])],
    sourceStatus: value.sourceStatus ?? "api",
  };
}

function normalizeApiOutput(value: GeneratedOutput & { content?: string }, type: GeneratedOutputType): GeneratedOutput {
  return {
    ...value,
    id: value.id ?? `api-output-${type}-${Date.now()}`,
    type: value.type ?? type,
    title: value.title ?? "生成成果",
    body: value.body ?? value.content ?? "",
    sources: uniqueSources((value.sources ?? []).map(normalizeSourceReference)),
    createdAt: value.createdAt ?? new Date().toISOString(),
    sourceStatus: value.sourceStatus ?? "api",
  };
}

export async function analyzeDocument(content: string, fileName?: string, parsed?: ParsedDocument): Promise<AnalysisResult> {
  if (!content.trim()) throw new Error("当前文件正文解析失败，暂不能用于可靠 AI 分析。");
  if (provider === "api") {
    return callApiStrict("analyzeDocument", async () =>
      normalizeApiAnalysis(await postApi<AnalysisResult>("/api/ai/analyze", { content, fileName, parsing: parsed?.diagnostics, allowMock: false })),
    );
  }
  await delay(260);
  return getMockAnalysis(content, fileName, parsed);
}

export async function analyzeDocumentMock(content: string, fileName?: string, parsed?: ParsedDocument): Promise<AnalysisResult> {
  if (!content.trim()) throw new Error("当前文件正文解析失败，暂不能用于 mock 分析。");
  await delay(180);
  return getMockAnalysis(content, fileName, parsed);
}

export async function generateGraph(analysisResult: AnalysisResult): Promise<GraphData> {
  await delay(160);
  return { nodes: analysisResult.entities, edges: analysisResult.relations };
}

export function shouldUseWeb(question: string, mode: AnswerMode, localSources: SourceReference[]) {
  if (mode === "web") return true;
  if (mode === "library") return false;
  if (localSources.length === 0) return true;
  return hasWebIntent(question);
}

function hasWebIntent(question: string) {
  return /联网|搜索|查一下|查一查|找最新|最新|新闻|价格|政策|官网|今天|当前|现在|实时|2026|近期/.test(question);
}

async function searchWeb(question: string): Promise<{ sources: WebSourceReference[]; warning?: string }> {
  try {
    return await postApi<{ sources: WebSourceReference[]; warning?: string }>("/api/search", { query: question });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "搜索服务请求失败。";
    const unconfigured = /未配置|501|not configured/i.test(reason);
    return {
      sources: [],
      warning: unconfigured ? "联网搜索暂未配置，请在后端配置搜索 API。" : `联网搜索失败：${reason}`,
    };
  }
}

export async function askWithSources(question: string, documents: KnowledgeDocument[] = mockDocuments, options: AskOptions = {}): Promise<QAResult> {
  const mode = options.mode ?? "hybrid";
  if (!question.trim()) throw new Error("请输入需要基于资料回答的问题。");

  const localSources = collectLocalSources(question, documents, options.context);
  const webNeeded = shouldUseWeb(question, mode, localSources);
  const webResult = webNeeded ? await searchWeb(question) : { sources: [] as WebSourceReference[] };
  const warnings = [
    mode === "library" && hasWebIntent(question) ? "当前为仅资料库模式，不会联网检索。需要最新资料时请切换到联网增强或混合验证。" : null,
    webResult.warning,
    mode !== "web" && localSources.length === 0 && webResult.sources.length > 0 ? "本地资料没有可用正文片段，以下回答只能作为网页搜索补充。" : null,
  ].filter((item): item is string => Boolean(item));

  if (mode !== "web" && localSources.length === 0 && webResult.sources.length === 0) {
    return {
      answer: "当前文件尚未生成可用正文片段，无法进行可靠回答。请重新上传可解析正文，或为扫描版 PDF 接入 OCR 后再提问。",
      sources: [],
      webSources: webResult.sources,
      confidence: 0.12,
      mode,
      warnings,
      sourceStatus: provider === "mock" ? "mock" : "local_rule",
    };
  }

  if (provider === "api") {
    return callApiStrict("askWithSources", async () =>
      normalizeApiAnswer(
        await postApi<QAResult>("/api/ai/ask", {
          question,
          mode,
          documents: documents.filter((document) => document.canAnswer),
          localSources,
          webSources: webResult.sources,
          context: options.context,
          allowMock: false,
        }),
        mode,
        warnings,
      ),
    );
  }

  await delay(240);
  return buildLocalAnswer(question, localSources, webResult.sources, mode, warnings, options.context);
}

function collectLocalSources(question: string, documents: KnowledgeDocument[], context?: AskOptions["context"]) {
  const relatedIds = new Set(context?.relatedDocumentIds ?? []);
  const terms = normalizeTerms(`${question} ${context?.nodeLabel ?? ""} ${context?.neighborLabels?.join(" ") ?? ""}`);
  const scored = documents
    .filter((document) => document.canAnswer && document.chunks?.length)
    .flatMap((document) =>
      document.chunks.map((chunk) => {
        const haystack = `${document.title} ${document.summary} ${document.keywords.join(" ")} ${chunk.text}`.toLowerCase();
        const termScore = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 3 : 0), 0);
        const contextScore = relatedIds.has(document.id) ? 8 : 0;
        return { document, chunk, score: termScore + contextScore + document.confidence };
      }),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const mapped = scored.map<SourceReference>(({ document, chunk, score }) => ({
    sourceType: "local",
    documentId: document.id,
    documentTitle: document.title,
    snippet: chunk.text,
    score: Math.min(0.96, Math.max(0.48, score / 14)),
    nodeId: context?.nodeId,
    nodeLabel: context?.nodeLabel,
    chunkId: chunk.id,
    isParsed: true,
  }));

  return uniqueSources([...(context?.sourceSnippets ?? []), ...mapped]);
}

function normalizeTerms(value: string) {
  return value
    .toLowerCase()
    .split(/[\s,，。；;:：、?？!！/\\|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 24);
}

function uniqueSources(sources: SourceReference[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.documentId}-${source.chunkId ?? source.snippet.slice(0, 48)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLocalAnswer(
  question: string,
  sources: SourceReference[],
  webSources: WebSourceReference[],
  mode: AnswerMode,
  warnings: string[],
  context?: AskOptions["context"],
): QAResult {
  const localSummary = sources
    .slice(0, 4)
    .map((source, index) => `${index + 1}. ${source.documentTitle}：${source.snippet}`)
    .join("\n");
  const webSummary = webSources
    .slice(0, 3)
    .map((source, index) => `${index + 1}. ${source.title}（${source.siteName}）：${source.snippet}`)
    .join("\n");
  const nodeLine = context?.nodeLabel ? `当前节点：${context.nodeLabel}。` : "";

  const answer = [
    `回答模式：${modeLabel(mode)}。${nodeLine}`,
    localSummary ? `本地资料结论\n${localSummary}` : "本地资料结论\n当前本地资料不足或没有可用正文片段。",
    webSummary ? `网页补充\n${webSummary}` : warnings.length ? `网页补充\n${warnings.join("；")}` : "",
    "可信度说明\n本回答优先依据本地资料片段；网页来源只有在搜索 API 返回真实结果时才作为补充依据。",
    `针对问题「${question}」，建议继续在星图中查看相关节点和来源片段，必要时补充可解析正文。`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    answer,
    sources,
    webSources,
    confidence: sources.length >= 2 ? 0.82 : sources.length === 1 ? 0.62 : webSources.length ? 0.5 : 0.24,
    mode,
    warnings,
    sourceStatus: "mock",
  };
}

function modeLabel(mode: AnswerMode) {
  if (mode === "library") return "仅资料库";
  if (mode === "web") return "联网增强";
  return "混合验证";
}

export async function generateOutput(type: GeneratedOutputType, context?: unknown): Promise<GeneratedOutput> {
  if (provider === "api") {
    return callApiStrict("generateOutput", async () =>
      normalizeApiOutput(await postApi<GeneratedOutput & { content?: string }>("/api/ai/generate-output", { type, context, allowMock: false }), type),
    );
  }
  await delay(260);
  return getMockOutput(type, context);
}

function getMockOutput(type: GeneratedOutputType, context?: unknown): GeneratedOutput {
  const contextDocuments =
    typeof context === "object" && context && "documents" in context && Array.isArray((context as { documents?: unknown }).documents)
      ? (context as { documents: KnowledgeDocument[] }).documents
      : mockDocuments;
  const copilotContext =
    typeof context === "object" && context && "copilotContext" in context ? (context as { copilotContext?: AskOptions["context"] }).copilotContext : undefined;
  const sources = collectLocalSources("生成成果", contextDocuments, copilotContext).slice(0, 3);
  const templates: Record<GeneratedOutputType, { title: string; body: string }> = {
    resume: { title: "简历项目经历", body: "基于知识星图沉淀项目背景、技术职责、问题定位和可验证成果，突出资料来源与可复盘证据。" },
    defense: { title: "项目答辩稿", body: "围绕项目背景、核心方案、技术实现、问题解决、来源证据和后续优化展开答辩叙述。" },
    ppt: { title: "PPT 大纲", body: "1. 项目背景与痛点\n2. 资料解析与知识星图\n3. 核心节点和关系\n4. 来源引用与可信问答\n5. 成果沉淀与下一步计划" },
    interview: { title: "面试问答", body: "问：这个项目最有价值的技术点是什么？\n答：它把资料解析、知识图谱、来源引用和任务型生成连接成闭环，并能说明依据来自哪里。" },
    review: { title: "复习计划", body: "按资料来源拆解知识点，先复盘高置信节点，再处理薄弱问题节点，最后把稳定结论保存为成果节点。" },
    summary: { title: "项目总结", body: "知脉 AI 将上传资料沉淀为可追溯知识星图，让问答、总结和成果生成都能回到来源片段。" },
  };
  const output = templates[type];
  return {
    id: `generated-${type}-${Date.now()}`,
    type,
    title: output.title,
    body: output.body,
    sources,
    createdAt: new Date().toISOString(),
    sourceStatus: "mock",
  };
}
