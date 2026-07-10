import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { mockDocuments } from "../data/mockDocuments";
import { mockGraphData } from "../data/mockGraphData";
import { canEditWorkspace } from "../services/authService";
import { getWorkspaceDataset, migrateLocalData, recordRemoteActivity, saveWorkspaceDataset, type WorkspaceDataset } from "../services/backendDataService";
import { useAuthStore } from "./authStore";
import type { GeneratedOutput } from "../types/ai";
import type { KnowledgeDocument, ParsedDocument, ParseDiagnostics, TextChunk } from "../types/document";
import type { AnalysisResult, GraphData, GraphEdge, GraphLayoutMode, GraphNode, GraphNodeType, SourceReference } from "../types/graph";
import { ADMIN_PUBLIC_WORKSPACE_ID, type Workspace, type WorkspaceAccess } from "../types/workspace";

const STORAGE_KEY = "zhimai-ai-knowledge-store-v6";
const LEGACY_STORAGE_KEYS = ["zhimai-ai-knowledge-store-v5", "zhimai-ai-knowledge-store-v4", "zhimai-ai-knowledge-store-v3"];

export type ActivityType = "upload" | "ask" | "generate" | "delete" | "clear" | "reorganize";
export type RecommendationAction = "upload" | "graph" | "assistant" | "outputs";

export interface RecentActivity {
  id: string;
  workspaceId?: string;
  type: ActivityType;
  title: string;
  detail: string;
  createdAt: string;
  documentId?: string;
  nodeIds?: string[];
  outputId?: string;
}

export interface AIRecommendation {
  id: string;
  title: string;
  detail: string;
  action: RecommendationAction;
}

export interface CopilotContext {
  workspaceId?: string;
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: GraphNodeType;
  summary?: string;
  relatedDocumentIds?: string[];
  sourceSnippets?: SourceReference[];
  neighborLabels?: string[];
  intent?: "ask" | "summary" | "generate" | "analyze" | "web";
  answerMode?: "library" | "web" | "hybrid";
}

export interface KnowledgeState {
  workspaceId?: string;
  workspace?: Workspace | null;
  access?: WorkspaceAccess | null;
  documents: KnowledgeDocument[];
  graph: GraphData;
  outputs: GeneratedOutput[];
  recentActivities: RecentActivity[];
  recommendations: AIRecommendation[];
  highlightedNodeIds: string[];
  copilotContext: CopilotContext | null;
  revision: number;
}

type KnowledgeAction =
  | { type: "hydrateWorkspace"; workspaceId: string; data: WorkspaceDataset }
  | { type: "ingestAnalysis"; workspaceId: string; file: File; content: string; analysis: AnalysisResult; parsed?: ParsedDocument }
  | { type: "replaceDocumentAnalysis"; workspaceId: string; documentId: string; content: string; analysis: AnalysisResult; parsed?: ParsedDocument }
  | { type: "createNode"; workspaceId: string; node: GraphNode }
  | { type: "updateNode"; workspaceId: string; nodeId: string; patch: Partial<GraphNode>; actorName?: string }
  | { type: "deleteNode"; workspaceId: string; nodeId: string }
  | { type: "upsertEdge"; workspaceId: string; edge: GraphEdge }
  | { type: "deleteEdge"; workspaceId: string; edgeId: string }
  | { type: "updateNodePositions"; workspaceId: string; positions: Array<{ id: string; x: number; y: number; fixed?: boolean; layoutMode?: GraphLayoutMode; manualPosition?: boolean; positionUpdatedBy?: string }> }
  | { type: "setNodesFixed"; workspaceId: string; nodeIds?: string[]; fixed: boolean }
  | { type: "resetLayout"; workspaceId: string }
  | { type: "deleteDocument"; workspaceId: string; documentId: string }
  | { type: "clearGraph"; workspaceId: string }
  | { type: "resetDemo" }
  | { type: "addOutput"; workspaceId: string; output: GeneratedOutput; relatedNodeId?: string | null; nodeType?: "output" | "problem" | "concept" | "tag" }
  | { type: "setCopilotContext"; context: CopilotContext | null }
  | { type: "recordAsk"; workspaceId: string; question: string };

interface KnowledgeContextValue {
  state: KnowledgeState;
  currentWorkspace: Workspace | null;
  currentAccess: WorkspaceAccess | null;
  canEditCurrentWorkspace: boolean;
  ingestAnalysis: (file: File, content: string, analysis: AnalysisResult, parsed?: ParsedDocument) => void;
  replaceDocumentAnalysis: (documentId: string, content: string, analysis: AnalysisResult, parsed?: ParsedDocument) => void;
  createNode: (node: GraphNode) => void;
  updateNode: (nodeId: string, patch: Partial<GraphNode>) => void;
  deleteNode: (nodeId: string) => void;
  upsertEdge: (edge: GraphEdge) => void;
  deleteEdge: (edgeId: string) => void;
  updateNodePositions: (positions: Array<{ id: string; x: number; y: number; fixed?: boolean; layoutMode?: GraphLayoutMode; manualPosition?: boolean; positionUpdatedBy?: string }>) => void;
  setNodesFixed: (nodeIds: string[] | undefined, fixed: boolean) => void;
  resetLayout: () => void;
  deleteDocument: (documentId: string) => void;
  clearGraph: () => void;
  resetDemo: () => void;
  addOutput: (output: GeneratedOutput, relatedNodeId?: string | null, nodeType?: "output" | "problem" | "concept" | "tag") => void;
  setCopilotContext: (context: CopilotContext | null) => void;
  recordAsk: (question: string) => void;
}

const KnowledgeContext = createContext<KnowledgeContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

function workspaceIdOrDefault(workspaceId?: string | null) {
  return workspaceId || ADMIN_PUBLIC_WORKSPACE_ID;
}

function documentWorkspaceId(document: Pick<KnowledgeDocument, "workspaceId">) {
  return workspaceIdOrDefault(document.workspaceId);
}

function nodeWorkspaceId(node: Pick<GraphNode, "workspaceId">) {
  return workspaceIdOrDefault(node.workspaceId);
}

function edgeWorkspaceId(edge: GraphEdge, nodesById?: Map<string, GraphNode>) {
  if (edge.workspaceId) return edge.workspaceId;
  const fromWorkspace = nodesById?.get(edge.from)?.workspaceId;
  const toWorkspace = nodesById?.get(edge.to)?.workspaceId;
  return workspaceIdOrDefault(fromWorkspace || toWorkspace);
}

function activityWorkspaceId(activity: Pick<RecentActivity, "workspaceId">) {
  return workspaceIdOrDefault(activity.workspaceId);
}

function outputWorkspaceId(output: Pick<GeneratedOutput, "workspaceId">) {
  return workspaceIdOrDefault(output.workspaceId);
}

function withDocumentWorkspace(document: KnowledgeDocument, workspaceId = ADMIN_PUBLIC_WORKSPACE_ID): KnowledgeDocument {
  const nextWorkspaceId = workspaceIdOrDefault(document.workspaceId || workspaceId);
  return {
    ...document,
    workspaceId: nextWorkspaceId,
    chunks: (document.chunks ?? []).map((chunk) => ({ ...chunk, workspaceId: chunk.workspaceId ?? nextWorkspaceId })),
  };
}

function withGraphWorkspace(graph: GraphData, workspaceId = ADMIN_PUBLIC_WORKSPACE_ID): GraphData {
  return {
    nodes: graph.nodes.map((node) => ({ ...node, workspaceId: node.workspaceId ?? workspaceId })),
    edges: graph.edges.map((edge) => ({ ...edge, workspaceId: edge.workspaceId ?? workspaceId })),
  };
}

function slug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]+/g, "")
    .replace(/-+/g, "-")
    .slice(0, 46);
}

function sizeLabel(size: number) {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${size} B`;
}

function fileKind(fileName: string): KnowledgeDocument["kind"] {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (
    extension === "txt" ||
    extension === "md" ||
    extension === "pdf" ||
    extension === "docx" ||
    extension === "pptx" ||
    extension === "xlsx" ||
    extension === "csv" ||
    extension === "json" ||
    extension === "html"
  ) {
    return extension;
  }
  return "unknown";
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function compactGraph(graph: GraphData): GraphData {
  const nodes = uniqueById(graph.nodes);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = uniqueById(graph.edges).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);
  return { nodes: reorganizeNodes(nodes), edges };
}

function reorganizeNodes(nodes: GraphNode[]) {
  const groups = new Map<string, GraphNode[]>();
  nodes.forEach((node) => {
    const group = node.group || node.cluster || "default";
    groups.set(group, [...(groups.get(group) ?? []), node]);
  });
  const centers = [...groups.keys()].map((group, index, list) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, list.length);
    const radius = list.length <= 1 ? 0 : 420;
    return { group, x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
  });
  const centerMap = new Map(centers.map((center) => [center.group, center]));

  return nodes.map((node, index) => {
    const group = node.group || node.cluster || "default";
    const siblings = groups.get(group) ?? [];
    const siblingIndex = siblings.findIndex((item) => item.id === node.id);
    const center = centerMap.get(group) ?? { x: 0, y: 0 };
    const angle = (Math.PI * 2 * siblingIndex) / Math.max(1, siblings.length) + 0.42;
    const ring = node.type === "project" ? 0 : node.type === "document" ? 1 : 2 + (siblingIndex % 2);
    const radius = node.type === "project" ? 0 : 90 + ring * 46 + ((index * 17) % 28);
    return {
      ...node,
      group,
      cluster: node.cluster || group,
      x: node.x ?? Math.round(center.x + Math.cos(angle) * radius),
      y: node.y ?? Math.round(center.y + Math.sin(angle) * radius),
    };
  });
}

function fallbackDiagnostics(content: string): ParseDiagnostics {
  const canAnswer = content.trim().length >= 40;
  const extractedLength = content.replace(/\s/g, "").length;
  return {
    status: canAnswer ? (extractedLength < 120 ? "short_text" : "parsed") : "metadata_only",
    qualityLevel: canAnswer ? (extractedLength < 120 ? "mild_anomaly" : "usable") : "failed",
    message: canAnswer
      ? extractedLength < 120
        ? "当前只提取到少量文本，可能无法支撑可靠问答。"
        : "正文解析成功，已切片并可用于可靠问答。"
      : "当前文件只有文件名，尚未完成正文解析，无法进行可靠回答。",
    extractedLength,
    readabilityScore: canAnswer ? 100 : 0,
    chineseRatio: 0,
    abnormalCharRatio: 0,
    newlineAnomalyScore: 0,
    isGarbled: false,
    needsOcr: false,
    ocrAvailable: false,
    ocrStatus: "not_needed",
    chunkCount: canAnswer ? 1 : 0,
    canAnswer,
    allowContinue: canAnswer,
    requiresUserConfirmation: false,
    preview: content.trim().slice(0, 1000),
    nextSuggestion: canAnswer ? "可以进入知源 Copilot 基于来源片段提问。" : "请上传包含正文的资料，或手动复制正文导入。",
  };
}

function buildFallbackChunks(documentId: string, content: string, workspaceId = ADMIN_PUBLIC_WORKSPACE_ID): TextChunk[] {
  const text = content.trim();
  if (text.length < 40) return [];
  return [
    {
      id: `${documentId}-chunk-1`,
      index: 0,
      text: text.slice(0, 850),
      start: 0,
      end: Math.min(text.length, 850),
      workspaceId,
    },
  ];
}

function normalizeDocument(document: KnowledgeDocument): KnowledgeDocument {
  const workspaceId = documentWorkspaceId(document);
  const diagnostics = fallbackDiagnostics(document.sourceText || document.summary || "");
  const chunks = document.chunks?.length ? document.chunks.map((chunk) => ({ ...chunk, workspaceId: chunk.workspaceId ?? workspaceId })) : buildFallbackChunks(document.id, document.sourceText || "", workspaceId);
  return {
    ...document,
    workspaceId,
    kind: document.kind ?? "unknown",
    parseStatus: document.parseStatus ?? diagnostics.status,
    parseMessage: document.parseMessage ?? diagnostics.message,
    extractedLength: document.extractedLength ?? diagnostics.extractedLength,
    isGarbled: document.isGarbled ?? diagnostics.isGarbled,
    needsOcr: document.needsOcr ?? diagnostics.needsOcr,
    canAnswer: document.canAnswer ?? diagnostics.canAnswer,
    chunks,
    analysisProvider: document.analysisProvider ?? "legacy",
    analysisSourceStatus: document.analysisSourceStatus ?? "local_rule",
    analyzedAt: document.analyzedAt,
  };
}

function makeDocumentFromAnalysis(file: File, content: string, analysis: AnalysisResult, workspaceId: string, parsed?: ParsedDocument): KnowledgeDocument {
  const stamp = Date.now();
  const id = `user-doc-${stamp}-${slug(file.name) || "upload"}`;
  const diagnostics = parsed?.diagnostics ?? analysis.parsing ?? fallbackDiagnostics(content);
  const sourceStatus = analysisSourceStatus(analysis);
  const provider = analysisProvider(analysis);
  const analyzedAt = analysisTimestamp(analysis);
  const chunks = (parsed?.chunks ?? buildFallbackChunks(id, content, workspaceId)).map((chunk) => ({
    ...chunk,
    id: chunk.id || `${id}-chunk-${chunk.index + 1}`,
    workspaceId,
  }));
  const confidence = confidenceForDiagnostics(analysis.confidence, diagnostics);
  return {
    id,
    workspaceId,
    title: file.name,
    kind: parsed?.kind ?? fileKind(file.name),
    sizeLabel: sizeLabel(file.size),
    uploadedAt: nowIso(),
    summary: analysis.summary,
    keywords: analysis.keywords,
    sourceText: diagnostics.canAnswer ? content.slice(0, 12_000) : "",
    confidence,
    parseStatus: diagnostics.status,
    parseMessage: diagnostics.message,
    extractedLength: diagnostics.extractedLength,
    isGarbled: diagnostics.isGarbled,
    needsOcr: diagnostics.needsOcr,
    canAnswer: diagnostics.canAnswer,
    chunks,
    analysisProvider: provider,
    analysisSourceStatus: sourceStatus,
    analyzedAt,
  };
}

function updateDocumentFromAnalysis(document: KnowledgeDocument, content: string, analysis: AnalysisResult, parsed?: ParsedDocument): KnowledgeDocument {
  const diagnostics = parsed?.diagnostics ?? analysis.parsing ?? fallbackDiagnostics(content || document.sourceText || document.summary);
  const sourceStatus = analysisSourceStatus(analysis);
  const provider = analysisProvider(analysis);
  const analyzedAt = analysisTimestamp(analysis);
  const chunks = (parsed?.chunks?.length ? parsed.chunks : document.chunks).map((chunk) => ({ ...chunk, workspaceId: document.workspaceId }));
  const confidence = confidenceForDiagnostics(analysis.confidence, diagnostics);
  return {
    ...document,
    summary: analysis.summary,
    keywords: analysis.keywords,
    sourceText: diagnostics.canAnswer ? (content || document.sourceText).slice(0, 12_000) : document.sourceText,
    confidence,
    parseStatus: diagnostics.status,
    parseMessage: diagnostics.message,
    extractedLength: diagnostics.extractedLength,
    isGarbled: diagnostics.isGarbled,
    needsOcr: diagnostics.needsOcr,
    canAnswer: diagnostics.canAnswer,
    chunks,
    analysisProvider: provider,
    analysisSourceStatus: sourceStatus,
    analyzedAt,
  };
}

function confidenceForDiagnostics(baseConfidence: number, diagnostics: ParseDiagnostics) {
  if (!diagnostics.canAnswer) return Math.min(baseConfidence, 0.24);
  if (diagnostics.status === "moderate_anomaly") return Math.min(Number((baseConfidence * 0.58).toFixed(2)), 0.56);
  if (diagnostics.status === "mild_anomaly" || diagnostics.status === "short_text") return Math.min(Number((baseConfidence * 0.82).toFixed(2)), 0.78);
  return baseConfidence;
}

function analysisSourceStatus(analysis: AnalysisResult): "api" | "mock" | "local_rule" {
  return analysis.sourceStatus ?? (analysis.provider === "mock" ? "mock" : analysis.provider === "local_rule" ? "local_rule" : "api");
}

function analysisProvider(analysis: AnalysisResult) {
  return analysis.provider ?? analysisSourceStatus(analysis);
}

function analysisTimestamp(analysis: AnalysisResult) {
  return analysis.analyzedAt ?? nowIso();
}

function sanitizeImportedGraph(document: KnowledgeDocument, analysis: AnalysisResult, workspaceId: string) {
  const group = `upload-${slug(document.title) || Date.now()}`;
  const docNodeId = `node-${document.id}`;
  const sourceStatus = analysisSourceStatus(analysis);
  const provider = analysisProvider(analysis);
  const analyzedAt = analysisTimestamp(analysis);
  const documentNode: GraphNode = {
    id: docNodeId,
    workspaceId,
    label: document.title.replace(/\.[^.]+$/, ""),
    type: "document",
    group,
    cluster: group,
    description: document.canAnswer ? analysis.summary : document.parseMessage,
    sourceDocumentIds: [document.id],
    value: document.canAnswer ? 22 : 12,
    confidence: document.confidence,
    analysisProvider: provider,
    analysisSourceStatus: sourceStatus,
    analyzedAt,
  };

  const importedNodes = analysis.entities.map((node, index) => ({
    ...node,
    id: node.id || `node-${document.id}-${index}`,
    workspaceId,
    group: node.group?.startsWith("upload-") ? node.group : group,
    cluster: node.cluster?.startsWith("upload-") ? node.cluster : group,
    sourceDocumentIds: [...new Set([...(node.sourceDocumentIds ?? []), document.id])],
    description: node.description || `${node.label} 来自 ${document.title} 的 AI 解析结果。`,
    confidence: Math.min(node.confidence ?? analysis.confidence, document.confidence),
    analysisProvider: node.analysisProvider ?? provider,
    analysisSourceStatus: node.analysisSourceStatus ?? sourceStatus,
    analyzedAt: node.analyzedAt ?? analyzedAt,
  }));
  const nodes = uniqueById([documentNode, ...importedNodes]);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const relations = analysis.relations
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge, index) => ({
      ...edge,
      id: edge.id || `edge-${document.id}-${index}`,
      workspaceId,
      confidence: Math.min(edge.confidence ?? analysis.confidence, document.confidence),
      evidence: edge.evidence || analysis.summary,
      analysisProvider: edge.analysisProvider ?? provider,
      analysisSourceStatus: edge.analysisSourceStatus ?? sourceStatus,
      analyzedAt: edge.analyzedAt ?? analyzedAt,
    }));
  const docEdges = importedNodes.slice(0, 18).map<GraphEdge>((node, index) => ({
    id: `edge-${docNodeId}-${node.id}`.replace(/[^a-zA-Z0-9-]/g, "-"),
    workspaceId,
    from: docNodeId,
    to: node.id,
    label: index === 0 ? "主题" : "提到",
    relationType: index === 0 ? "belongs_to" : "mentions",
    weight: index === 0 ? 0.95 : 0.62,
    confidence: document.confidence,
    evidence: document.canAnswer ? (document.chunks[index % Math.max(1, document.chunks.length)]?.text ?? analysis.summary) : document.parseMessage,
    analysisProvider: provider,
    analysisSourceStatus: sourceStatus,
    analyzedAt,
  }));
  return { nodes, edges: uniqueById([...relations, ...docEdges]), highlightedNodeIds: nodes.map((node) => node.id) };
}

function mergeGraphs(base: GraphData, incoming: GraphData): GraphData {
  const nodeMap = new Map(base.nodes.map((node) => [node.id, node]));
  incoming.nodes.forEach((node) => {
    const existing = nodeMap.get(node.id);
    if (!existing) {
      nodeMap.set(node.id, node);
      return;
    }
    nodeMap.set(node.id, {
      ...existing,
      ...node,
      sourceDocumentIds: [...new Set([...(existing.sourceDocumentIds ?? []), ...(node.sourceDocumentIds ?? [])])],
    });
  });
  return compactGraph({ nodes: [...nodeMap.values()], edges: uniqueById([...base.edges, ...incoming.edges]) });
}

function recommendationsFor(state: Pick<KnowledgeState, "documents" | "graph" | "outputs">): AIRecommendation[] {
  const latest = state.documents[0];
  if (!latest) {
    return [
      { id: "rec-upload-first", title: "导入第一份资料", detail: "上传 PDF、Word、笔记或项目资料，先生成可追溯知识星图。", action: "upload" },
      { id: "rec-open-graph", title: "查看知识星图", detail: "熟悉节点、关系和来源引用如何联动。", action: "graph" },
    ];
  }
  const base = latest.canAnswer
    ? `最近资料「${latest.title}」已有 ${latest.chunks.length} 个可问答片段。`
    : `最近资料「${latest.title}」正文不可用于可靠问答，需要重新解析或 OCR。`;
  return [
    { id: "rec-ask-latest", title: "基于最近资料提问", detail: base, action: "assistant" },
    { id: "rec-check-source", title: "检查来源片段", detail: "在星图中查看资料节点、相邻节点和引用片段是否完整。", action: "graph" },
    { id: "rec-generate-output", title: "沉淀一个成果节点", detail: "把稳定结论保存为成果、总结或问题节点，回写到星图。", action: "outputs" },
  ];
}

function buildInitialActivities(): RecentActivity[] {
  return mockDocuments.slice(0, 4).map((document, index) => ({
    id: `activity-demo-${document.id}`,
    workspaceId: ADMIN_PUBLIC_WORKSPACE_ID,
    type: "upload",
    title: `已入库：${document.title}`,
    detail: document.summary,
    createdAt: new Date(Date.now() - (4 - index) * 3600_000).toISOString(),
    documentId: document.id,
  }));
}

function createInitialState(): KnowledgeState {
  const base: Omit<KnowledgeState, "recommendations"> = {
    documents: [],
    graph: { nodes: [], edges: [] },
    outputs: [],
    recentActivities: [],
    highlightedNodeIds: [],
    copilotContext: null,
    revision: 0,
  };
  return { ...base, recommendations: recommendationsFor(base) };
}

function createDemoState(): KnowledgeState {
  const documents = mockDocuments.map((document) => normalizeDocument(withDocumentWorkspace(document, ADMIN_PUBLIC_WORKSPACE_ID))).reverse();
  const demoGraph = withGraphWorkspace(mockGraphData, ADMIN_PUBLIC_WORKSPACE_ID);
  const base: Omit<KnowledgeState, "recommendations"> = {
    documents,
    graph: compactGraph(demoGraph),
    outputs: [],
    recentActivities: buildInitialActivities(),
    highlightedNodeIds: [],
    copilotContext: null,
    revision: 0,
  };
  return { ...base, recommendations: recommendationsFor(base) };
}

function reviveState(value: KnowledgeState): KnowledgeState {
  const graphWithWorkspace = withGraphWorkspace(value.graph ?? { nodes: [], edges: [] }, ADMIN_PUBLIC_WORKSPACE_ID);
  const base = {
    documents: (value.documents ?? []).map((document) => normalizeDocument(withDocumentWorkspace(document, documentWorkspaceId(document)))),
    graph: compactGraph(graphWithWorkspace),
    outputs: (value.outputs ?? []).map((output) => ({ ...output, workspaceId: output.workspaceId ?? ADMIN_PUBLIC_WORKSPACE_ID })),
    recentActivities: (value.recentActivities ?? []).map((activity) => ({ ...activity, workspaceId: activity.workspaceId ?? ADMIN_PUBLIC_WORKSPACE_ID })),
    highlightedNodeIds: value.highlightedNodeIds ?? [],
    copilotContext: value.copilotContext ?? null,
    revision: value.revision ?? 0,
  };
  return { ...base, recommendations: recommendationsFor(base) };
}

function addActivity(state: KnowledgeState, activity: Omit<RecentActivity, "id" | "createdAt">, workspaceId = ADMIN_PUBLIC_WORKSPACE_ID): RecentActivity[] {
  return [{ ...activity, workspaceId, id: `activity-${activity.type}-${Date.now()}`, createdAt: nowIso() }, ...state.recentActivities].slice(0, 60);
}

function withRecommendations(state: KnowledgeState): KnowledgeState {
  return { ...state, recommendations: recommendationsFor(state), revision: state.revision + 1 };
}

function knowledgeReducer(state: KnowledgeState, action: KnowledgeAction): KnowledgeState {
  if (action.type === "hydrateWorkspace") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const incomingGraph = withGraphWorkspace(action.data.graph ?? { nodes: [], edges: [] }, workspaceId);
    const nodesById = new Map(state.graph.nodes.map((node) => [node.id, node]));
    const keptNodes = state.graph.nodes.filter((node) => nodeWorkspaceId(node) !== workspaceId);
    const keptEdges = state.graph.edges.filter((edge) => edgeWorkspaceId(edge, nodesById) !== workspaceId);
    const base: KnowledgeState = {
      ...state,
      documents: [
        ...state.documents.filter((document) => documentWorkspaceId(document) !== workspaceId),
        ...(action.data.documents ?? []).map((document) => normalizeDocument(withDocumentWorkspace(document, workspaceId))),
      ],
      graph: compactGraph({ nodes: [...keptNodes, ...incomingGraph.nodes], edges: [...keptEdges, ...incomingGraph.edges] }),
      outputs: [
        ...state.outputs.filter((output) => outputWorkspaceId(output) !== workspaceId),
        ...(action.data.outputs ?? []).map((output) => ({ ...output, workspaceId: output.workspaceId ?? workspaceId })),
      ],
      recentActivities: [
        ...state.recentActivities.filter((activity) => activityWorkspaceId(activity) !== workspaceId),
        ...(action.data.recentActivities ?? []).map((activity) => ({ ...activity, workspaceId: activity.workspaceId ?? workspaceId })),
      ],
      highlightedNodeIds: [],
      revision: Math.max(state.revision, action.data.revision ?? 0) + 1,
    };
    return { ...base, recommendations: recommendationsFor(base) };
  }

  if (action.type === "ingestAnalysis") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const document = makeDocumentFromAnalysis(action.file, action.content, action.analysis, workspaceId, action.parsed);
    const imported = sanitizeImportedGraph(document, action.analysis, workspaceId);
    const nextState: KnowledgeState = {
      ...state,
      documents: [document, ...state.documents.filter((item) => item.id !== document.id)],
      graph: mergeGraphs(state.graph, imported),
      highlightedNodeIds: imported.highlightedNodeIds,
      recentActivities: addActivity(state, {
        type: "upload",
        title: document.canAnswer ? `已解析资料：${document.title}` : `已入库但不可问答：${document.title}`,
        detail: document.canAnswer
          ? `正文长度 ${document.extractedLength}，可问答片段 ${document.chunks.length}，新增 ${imported.nodes.length} 个节点。`
          : document.parseMessage,
        documentId: document.id,
        nodeIds: imported.highlightedNodeIds,
      }, workspaceId),
    };
    return withRecommendations(nextState);
  }

  if (action.type === "replaceDocumentAnalysis") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const existing = state.documents.find((item) => item.id === action.documentId && documentWorkspaceId(item) === workspaceId);
    if (!existing) return state;
    const document = updateDocumentFromAnalysis(existing, action.content, action.analysis, action.parsed);
    const imported = sanitizeImportedGraph(document, action.analysis, workspaceId);
    const nodesById = new Map(state.graph.nodes.map((node) => [node.id, node]));
    const keptNodes = state.graph.nodes.filter((node) => {
      if (nodeWorkspaceId(node) !== workspaceId) return true;
      if (node.type === "output") return true;
      return !node.sourceDocumentIds?.includes(action.documentId);
    });
    const keptNodeIds = new Set(keptNodes.map((node) => node.id));
    const keptEdges = state.graph.edges.filter((edge) => {
      if (edgeWorkspaceId(edge, nodesById) !== workspaceId) return true;
      return keptNodeIds.has(edge.from) && keptNodeIds.has(edge.to);
    });
    const nextState: KnowledgeState = {
      ...state,
      documents: [document, ...state.documents.filter((item) => item.id !== action.documentId)],
      graph: mergeGraphs({ nodes: keptNodes, edges: keptEdges }, imported),
      highlightedNodeIds: imported.highlightedNodeIds,
      recentActivities: addActivity(state, {
        type: "upload",
        title: `已重新分析资料：${document.title}`,
        detail: `模型 ${document.analysisProvider ?? "api"}，新增 ${imported.nodes.length} 个节点、${imported.edges.length} 条关系。`,
        documentId: document.id,
        nodeIds: imported.highlightedNodeIds,
      }, workspaceId),
    };
    return withRecommendations(nextState);
  }

  if (action.type === "createNode") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const node = { ...action.node, workspaceId, isManual: action.node.isManual ?? true, updatedAt: nowIso() };
    return withRecommendations({
      ...state,
      graph: compactGraph({ nodes: [...state.graph.nodes.filter((item) => item.id !== node.id), node], edges: state.graph.edges }),
      highlightedNodeIds: [node.id],
      recentActivities: addActivity(state, { type: "reorganize", title: `已新建节点：${node.label}`, detail: "手动节点已加入当前知识星图。", nodeIds: [node.id] }, workspaceId),
    });
  }

  if (action.type === "updateNode") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const target = state.graph.nodes.find((node) => node.id === action.nodeId && nodeWorkspaceId(node) === workspaceId);
    if (!target) return state;
    const nextNode: GraphNode = {
      ...target,
      ...action.patch,
      originalDescription: target.originalDescription ?? target.description,
      userDescription: action.patch.description ?? action.patch.userDescription ?? target.userDescription,
      updatedAt: nowIso(),
      updatedBy: action.actorName,
    };
    return withRecommendations({
      ...state,
      graph: compactGraph({ nodes: state.graph.nodes.map((node) => (node.id === action.nodeId ? nextNode : node)), edges: state.graph.edges }),
      highlightedNodeIds: [action.nodeId],
      recentActivities: addActivity(state, { type: "reorganize", title: `已编辑节点：${nextNode.label}`, detail: "节点名称、摘要或标签已更新。", nodeIds: [action.nodeId] }, workspaceId),
    });
  }

  if (action.type === "deleteNode") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const target = state.graph.nodes.find((node) => node.id === action.nodeId && nodeWorkspaceId(node) === workspaceId);
    if (!target) return state;
    return withRecommendations({
      ...state,
      graph: compactGraph({
        nodes: state.graph.nodes.filter((node) => node.id !== action.nodeId),
        edges: state.graph.edges.filter((edge) => edge.from !== action.nodeId && edge.to !== action.nodeId),
      }),
      highlightedNodeIds: [],
      copilotContext: state.copilotContext?.nodeId === action.nodeId ? null : state.copilotContext,
      recentActivities: addActivity(state, { type: "delete", title: `已删除节点：${target.label}`, detail: "相关关系边已同步清理。", nodeIds: [action.nodeId] }),
    });
  }

  if (action.type === "upsertEdge") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const nodeIds = new Set(state.graph.nodes.filter((node) => nodeWorkspaceId(node) === workspaceId).map((node) => node.id));
    if (!nodeIds.has(action.edge.from) || !nodeIds.has(action.edge.to) || action.edge.from === action.edge.to) return state;
    const stamp = nowIso();
    const existing = state.graph.edges.find((edge) => edge.id === action.edge.id);
    const edge: GraphEdge = {
      ...(existing ?? {}),
      ...action.edge,
      workspaceId,
      isManual: action.edge.isManual ?? true,
      confidence: action.edge.confidence ?? 1,
      createdAt: existing?.createdAt ?? action.edge.createdAt ?? stamp,
      updatedAt: stamp,
    };
    return withRecommendations({
      ...state,
      graph: compactGraph({ nodes: state.graph.nodes, edges: [...state.graph.edges.filter((item) => item.id !== edge.id), edge] }),
      recentActivities: addActivity(state, { type: "reorganize", title: existing ? "已更新手动关系" : "已创建手动关系", detail: edge.description || edge.label || edge.relationType, nodeIds: [edge.from, edge.to] }, workspaceId),
    });
  }

  if (action.type === "deleteEdge") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const target = state.graph.edges.find((edge) => edge.id === action.edgeId && edgeWorkspaceId(edge, new Map(state.graph.nodes.map((node) => [node.id, node]))) === workspaceId);
    if (!target) return state;
    return withRecommendations({
      ...state,
      graph: compactGraph({ nodes: state.graph.nodes, edges: state.graph.edges.filter((edge) => edge.id !== action.edgeId) }),
      recentActivities: addActivity(state, { type: "delete", title: `已删除关系：${target.label ?? target.relationType}`, detail: target.description || target.evidence || "关系边已删除。", nodeIds: [target.from, target.to] }, workspaceId),
    });
  }

  if (action.type === "updateNodePositions") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const positionMap = new Map(action.positions.map((position) => [position.id, position]));
    return withRecommendations({
      ...state,
      graph: {
        nodes: state.graph.nodes.map((node) => {
          if (nodeWorkspaceId(node) !== workspaceId) return node;
          const position = positionMap.get(node.id);
          if (!position) return node;
          return {
            ...node,
            x: Math.round(position.x),
            y: Math.round(position.y),
            fixed: position.fixed ?? node.fixed ?? true,
            layoutMode: position.layoutMode ?? node.layoutMode ?? "free",
            positionUpdatedAt: nowIso(),
            manualPosition: position.manualPosition ?? true,
            ...(position.positionUpdatedBy ? { positionUpdatedBy: position.positionUpdatedBy } : {}),
          };
        }),
        edges: state.graph.edges,
      },
    });
  }

  if (action.type === "setNodesFixed") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const targetIds = action.nodeIds ? new Set(action.nodeIds) : null;
    return withRecommendations({
      ...state,
      graph: {
        nodes: state.graph.nodes.map((node) =>
          nodeWorkspaceId(node) === workspaceId && (!targetIds || targetIds.has(node.id))
            ? { ...node, fixed: action.fixed, layoutMode: action.fixed ? "free" : node.layoutMode, positionUpdatedAt: nowIso() }
            : node,
        ),
        edges: state.graph.edges,
      },
    });
  }

  if (action.type === "resetLayout") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    return withRecommendations({
      ...state,
      graph: compactGraph({
        nodes: state.graph.nodes.map((node) =>
          nodeWorkspaceId(node) === workspaceId ? { ...node, x: undefined, y: undefined, fixed: false, layoutMode: "auto", positionUpdatedAt: nowIso() } : node,
        ),
        edges: state.graph.edges,
      }),
      highlightedNodeIds: [],
      recentActivities: addActivity(state, { type: "reorganize", title: "已重置为自动布局", detail: "节点位置已重新交给自动布局计算。" }, workspaceId),
    });
  }

  if (action.type === "deleteDocument") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const document = state.documents.find((item) => item.id === action.documentId && documentWorkspaceId(item) === workspaceId);
    if (!document) return state;
    const keptNodes = state.graph.nodes
      .map((node) => {
        if (nodeWorkspaceId(node) !== workspaceId || !node.sourceDocumentIds?.includes(action.documentId)) return node;
        const rest = node.sourceDocumentIds.filter((id) => id !== action.documentId);
        if (node.type === "document" || rest.length === 0) return null;
        return { ...node, sourceDocumentIds: rest };
      })
      .filter((node): node is GraphNode => Boolean(node));
    const keptNodeIds = new Set(keptNodes.map((node) => node.id));
    return withRecommendations({
      ...state,
      documents: state.documents.filter((item) => item.id !== action.documentId),
      graph: compactGraph({ nodes: keptNodes, edges: state.graph.edges.filter((edge) => keptNodeIds.has(edge.from) && keptNodeIds.has(edge.to)) }),
      highlightedNodeIds: [],
      copilotContext: state.copilotContext?.relatedDocumentIds?.includes(action.documentId) ? null : state.copilotContext,
      recentActivities: addActivity(state, { type: "delete", title: `已删除资料：${document.title}`, detail: "该资料产生的文档节点与专属关系已清理。", documentId: action.documentId }),
    });
  }

  if (action.type === "clearGraph") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const nodesById = new Map(state.graph.nodes.map((node) => [node.id, node]));
    return withRecommendations({
      ...state,
      documents: state.documents.filter((document) => documentWorkspaceId(document) !== workspaceId),
      graph: {
        nodes: state.graph.nodes.filter((node) => nodeWorkspaceId(node) !== workspaceId),
        edges: state.graph.edges.filter((edge) => edgeWorkspaceId(edge, nodesById) !== workspaceId),
      },
      outputs: state.outputs.filter((output) => outputWorkspaceId(output) !== workspaceId),
      highlightedNodeIds: [],
      copilotContext: null,
      recentActivities: [{ id: `activity-clear-${Date.now()}`, type: "clear", title: "已清空知识星图", detail: "资料、节点、关系和成果已清空，可重新导入第一份资料。", createdAt: nowIso() }],
    });
  }

  if (action.type === "resetDemo") return createDemoState();

  if (action.type === "addOutput") {
    const workspaceId = workspaceIdOrDefault(action.workspaceId);
    const relatedNode = action.relatedNodeId
      ? state.graph.nodes.find((node) => node.id === action.relatedNodeId && nodeWorkspaceId(node) === workspaceId)
      : state.copilotContext?.nodeId
        ? state.graph.nodes.find((node) => node.id === state.copilotContext?.nodeId && nodeWorkspaceId(node) === workspaceId)
        : null;
    const normalizedOutput = {
      ...action.output,
      workspaceId,
      sources: action.output.sources.map((source) => ({ ...source, workspaceId: source.workspaceId ?? workspaceId })),
    };
    const sourceDocumentIds = normalizedOutput.sources.filter((source) => source.sourceType !== "web").map((source) => source.documentId);
    const outputNode: GraphNode = {
      id: `output-node-${normalizedOutput.id}`,
      workspaceId,
      label: normalizedOutput.title,
      type: action.nodeType ?? "output",
      group: relatedNode?.group ?? "outputs",
      cluster: relatedNode?.cluster ?? "outputs",
      description: normalizedOutput.body.slice(0, 180),
      sourceDocumentIds,
      value: 18,
      confidence: 0.86,
    };
    const edge: GraphEdge | null = relatedNode
      ? {
          id: `edge-${relatedNode.id}-${outputNode.id}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          workspaceId,
          from: relatedNode.id,
          to: outputNode.id,
          label: "生成",
          relationType: "generates",
          weight: 0.82,
          confidence: 0.86,
          evidence: "由知源 Copilot 基于当前节点和来源片段生成。",
        }
      : null;
    return withRecommendations({
      ...state,
      outputs: [normalizedOutput, ...state.outputs.filter((item) => item.id !== normalizedOutput.id)],
      graph: mergeGraphs(state.graph, { nodes: [outputNode], edges: edge ? [edge] : [] }),
      highlightedNodeIds: [outputNode.id],
      recentActivities: addActivity(state, { type: "generate", title: `已保存成果：${action.output.title}`, detail: "成果已挂载为星图节点。", outputId: action.output.id, nodeIds: [outputNode.id] }),
    });
  }

  if (action.type === "setCopilotContext") return { ...state, copilotContext: action.context };

  if (action.type === "recordAsk") {
    return withRecommendations({ ...state, recentActivities: addActivity(state, { type: "ask", title: "知源 Copilot 问答", detail: action.question }) });
  }

  return state;
}

function loadInitialState() {
  if (typeof window === "undefined") return createInitialState();
  try {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
    for (const key of keys) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      return reviveState(JSON.parse(raw) as KnowledgeState);
    }
    return createInitialState();
  } catch {
    return createInitialState();
  }
}

function selectWorkspaceState(raw: KnowledgeState, workspace: Workspace | null, access: WorkspaceAccess | null): KnowledgeState {
  const workspaceId = workspaceIdOrDefault(workspace?.id);
  const documents = raw.documents.filter((document) => documentWorkspaceId(document) === workspaceId);
  const documentIds = new Set(documents.map((document) => document.id));
  const nodes = raw.graph.nodes.filter((node) => {
    if (nodeWorkspaceId(node) === workspaceId) return true;
    return Boolean(node.sourceDocumentIds?.some((documentId) => documentIds.has(documentId)));
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodesById = new Map(raw.graph.nodes.map((node) => [node.id, node]));
  const edges = raw.graph.edges.filter((edge) => edgeWorkspaceId(edge, nodesById) === workspaceId && nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const outputs = raw.outputs.filter((output) => outputWorkspaceId(output) === workspaceId);
  const recentActivities = raw.recentActivities.filter((activity) => activityWorkspaceId(activity) === workspaceId);
  const base: Omit<KnowledgeState, "recommendations"> = {
    workspaceId,
    workspace,
    access,
    documents,
    graph: compactGraph({ nodes, edges }),
    outputs,
    recentActivities,
    highlightedNodeIds: raw.highlightedNodeIds.filter((nodeId) => nodeIds.has(nodeId)),
    copilotContext: raw.copilotContext?.workspaceId && raw.copilotContext.workspaceId !== workspaceId ? null : raw.copilotContext,
    revision: raw.revision,
  };
  return { ...base, recommendations: recommendationsFor(base) };
}

function permissionDeniedMessage(workspace: Workspace | null) {
  return workspace?.type === "admin_public"
    ? "你当前只有查看权限，不能修改管理员共享星图。"
    : "你当前没有编辑该知识空间的权限。";
}

export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(knowledgeReducer, undefined, loadInitialState);
  const { currentUser, currentWorkspace, currentAccess } = useAuthStore();
  const workspaceId = workspaceIdOrDefault(currentWorkspace?.id);
  const canEditCurrentWorkspace = canEditWorkspace(currentUser, currentWorkspace);
  const scopedState = useMemo(() => selectWorkspaceState(state, currentWorkspace, currentAccess), [currentAccess, currentWorkspace, state]);
  const loadedWorkspaceRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    const localSnapshot = selectWorkspaceState(state, currentWorkspace, currentAccess);
    loadedWorkspaceRef.current = null;
    getWorkspaceDataset(workspaceId)
      .then(async (data) => {
        if (cancelled) return;
        const backendEmpty = (data.documents?.length ?? 0) === 0 && (data.graph?.nodes?.length ?? 0) === 0;
        const hasLocalDemoData = localSnapshot.documents.length > 0 || localSnapshot.graph.nodes.length > 0;
        if (
          backendEmpty &&
          hasLocalDemoData &&
          canEditWorkspace(currentUser, currentWorkspace) &&
          currentWorkspace.type === "admin_public" &&
          typeof window !== "undefined" &&
          window.confirm("检测到本地 Demo 数据，是否迁移到管理员共享星图？迁移后其他用户刷新即可看到。")
        ) {
          const migrated = await migrateLocalData(workspaceId, {
            documents: localSnapshot.documents,
            graph: localSnapshot.graph,
            outputs: localSnapshot.outputs,
            recentActivities: localSnapshot.recentActivities,
            revision: localSnapshot.revision,
          });
          if (!cancelled) dispatch({ type: "hydrateWorkspace", workspaceId, data: migrated });
        } else {
          dispatch({ type: "hydrateWorkspace", workspaceId, data });
        }
        loadedWorkspaceRef.current = workspaceId;
      })
      .catch(() => {
        loadedWorkspaceRef.current = workspaceId;
      });
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id, currentUser?.id]);

  useEffect(() => {
    if (!currentWorkspace || loadedWorkspaceRef.current !== workspaceId || !canEditCurrentWorkspace) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveWorkspaceDataset(workspaceId, {
        documents: scopedState.documents,
        graph: scopedState.graph,
        outputs: scopedState.outputs,
        recentActivities: scopedState.recentActivities,
        revision: scopedState.revision,
      });
    }, 320);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [canEditCurrentWorkspace, currentWorkspace, scopedState.documents, scopedState.graph, scopedState.outputs, scopedState.recentActivities, scopedState.revision, workspaceId]);

  function guardWrite() {
    if (canEditCurrentWorkspace) return true;
    if (typeof window !== "undefined") window.alert(permissionDeniedMessage(currentWorkspace));
    return false;
  }

  const value = useMemo<KnowledgeContextValue>(
    () => ({
      state: scopedState,
      currentWorkspace,
      currentAccess,
      canEditCurrentWorkspace,
      ingestAnalysis: (file, content, analysis, parsed) => {
        if (!guardWrite()) return;
        dispatch({ type: "ingestAnalysis", workspaceId, file, content, analysis, parsed });
        void recordRemoteActivity({ workspaceId, actionType: "upload", targetType: "document", targetId: file.name, detail: `上传并分析资料：${file.name}` });
      },
      replaceDocumentAnalysis: (documentId, content, analysis, parsed) => {
        if (!guardWrite()) return;
        dispatch({ type: "replaceDocumentAnalysis", workspaceId, documentId, content, analysis, parsed });
        void recordRemoteActivity({ workspaceId, actionType: "upload", targetType: "document", targetId: documentId, detail: "重新分析资料并替换星图节点关系" });
      },
      createNode: (node) => {
        if (!guardWrite()) return;
        dispatch({ type: "createNode", workspaceId, node });
        void recordRemoteActivity({ workspaceId, actionType: "reorganize", targetType: "graphNode", targetId: node.id, detail: `新建星图节点：${node.label}` });
      },
      updateNode: (nodeId, patch) => {
        if (!guardWrite()) return;
        dispatch({ type: "updateNode", workspaceId, nodeId, patch, actorName: currentUser?.username });
        void recordRemoteActivity({ workspaceId, actionType: "reorganize", targetType: "graphNode", targetId: nodeId, detail: "编辑星图节点" });
      },
      deleteNode: (nodeId) => {
        if (!guardWrite()) return;
        dispatch({ type: "deleteNode", workspaceId, nodeId });
        void recordRemoteActivity({ workspaceId, actionType: "delete", targetType: "graphNode", targetId: nodeId, detail: "删除星图节点" });
      },
      upsertEdge: (edge) => {
        if (!guardWrite()) return;
        dispatch({ type: "upsertEdge", workspaceId, edge });
        void recordRemoteActivity({ workspaceId, actionType: "reorganize", targetType: "graphEdge", targetId: edge.id, detail: `保存星图关系：${edge.label ?? edge.relationType}` });
      },
      deleteEdge: (edgeId) => {
        if (!guardWrite()) return;
        dispatch({ type: "deleteEdge", workspaceId, edgeId });
        void recordRemoteActivity({ workspaceId, actionType: "delete", targetType: "graphEdge", targetId: edgeId, detail: "删除星图关系" });
      },
      updateNodePositions: (positions) => {
        if (!guardWrite()) return;
        dispatch({ type: "updateNodePositions", workspaceId, positions });
      },
      setNodesFixed: (nodeIds, fixed) => {
        if (!guardWrite()) return;
        dispatch({ type: "setNodesFixed", workspaceId, nodeIds, fixed });
        void recordRemoteActivity({ workspaceId, actionType: "reorganize", targetType: "layout", targetId: workspaceId, detail: fixed ? "固定星图节点位置" : "取消固定星图节点位置" });
      },
      resetLayout: () => {
        if (!guardWrite()) return;
        dispatch({ type: "resetLayout", workspaceId });
        void recordRemoteActivity({ workspaceId, actionType: "reorganize", targetType: "layout", targetId: workspaceId, detail: "重置星图自动布局" });
      },
      deleteDocument: (documentId) => {
        if (!guardWrite()) return;
        dispatch({ type: "deleteDocument", workspaceId, documentId });
        void recordRemoteActivity({ workspaceId, actionType: "delete", targetType: "document", targetId: documentId, detail: "删除资料" });
      },
      clearGraph: () => {
        if (!guardWrite()) return;
        dispatch({ type: "clearGraph", workspaceId });
        void recordRemoteActivity({ workspaceId, actionType: "clear", targetType: "workspace", targetId: workspaceId, detail: "清空知识星图" });
      },
      resetDemo: () => {
        if (!guardWrite()) return;
        dispatch({ type: "resetDemo" });
      },
      addOutput: (output, relatedNodeId, nodeType) => {
        if (!guardWrite()) return;
        dispatch({ type: "addOutput", workspaceId, output, relatedNodeId, nodeType });
        void recordRemoteActivity({ workspaceId, actionType: "generate", targetType: "output", targetId: output.id, detail: `保存成果：${output.title}` });
      },
      setCopilotContext: (context) => dispatch({ type: "setCopilotContext", context: context ? { ...context, workspaceId } : null }),
      recordAsk: (question) => {
        dispatch({ type: "recordAsk", workspaceId, question });
        void recordRemoteActivity({ workspaceId, actionType: "ask", targetType: "copilot", detail: question.slice(0, 180) });
      },
    }),
    [canEditCurrentWorkspace, currentAccess, currentWorkspace, scopedState, workspaceId],
  );

  return <KnowledgeContext.Provider value={value}>{children}</KnowledgeContext.Provider>;
}

export function useKnowledgeStore() {
  const context = useContext(KnowledgeContext);
  if (!context) throw new Error("useKnowledgeStore must be used inside KnowledgeProvider.");
  return context;
}
