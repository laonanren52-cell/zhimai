import { useEffect, useMemo, useState } from "react";
import GraphSidebar from "../components/graph/GraphSidebar";
import KnowledgeGraph from "../components/graph/KnowledgeGraph";
import NodeDetailPanel from "../components/graph/NodeDetailPanel";
import WorkspaceBadge from "../components/common/WorkspaceBadge";
import { analyzeDocument } from "../services/aiService";
import { getVisibleGraph, type GraphMode } from "../services/graphService";
import { useAuthStore } from "../store/authStore";
import { useAiStatus } from "../store/aiStatusStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import type { KnowledgeDocument, ParsedDocument } from "../types/document";
import type { GraphNode, GraphNodeType, SourceReference } from "../types/graph";
import { getConnectedEdges, getNeighborIds, getNodeById, searchGraphNodes } from "../utils/graphUtils";
import { formatShanghaiDateTime } from "../utils/time";

const allTypes: GraphNodeType[] = ["project", "document", "tech", "problem", "output", "tag", "concept"];

interface GraphProps {
  onOpenAssistant: () => void;
}

export default function Graph({ onOpenAssistant }: GraphProps) {
  const { state, deleteNode, deleteDocument, clearGraph, setCopilotContext, replaceDocumentAnalysis, canEditCurrentWorkspace, currentWorkspace } = useKnowledgeStore();
  const { markAiSuccess, markAiFailure } = useAiStatus();
  const { publishWorkspace } = useAuthStore();
  const [activeTypes, setActiveTypes] = useState<GraphNodeType[]>(allTypes);
  const [mode, setMode] = useState<GraphMode>("global");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [scopeNodeId, setScopeNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [generatedToast, setGeneratedToast] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<"recent" | "selectedDocument" | "outputs" | "problems" | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ nodeId: string; version: number } | null>(null);

  const baseGraph = state.graph;
  const selectedDocumentIdForFilter = quickFilter === "selectedDocument" ? selectedNode?.sourceDocumentIds?.[0] : undefined;
  const visibleGraph = useMemo(() => {
    const modeGraph = getVisibleGraph(mode, activeTypes, scopeNodeId, baseGraph);
    if (!quickFilter) return modeGraph;
    const latestDocumentId = state.documents[0]?.id;
    const predicate = (node: GraphNode) => {
      if (quickFilter === "recent") return Boolean(latestDocumentId && node.sourceDocumentIds?.includes(latestDocumentId));
      if (quickFilter === "selectedDocument") return Boolean(selectedDocumentIdForFilter && node.sourceDocumentIds?.includes(selectedDocumentIdForFilter));
      if (quickFilter === "outputs") return node.type === "output";
      if (quickFilter === "problems") return node.type === "problem";
      return true;
    };
    const nodes = modeGraph.nodes.filter(predicate);
    const ids = new Set(nodes.map((node) => node.id));
    const edges = modeGraph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    return { nodes, edges };
  }, [mode, activeTypes, scopeNodeId, baseGraph, quickFilter, state.documents, selectedDocumentIdForFilter]);

  const searchResults = useMemo(() => searchGraphNodes(baseGraph.nodes, search, state.documents), [baseGraph.nodes, search, state.documents]);

  const neighbors = useMemo(() => {
    if (!selectedNode) return [];
    return [...getNeighborIds(selectedNode.id, baseGraph.edges)]
      .map((id) => getNodeById(baseGraph.nodes, id))
      .filter((node): node is GraphNode => Boolean(node));
  }, [baseGraph.edges, baseGraph.nodes, selectedNode]);

  const connectedEdges = useMemo(() => (selectedNode ? getConnectedEdges(selectedNode.id, baseGraph.edges) : []), [baseGraph.edges, selectedNode]);

  useEffect(() => {
    if (!selectedNode) return;
    if (!baseGraph.nodes.some((node) => node.id === selectedNode.id)) setSelectedNode(null);
  }, [baseGraph.nodes, selectedNode]);

  useEffect(() => {
    if (!search.trim()) return;
    setSearchError(searchResults.length === 0 ? `未找到包含「${search}」的节点，可尝试搜索资料名、摘要或技术关键词。` : null);
  }, [search, searchResults.length]);

  function nodeSourceSnippets(node: GraphNode | null): SourceReference[] {
    if (!node) return [];
    const documentIds = new Set(node.sourceDocumentIds ?? []);
    return state.documents
      .filter((document) => documentIds.has(document.id))
      .flatMap((document) =>
        document.chunks.slice(0, 3).map<SourceReference>((chunk) => ({
          sourceType: "local",
          documentId: document.id,
          documentTitle: document.title,
          snippet: chunk.text,
          score: document.confidence,
          nodeId: node.id,
          nodeLabel: node.label,
          chunkId: chunk.id,
          isParsed: document.canAnswer,
        })),
      );
  }

  function toggleType(type: GraphNodeType) {
    setActiveTypes((current) => {
      if (current.includes(type)) return current.length === 1 ? allTypes : current.filter((item) => item !== type);
      return [...current, type];
    });
  }

  function handleSelectSearchResult(nodeId: string) {
    const node = getNodeById(baseGraph.nodes, nodeId);
    if (!node) return;
    if (!activeTypes.includes(node.type)) setActiveTypes((current) => [...new Set([...current, node.type])]);
    setSelectedNode(node);
    setSearchError(null);
    setFocusRequest({ nodeId, version: Date.now() });
  }

  function handleQuickFilter(filter: "recent" | "selectedDocument" | "outputs" | "problems" | null) {
    setQuickFilter(filter);
    if (filter === "outputs") setActiveTypes(["output"]);
    if (filter === "problems") setActiveTypes(["problem"]);
    if (filter === "recent" || filter === "selectedDocument" || filter === null) setActiveTypes(allTypes);
  }

  function handleClearGraph() {
    if (!canEditCurrentWorkspace) {
      window.alert("你当前只有查看权限，不能修改管理员共享星图。");
      return;
    }
    if (!window.confirm("确认清空当前知识星图、资料记录和成果节点吗？此操作不可撤销。")) return;
    clearGraph();
    setMode("global");
    setScopeNodeId(null);
    setSelectedNode(null);
    setSearch("");
    setSearchError(null);
    setGeneratedToast("已清空知识星图，可重新导入第一份资料。");
    window.setTimeout(() => setGeneratedToast(null), 2600);
  }

  function handleDeleteDocument(documentId: string) {
    if (!canEditCurrentWorkspace) {
      window.alert("你当前只有查看权限，不能修改管理员共享星图。");
      return;
    }
    const document = state.documents.find((item) => item.id === documentId);
    if (!document) return;
    if (!window.confirm(`确认删除资料「${document.title}」及其专属节点关系吗？`)) return;
    deleteDocument(documentId);
    setSelectedNode(null);
    setGeneratedToast(`已删除资料「${document.title}」并重新组织星图。`);
    window.setTimeout(() => setGeneratedToast(null), 2600);
  }

  function handleDeleteNode() {
    if (!canEditCurrentWorkspace) {
      window.alert("你当前只有查看权限，不能修改管理员共享星图。");
      return;
    }
    if (!selectedNode) return;
    if (!window.confirm(`确认删除节点「${selectedNode.label}」及相关关系边吗？`)) return;
    deleteNode(selectedNode.id);
    setSelectedNode(null);
    setGeneratedToast(`已删除节点「${selectedNode.label}」。`);
    window.setTimeout(() => setGeneratedToast(null), 2600);
  }

  function parsedFromDocument(document: KnowledgeDocument, text: string): ParsedDocument {
    return {
      text,
      kind: document.kind,
      chunks: document.chunks,
      diagnostics: {
        status: document.parseStatus,
        qualityLevel: document.canAnswer ? "usable" : "failed",
        message: document.parseMessage,
        extractedLength: document.extractedLength,
        readabilityScore: document.canAnswer ? 100 : 0,
        chineseRatio: 0,
        abnormalCharRatio: document.isGarbled ? 1 : 0,
        newlineAnomalyScore: 0,
        isGarbled: document.isGarbled,
        needsOcr: document.needsOcr,
        ocrAvailable: false,
        ocrStatus: document.needsOcr ? "not_configured" : "not_needed",
        chunkCount: document.chunks.length,
        canAnswer: document.canAnswer,
        allowContinue: document.canAnswer,
        requiresUserConfirmation: false,
        preview: text.slice(0, 1000),
        nextSuggestion: document.canAnswer ? "可以使用真实 AI 重新生成节点和关系。" : "需要先补充可解析正文后再重新分析。",
      },
    };
  }

  async function handleReanalyzeDocument(documentId: string) {
    if (!canEditCurrentWorkspace) {
      window.alert("你当前没有编辑权限，不能重新分析该资料。");
      return;
    }
    const document = state.documents.find((item) => item.id === documentId);
    if (!document) return;
    const text = (document.sourceText || document.chunks.map((chunk) => chunk.text).join("\n\n")).trim();
    if (!text) {
      window.alert("该资料没有可用于重新分析的正文，请重新上传或手动导入正文。");
      return;
    }
    setGeneratedToast(`正在重新分析《${document.title}》...`);
    try {
      const parsed = parsedFromDocument(document, text);
      const analysis = await analyzeDocument(text, document.title, parsed);
      replaceDocumentAnalysis(document.id, text, analysis, parsed);
      markAiSuccess("reanalyze-document");
      setSelectedNode(null);
      setGeneratedToast(`已用真实 AI 重新分析《${document.title}》。`);
    } catch (error) {
      markAiFailure("reanalyze-document", error);
      const message = error instanceof Error ? error.message : "重新分析失败，请检查后端 AI 接口。";
      setGeneratedToast(message);
      window.alert(message);
    } finally {
      window.setTimeout(() => setGeneratedToast(null), 3000);
    }
  }

  function openCopilot(intent: "ask" | "summary" | "generate" | "analyze" | "web") {
    if (!selectedNode) return;
    setCopilotContext({
      nodeId: selectedNode.id,
      nodeLabel: selectedNode.label,
      nodeType: selectedNode.type,
      summary: selectedNode.description,
      relatedDocumentIds: selectedNode.sourceDocumentIds ?? [],
      sourceSnippets: nodeSourceSnippets(selectedNode),
      neighborLabels: neighbors.map((node) => node.label),
      intent,
      answerMode: intent === "web" ? "web" : "hybrid",
    });
    onOpenAssistant();
  }

  return (
    <div className="mx-auto max-w-[1680px] px-3 py-6 md:px-6 md:py-8 fade-in">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-kicker">Obsidian Global Graph · 个人知识宇宙</p>
          <h1 className="page-title-compact">知脉星图</h1>
          <p className="page-subtitle">
            把资料、项目、问题、技术点和成果组织为可追溯的个人知识星图。点击节点只更新高亮、来源和右侧详情，不会自动放大画布。
          </p>
        </div>
        <div className="liquid-action rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2 text-sm text-[var(--accent)]">
          {baseGraph.nodes.length} 节点 · {baseGraph.edges.length} 关系 · {state.documents.length} 资料
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <WorkspaceBadge />
        <div className="flex flex-wrap items-center gap-2">
          {currentWorkspace?.type === "admin_public" && (
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-2 text-xs text-[var(--text-muted)]">
              v{currentWorkspace.version} · 最近发布 {formatShanghaiDateTime(currentWorkspace.lastPublishedAt)} · {currentWorkspace.updateSummary ?? "暂无更新说明"}
            </span>
          )}
          {canEditCurrentWorkspace && currentWorkspace?.type === "admin_public" ? (
            <button type="button" onClick={() => publishWorkspace("管理员发布了新的共享星图更新。")} className="btn-secondary">
              发布更新
            </button>
          ) : (
            <button type="button" onClick={() => window.location.reload()} className="btn-secondary">
              刷新共享星图
            </button>
          )}
        </div>
      </div>

      <div className="graph-workspace-grid grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px] 2xl:grid-cols-[320px_minmax(680px,1fr)_360px]">
        <GraphSidebar
          canEdit={canEditCurrentWorkspace}
          activeTypes={activeTypes}
          mode={mode}
          search={search}
          searchError={searchError}
          documents={state.documents}
          searchResults={searchResults}
          quickFilter={quickFilter}
          stats={{ nodeCount: visibleGraph.nodes.length, edgeCount: visibleGraph.edges.length, highlightedLabel: selectedNode?.label }}
          onSearchChange={(value) => {
            setSearch(value);
            setSearchError(null);
          }}
          onSelectSearchResult={handleSelectSearchResult}
          onTypeToggle={toggleType}
          onSelectAllTypes={() => setActiveTypes(allTypes)}
          onSelectNoTypes={() => setActiveTypes([])}
          onInvertTypes={() => setActiveTypes(allTypes.filter((type) => !activeTypes.includes(type)))}
          onQuickFilter={handleQuickFilter}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            setScopeNodeId(nextMode === "global" ? null : (selectedNode?.id ?? scopeNodeId));
          }}
          onReset={() => {
            setMode("global");
            setScopeNodeId(null);
            setActiveTypes(allTypes);
            setSelectedNode(null);
            setSearch("");
            setSearchError(null);
          }}
          onClearGraph={handleClearGraph}
          onDeleteDocument={handleDeleteDocument}
          onReanalyzeDocument={(documentId) => void handleReanalyzeDocument(documentId)}
        />
        <KnowledgeGraph
          data={visibleGraph}
          selectedNodeId={selectedNode?.id ?? null}
          searchQuery={search}
          focusRequest={focusRequest}
          onSelectNode={(node) => {
            setSelectedNode(node);
            setSearchError(null);
          }}
          onSearchMiss={(query) => setSearchError(`未找到包含「${query}」的节点。`)}
          onSwitchLocal={(nodeId) => {
            setScopeNodeId(nodeId);
            setMode("local");
          }}
        />
        <NodeDetailPanel
          canEdit={canEditCurrentWorkspace}
          node={selectedNode}
          neighbors={neighbors}
          edges={connectedEdges}
          documents={state.documents}
          outputs={state.outputs}
          recommendations={state.recommendations}
          onGenerate={(kind) => {
            setGeneratedToast(`已带入「${selectedNode?.label ?? "当前节点"}」上下文，前往知源 Copilot 生成${kind}。`);
            openCopilot("generate");
            window.setTimeout(() => setGeneratedToast(null), 1800);
          }}
          onAskNode={openCopilot}
          onDeleteNode={handleDeleteNode}
          onReanalyzeDocument={(documentId) => void handleReanalyzeDocument(documentId)}
        />
      </div>
      {generatedToast && (
        <div className="toast-glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--accent-border)] px-5 py-3 text-sm text-[var(--accent)] backdrop-blur-xl">
          {generatedToast}
        </div>
      )}
    </div>
  );
}
