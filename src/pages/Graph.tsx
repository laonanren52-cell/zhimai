import { useEffect, useMemo, useState } from "react";
import GraphSidebar from "../components/graph/GraphSidebar";
import KnowledgeGraph from "../components/graph/KnowledgeGraph";
import NodeDetailPanel from "../components/graph/NodeDetailPanel";
import { analyzeDocument } from "../services/aiService";
import { getVisibleGraph, type GraphMode } from "../services/graphService";
import { useAuthStore } from "../store/authStore";
import { useAiStatus } from "../store/aiStatusStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import type { KnowledgeDocument, ParsedDocument } from "../types/document";
import type { GraphEdge, GraphLayoutMode, GraphNode, GraphNodeType, GraphRelationType, SourceReference } from "../types/graph";
import { getConnectedEdges, getNeighborIds, getNodeById, searchGraphNodes } from "../utils/graphUtils";

const allTypes: GraphNodeType[] = ["project", "document", "tech", "problem", "output", "tag", "concept"];
const relationOptions: Array<[GraphRelationType, string]> = [
  ["related_to", "相关"],
  ["belongs_to", "包含"],
  ["uses", "使用"],
  ["depends_on", "依赖"],
  ["solves", "解决"],
  ["generates", "生成"],
  ["proves", "证明"],
  ["references", "引用"],
  ["custom", "自定义"],
];

interface GraphProps {
  onOpenAssistant: () => void;
}

export default function Graph({ onOpenAssistant }: GraphProps) {
  const {
    state,
    createNode,
    updateNode,
    deleteNode,
    upsertEdge,
    deleteEdge,
    updateNodePositions,
    setNodesFixed,
    resetLayout,
    deleteDocument,
    clearGraph,
    setCopilotContext,
    replaceDocumentAnalysis,
    canEditCurrentWorkspace,
    currentWorkspace,
  } = useKnowledgeStore();
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
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [relationEditMode, setRelationEditMode] = useState(false);
  const [relationStartNode, setRelationStartNode] = useState<GraphNode | null>(null);
  const [relationDraft, setRelationDraft] = useState<{ edge?: GraphEdge; from?: GraphNode; to?: GraphNode; relationType: GraphRelationType; label: string; description: string; isBidirectional: boolean } | null>(null);
  const [nodeDraft, setNodeDraft] = useState<Partial<GraphNode> | null>(null);
  const [layoutMode, setLayoutMode] = useState<GraphLayoutMode>("stable");
  const [layoutCommand, setLayoutCommand] = useState<{ type: "save" | "center"; version: number } | null>(null);

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
    if (!selectedEdge) return;
    const nextEdge = baseGraph.edges.find((edge) => edge.id === selectedEdge.id) ?? null;
    setSelectedEdge(nextEdge);
  }, [baseGraph.edges, selectedEdge?.id]);

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
    setSelectedEdge(null);
    setSearchError(null);
    setFocusRequest({ nodeId, version: Date.now() });
  }

  function handleRelationNodeClick(node: GraphNode) {
    if (!canEditCurrentWorkspace) return;
    if (!relationEditMode) setRelationEditMode(true);
    if (!relationStartNode) {
      setRelationStartNode(node);
      setGeneratedToast(`已选择起点「${node.label}」，请点击终点节点。`);
      window.setTimeout(() => setGeneratedToast(null), 2200);
      return;
    }
    if (relationStartNode.id === node.id) {
      setGeneratedToast("起点和终点不能是同一个节点。");
      window.setTimeout(() => setGeneratedToast(null), 2200);
      return;
    }
    setRelationDraft({ from: relationStartNode, to: node, relationType: "related_to", label: "相关", description: "", isBidirectional: false });
    setRelationStartNode(null);
  }

  function saveRelationDraft() {
    if (!relationDraft) return;
    const from = relationDraft.from ?? baseGraph.nodes.find((node) => node.id === relationDraft.edge?.from);
    const to = relationDraft.to ?? baseGraph.nodes.find((node) => node.id === relationDraft.edge?.to);
    if (!from || !to) return;
    const stamp = new Date().toISOString();
    const edge: GraphEdge = {
      id: relationDraft.edge?.id ?? `manual-edge-${from.id}-${to.id}-${Date.now()}`.replace(/[^a-zA-Z0-9-]/g, "-"),
      workspaceId: state.workspaceId,
      from: from.id,
      to: to.id,
      relationType: relationDraft.relationType,
      label: relationDraft.label.trim() || relationOptions.find(([type]) => type === relationDraft.relationType)?.[1] || "相关",
      description: relationDraft.description.trim(),
      evidence: relationDraft.description.trim(),
      isBidirectional: relationDraft.isBidirectional,
      isManual: true,
      confidence: 1,
      createdBy: relationDraft.edge?.createdBy ?? "user",
      createdAt: relationDraft.edge?.createdAt ?? stamp,
      updatedAt: stamp,
      weight: relationDraft.edge?.weight ?? 0.9,
    };
    upsertEdge(edge);
    if (edge.isBidirectional) {
      upsertEdge({ ...edge, id: `${edge.id}-reverse`, from: edge.to, to: edge.from });
    }
    setSelectedEdge(edge);
    setRelationDraft(null);
    setRelationEditMode(false);
    setGeneratedToast("关系已保存。");
    window.setTimeout(() => setGeneratedToast(null), 2200);
  }

  function editEdge(edge: GraphEdge) {
    const from = baseGraph.nodes.find((node) => node.id === edge.from);
    const to = baseGraph.nodes.find((node) => node.id === edge.to);
    setRelationDraft({
      edge,
      from,
      to,
      relationType: edge.relationType,
      label: edge.label ?? relationOptions.find(([type]) => type === edge.relationType)?.[1] ?? "相关",
      description: edge.description ?? edge.evidence ?? "",
      isBidirectional: Boolean(edge.isBidirectional),
    });
  }

  function handleDeleteEdge(edge: GraphEdge) {
    if (!canEditCurrentWorkspace) {
      window.alert("你当前只有查看权限，不能修改管理员共享星图。");
      return;
    }
    if (!window.confirm(`确认删除关系「${edge.label ?? edge.relationType}」吗？`)) return;
    deleteEdge(edge.id);
    if (selectedEdge?.id === edge.id) setSelectedEdge(null);
    setGeneratedToast("关系已删除。");
    window.setTimeout(() => setGeneratedToast(null), 2200);
  }

  function openNewNodeForm() {
    setNodeDraft({
      label: "",
      type: "concept",
      description: "",
      tags: [],
      sourceNote: "",
      isRoot: false,
    });
  }

  function openEditNodeForm(node: GraphNode) {
    setNodeDraft({ ...node, tags: node.tags ?? [] });
  }

  function saveNodeDraft() {
    if (!nodeDraft?.label?.trim()) {
      window.alert("请填写节点名称。");
      return;
    }
    const id = nodeDraft.id || `manual-node-${Date.now()}`;
    const node: GraphNode = {
      id,
      workspaceId: state.workspaceId,
      label: nodeDraft.label.trim(),
      type: nodeDraft.type ?? "concept",
      group: nodeDraft.group || "manual",
      cluster: nodeDraft.cluster || "manual",
      description: nodeDraft.description || nodeDraft.userDescription || "",
      tags: nodeDraft.tags ?? [],
      sourceNote: nodeDraft.sourceNote,
      isRoot: Boolean(nodeDraft.isRoot),
      isManual: nodeDraft.isManual ?? true,
      value: nodeDraft.isRoot ? 32 : nodeDraft.value ?? 12,
      confidence: nodeDraft.confidence ?? 1,
      x: nodeDraft.x,
      y: nodeDraft.y,
      fixed: nodeDraft.fixed,
      layoutMode: nodeDraft.layoutMode,
    };
    if (nodeDraft.id) updateNode(nodeDraft.id, node);
    else createNode(node);
    setSelectedNode(node);
    setNodeDraft(null);
    setGeneratedToast(nodeDraft.id ? "节点已更新。" : "节点已创建。");
    window.setTimeout(() => setGeneratedToast(null), 2200);
  }

  function handleLayoutAction(action: "save" | "restore" | "reset" | "fixAll" | "unfixAll" | "center") {
    if (action === "center") {
      setLayoutCommand({ type: "center", version: Date.now() });
      return;
    }
    if (!canEditCurrentWorkspace) {
      window.alert("你当前只有查看权限，不能保存布局。");
      return;
    }
    if (action === "save") {
      setLayoutCommand({ type: "save", version: Date.now() });
      setGeneratedToast("当前布局已保存。");
    }
    if (action === "restore") setGeneratedToast("已使用最近一次保存的布局。");
    if (action === "reset") {
      if (!window.confirm("确认重置为自动布局吗？这会覆盖用户手动摆放的位置。")) return;
      resetLayout();
      setLayoutMode("auto");
      setGeneratedToast("已重置为自动布局。");
    }
    if (action === "fixAll") {
      setLayoutCommand({ type: "save", version: Date.now() });
      setNodesFixed(undefined, true);
      setGeneratedToast("已固定全部节点。");
    }
    if (action === "unfixAll") {
      setNodesFixed(undefined, false);
      setGeneratedToast("已取消全部固定。");
    }
    window.setTimeout(() => setGeneratedToast(null), 2200);
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

  function handleDeleteGraphNode(node: GraphNode) {
    if (!canEditCurrentWorkspace) {
      window.alert("你当前只有查看权限，不能修改管理员共享星图。");
      return;
    }
    if (!window.confirm(`确认删除节点「${node.label}」及相关关系边吗？`)) return;
    deleteNode(node.id);
    if (selectedNode?.id === node.id) setSelectedNode(null);
    setGeneratedToast(`已删除节点「${node.label}」。`);
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
          <h1 className="page-title-compact">知脉星图</h1>
          <p className="page-subtitle">
            把资料、项目、问题、技术点和成果组织为可追溯的个人知识星图。点击节点只更新高亮、来源和右侧详情，不会自动放大画布。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="liquid-action rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2 text-sm text-[var(--accent)]">
            {baseGraph.nodes.length} 节点 · {baseGraph.edges.length} 关系 · {state.documents.length} 资料
          </div>
          <select value={layoutMode} onChange={(event) => setLayoutMode(event.target.value as GraphLayoutMode)} className="input-shell rounded-full px-3 py-2 text-sm">
            <option value="auto">自动布局</option>
            <option value="stable">稳定布局</option>
            <option value="free">自由布局</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setRelationEditMode((value) => !value);
              setRelationStartNode(null);
            }}
            disabled={!canEditCurrentWorkspace}
            className={relationEditMode ? "btn-primary px-3 py-2" : "btn-secondary px-3 py-2"}
          >
            {relationEditMode ? "关系编辑中" : "关系编辑模式"}
          </button>
          <button type="button" onClick={openNewNodeForm} disabled={!canEditCurrentWorkspace} className="btn-secondary px-3 py-2">
            新建节点
          </button>
          <button type="button" onClick={() => handleLayoutAction("save")} disabled={!canEditCurrentWorkspace} className="btn-secondary px-3 py-2">
            保存当前布局
          </button>
          <button type="button" onClick={() => handleLayoutAction("restore")} className="btn-secondary px-3 py-2">
            恢复上次布局
          </button>
          <button type="button" onClick={() => handleLayoutAction("reset")} disabled={!canEditCurrentWorkspace} className="btn-secondary px-3 py-2">
            重置自动布局
          </button>
          <button type="button" onClick={() => handleLayoutAction("fixAll")} disabled={!canEditCurrentWorkspace} className="btn-secondary px-3 py-2">
            全部固定
          </button>
          <button type="button" onClick={() => handleLayoutAction("unfixAll")} disabled={!canEditCurrentWorkspace} className="btn-secondary px-3 py-2">
            全部取消固定
          </button>
          <button type="button" onClick={() => handleLayoutAction("center")} className="btn-secondary px-3 py-2">
            居中视图
          </button>
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
          selectedEdgeId={selectedEdge?.id ?? null}
          searchQuery={search}
          focusRequest={focusRequest}
          canEdit={canEditCurrentWorkspace}
          graphLayoutMode={layoutMode}
          relationEditMode={relationEditMode}
          relationStartNodeId={relationStartNode?.id ?? null}
          layoutCommand={layoutCommand}
          onSelectNode={(node) => {
            setSelectedNode(node);
            if (node) setSelectedEdge(null);
            setSearchError(null);
          }}
          onSelectEdge={(edge) => {
            setSelectedEdge(edge);
            if (edge) setSelectedNode(null);
          }}
          onSearchMiss={(query) => setSearchError(`未找到包含「${query}」的节点。`)}
          onSwitchLocal={(nodeId) => {
            setScopeNodeId(nodeId);
            setMode("local");
          }}
          onDeleteNode={handleDeleteGraphNode}
          onRelationNodeClick={handleRelationNodeClick}
          onEditEdge={editEdge}
          onDeleteEdge={handleDeleteEdge}
          onToggleNodeFixed={(node, fixed) => {
            if (!canEditCurrentWorkspace) return;
            updateNodePositions([{ id: node.id, x: node.x ?? 0, y: node.y ?? 0, fixed, layoutMode: fixed ? "free" : layoutMode }]);
            setGeneratedToast(fixed ? "节点位置已固定。" : "节点已取消固定。");
            window.setTimeout(() => setGeneratedToast(null), 1800);
          }}
          onUpdateNodePositions={updateNodePositions}
        />
        <NodeDetailPanel
          canEdit={canEditCurrentWorkspace}
          node={selectedNode}
          selectedEdge={selectedEdge}
          nodes={baseGraph.nodes}
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
          onEditNode={() => selectedNode && openEditNodeForm(selectedNode)}
          onDeleteNode={handleDeleteNode}
          onEditEdge={editEdge}
          onDeleteEdge={handleDeleteEdge}
          onReanalyzeDocument={(documentId) => void handleReanalyzeDocument(documentId)}
        />
      </div>
      {relationDraft && (
        <RelationEditor
          draft={relationDraft}
          onChange={setRelationDraft}
          onCancel={() => setRelationDraft(null)}
          onSave={saveRelationDraft}
        />
      )}
      {nodeDraft && (
        <NodeEditor
          draft={nodeDraft}
          onChange={setNodeDraft}
          onCancel={() => setNodeDraft(null)}
          onSave={saveNodeDraft}
        />
      )}
      {generatedToast && (
        <div className="toast-glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--accent-border)] px-5 py-3 text-sm text-[var(--accent)] backdrop-blur-xl">
          {generatedToast}
        </div>
      )}
    </div>
  );
}

function RelationEditor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: { edge?: GraphEdge; from?: GraphNode; to?: GraphNode; relationType: GraphRelationType; label: string; description: string; isBidirectional: boolean };
  onChange: (draft: { edge?: GraphEdge; from?: GraphNode; to?: GraphNode; relationType: GraphRelationType; label: string; description: string; isBidirectional: boolean }) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(245,248,252,0.58)] px-4 backdrop-blur-md">
      <section className="lux-card w-full max-w-xl rounded-3xl p-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{draft.edge ? "编辑关系" : "创建关系"}</h2>
        <p className="mt-2 text-sm text-[var(--text-faint)]">
          {draft.from?.label ?? draft.edge?.from} → {draft.to?.label ?? draft.edge?.to}
        </p>
        <div className="mt-5 grid gap-3">
          <label className="grid gap-2">
            <span className="text-sm text-[var(--text-muted)]">关系类型</span>
            <select
              value={draft.relationType}
              onChange={(event) => {
                const relationType = event.target.value as GraphRelationType;
                onChange({ ...draft, relationType, label: relationOptions.find(([type]) => type === relationType)?.[1] ?? draft.label });
              }}
              className="input-shell rounded-2xl px-4 py-3 text-sm"
            >
              {relationOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-[var(--text-muted)]">关系说明 / 标签</span>
            <input value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="例如：证明、引用、依赖" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm text-[var(--text-muted)]">详细说明</span>
            <textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} className="input-shell min-h-28 rounded-2xl px-4 py-3 text-sm" placeholder="说明两个节点为什么有关联" />
          </label>
          <button type="button" onClick={() => onChange({ ...draft, isBidirectional: !draft.isBidirectional })} className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            是否双向关系
            <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">{draft.isBidirectional ? "是" : "否"}</span>
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2">取消</button>
          <button type="button" onClick={onSave} className="btn-primary px-4 py-2">保存关系</button>
        </div>
      </section>
    </div>
  );
}

function NodeEditor({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Partial<GraphNode>;
  onChange: (draft: Partial<GraphNode>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(245,248,252,0.58)] px-4 backdrop-blur-md">
      <section className="lux-card w-full max-w-2xl rounded-3xl p-5">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{draft.id ? "编辑节点" : "新建节点"}</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input value={draft.label ?? ""} onChange={(event) => onChange({ ...draft, label: event.target.value })} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="节点名称" />
          <select value={draft.type ?? "concept"} onChange={(event) => onChange({ ...draft, type: event.target.value as GraphNodeType })} className="input-shell rounded-2xl px-4 py-3 text-sm">
            {allTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <input value={(draft.tags ?? []).join(", ")} onChange={(event) => onChange({ ...draft, tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="标签，用逗号分隔" />
          <input value={draft.sourceNote ?? ""} onChange={(event) => onChange({ ...draft, sourceNote: event.target.value })} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="来源说明" />
          <label className="md:col-span-2 grid gap-2">
            <span className="text-sm text-[var(--text-muted)]">节点说明 / 摘要</span>
            <textarea value={draft.description ?? draft.userDescription ?? ""} onChange={(event) => onChange({ ...draft, description: event.target.value, userDescription: event.target.value })} className="input-shell min-h-28 rounded-2xl px-4 py-3 text-sm" placeholder="补充节点摘要、备注或用户修正内容" />
          </label>
          <button type="button" onClick={() => onChange({ ...draft, isRoot: !draft.isRoot })} className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-muted)]">
            是否作为根节点
            <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">{draft.isRoot ? "是" : "否"}</span>
          </button>
        </div>
        {draft.originalDescription && <p className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-xs leading-6 text-[var(--text-faint)]">原始 AI 摘要：{draft.originalDescription}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary px-4 py-2">取消</button>
          <button type="button" onClick={onSave} className="btn-primary px-4 py-2">保存节点</button>
        </div>
      </section>
    </div>
  );
}
