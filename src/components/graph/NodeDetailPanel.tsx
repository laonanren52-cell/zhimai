import { Bot, ChevronDown, Clock, FileText, Globe2, Layers3, Link2, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { nodeTypeMeta } from "../../data/mockGraphData";
import type { GeneratedOutput } from "../../types/ai";
import type { KnowledgeDocument } from "../../types/document";
import type { GraphEdge, GraphNode } from "../../types/graph";
import type { AIRecommendation } from "../../store/knowledgeStore";
import { formatShanghaiDateTime } from "../../utils/time";

type NodeIntent = "ask" | "summary" | "generate" | "analyze" | "web";

interface NodeDetailPanelProps {
  canEdit: boolean;
  node: GraphNode | null;
  neighbors: GraphNode[];
  edges: GraphEdge[];
  documents: KnowledgeDocument[];
  outputs: GeneratedOutput[];
  recommendations: AIRecommendation[];
  onGenerate: (kind: string) => void;
  onAskNode: (intent: NodeIntent) => void;
  onDeleteNode: () => void;
  onReanalyzeDocument: (documentId: string) => void;
}

const outputActions = ["简历项目经历", "项目答辩稿", "PPT 大纲", "面试问答"];
type WorkspacePanelKey = "recent" | "recommend" | "outputs" | "detail" | "actions";

const workspacePanels: Array<{ key: WorkspacePanelKey; label: string }> = [
  { key: "recent", label: "最近上传" },
  { key: "recommend", label: "推荐操作" },
  { key: "outputs", label: "最近成果" },
  { key: "detail", label: "节点详情" },
  { key: "actions", label: "节点操作" },
];

export default function NodeDetailPanel({
  canEdit,
  node,
  neighbors,
  edges,
  documents,
  outputs,
  recommendations,
  onGenerate,
  onAskNode,
  onDeleteNode,
  onReanalyzeDocument,
}: NodeDetailPanelProps) {
  const [activePanel, setActivePanel] = useState<WorkspacePanelKey>(node ? "detail" : "recent");

  useEffect(() => {
    if (node) setActivePanel("detail");
  }, [node?.id]);

  if (!node) {
    return (
      <motion.aside
        initial={{ opacity: 0.6, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="knowledge-graph-frame graph-side-panel lux-card workbench-panel min-w-0 flex-col rounded-3xl p-4"
      >
        <div className="graph-panel-header flex items-center gap-3">
          <div className="icon-tile h-11 w-11">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">星图工作区</h2>
            <p className="text-sm text-[var(--text-faint)]">选择节点后可追溯、提问和生成成果</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {workspacePanels.slice(0, 3).map((panel) => (
            <button
              key={panel.key}
              type="button"
              onClick={() => setActivePanel(panel.key)}
              className={`liquid-action rounded-2xl border px-3 py-2 text-xs transition ${activePanel === panel.key ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {panel.label}
            </button>
          ))}
        </div>

        <div className="graph-panel-scroll thin-scrollbar mt-4">
          {activePanel === "recent" && (
          <DetailSection title="最近上传" icon={<FileText className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
            {documents.length === 0 ? (
              <p className="text-sm leading-7 text-[var(--text-faint)]">暂无资料。导入第一份资料后，这里会显示来源、摘要和可执行建议。</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 5).map((document) => (
                  <div key={document.id} className="micro-card graph-compact-card">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{document.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-faint)]">{document.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
          )}

          {activePanel === "recommend" && (
          <DetailSection title="推荐操作" icon={<Clock className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
            <div className="space-y-2">
              {recommendations.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </DetailSection>
          )}

          {activePanel === "outputs" && (
          <DetailSection title="最近成果" icon={<Layers3 className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
            {outputs.length === 0 ? (
              <p className="text-sm leading-7 text-[var(--text-faint)]">还没有保存的成果节点。你可以从知源 Copilot 或成果工坊生成并挂载到星图。</p>
            ) : (
              <div className="space-y-2">
                {outputs.slice(0, 5).map((output) => (
                  <div key={output.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{output.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{formatShanghaiDateTime(output.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
          )}
        </div>
      </motion.aside>
    );
  }

  const meta = nodeTypeMeta[node.type];
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const relatedDocuments = (node.sourceDocumentIds ?? []).map((id) => documentMap.get(id)).filter((item): item is KnowledgeDocument => Boolean(item));
  const sourceSnippets = relatedDocuments.flatMap((document) => document.chunks.slice(0, 2).map((chunk) => ({ document, chunk })));

  return (
    <motion.aside
      key={node.id}
      initial={{ opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: "easeOut" }}
      className="knowledge-graph-frame graph-side-panel lux-card workbench-panel min-w-0 flex-col rounded-3xl p-4"
    >
      <div className="graph-panel-header graph-detail-title">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: meta.color, boxShadow: `0 0 20px ${meta.glow}` }} />
          <div className="min-w-0">
            <p className="text-sm text-[var(--text-faint)]">{meta.label}节点</p>
            <h2 className="mt-1 line-clamp-2 break-words text-xl font-semibold text-[var(--text-primary)]">{node.label}</h2>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {workspacePanels.map((panel) => (
          <button
            key={panel.key}
            type="button"
            onClick={() => setActivePanel(panel.key)}
            className={`liquid-action rounded-2xl border px-3 py-2 text-xs transition ${activePanel === panel.key ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
          >
            {panel.label}
          </button>
        ))}
      </div>

      <div className="graph-panel-scroll thin-scrollbar mt-4">
        {activePanel === "recent" && (
          <DetailSection title="最近上传" icon={<FileText className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
            {documents.length === 0 ? (
              <p className="text-sm leading-7 text-[var(--text-faint)]">暂无资料。</p>
            ) : (
              <div className="space-y-2">
                {documents.slice(0, 5).map((document) => (
                  <div key={document.id} className="micro-card graph-compact-card">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{document.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-faint)]">{document.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        )}

        {activePanel === "recommend" && (
          <DetailSection title="推荐操作" icon={<Clock className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
            <div className="space-y-2">
              {recommendations.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </DetailSection>
        )}

        {activePanel === "outputs" && (
          <DetailSection title="最近成果" icon={<Layers3 className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
            {outputs.length === 0 ? (
              <p className="text-sm leading-7 text-[var(--text-faint)]">还没有保存的成果节点。</p>
            ) : (
              <div className="space-y-2">
                {outputs.slice(0, 5).map((output) => (
                  <div key={output.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{output.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{formatShanghaiDateTime(output.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        )}

        {activePanel === "detail" && (
        <>
        <DetailSection title="基础信息" icon={<Sparkles className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
          <p className="text-sm leading-6 text-[var(--text-muted)]">{node.description || "当前节点暂无补充说明。"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="micro-card graph-compact-card">
              <p className="text-xs text-[var(--text-faint)]">可信度</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{Math.round((node.confidence ?? 0.86) * 100)}%</p>
            </div>
            <div className="micro-card graph-compact-card">
              <p className="text-xs text-[var(--text-faint)]">直接连接</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{neighbors.length}</p>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="关联文件" icon={<FileText className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
          <div className="space-y-2">
            {relatedDocuments.slice(0, 5).map((document) => (
              <div key={document.id} className="rounded-2xl bg-[var(--surface-soft)] px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm text-[var(--text-primary)]">{document.title}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${document.canAnswer ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--warning-bg)] text-[var(--warning)]"}`}>
                    {document.canAnswer ? `${document.chunks.length} 片段` : "正文不可用"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-faint)]">{document.canAnswer ? document.summary : document.parseMessage}</p>
                {document.analysisSourceStatus === "mock" && <p className="mt-2 text-xs text-[var(--warning)]">历史 mock 数据</p>}
                {canEdit && document.canAnswer && (
                  <button type="button" onClick={() => onReanalyzeDocument(document.id)} className="btn-secondary mt-3 w-full justify-center py-2 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新分析当前资料
                  </button>
                )}
              </div>
            ))}
            {relatedDocuments.length === 0 && <p className="rounded-2xl bg-[var(--surface-soft)] px-3 py-3 text-sm leading-6 text-[var(--text-faint)]">暂无明确来源文件，问答可信度会降低。</p>}
          </div>
        </DetailSection>

        <DetailSection title="直接相连节点" icon={<Link2 className="h-4 w-4 text-[var(--accent)]" />} defaultOpen={false}>
          <div className="flex flex-wrap gap-2">
            {neighbors.slice(0, 14).map((neighbor) => (
              <span key={neighbor.id} className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                {neighbor.label}
              </span>
            ))}
            {neighbors.length === 0 && <p className="text-sm text-[var(--text-faint)]">当前节点还没有直接相连节点。</p>}
          </div>
        </DetailSection>

        <DetailSection title="关系与来源片段" icon={<Layers3 className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
          <div id="node-source-snippets" className="space-y-2">
            {edges.slice(0, 6).map((edge) => (
              <div key={edge.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--text-secondary)]">{edge.label ?? edge.relationType}</span>
                  <span className="text-xs text-[var(--text-faint)]">{Math.round((edge.confidence ?? 0.8) * 100)}%</span>
                </div>
                <p className="source-snippet-text thin-scrollbar mt-2 text-xs leading-5 text-[var(--text-faint)]">{edge.evidence}</p>
              </div>
            ))}
            {sourceSnippets.slice(0, 6).map(({ document, chunk }) => (
              <div key={`${document.id}-${chunk.id}`} className="rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
                <p className="truncate text-xs font-medium text-[var(--accent)]">{document.title}</p>
                <p className="source-snippet-text thin-scrollbar mt-2 text-xs leading-5 text-[var(--text-secondary)]">{chunk.text}</p>
              </div>
            ))}
            {edges.length === 0 && sourceSnippets.length === 0 && <p className="text-sm leading-6 text-[var(--text-faint)]">当前节点没有可用来源片段。若文件正文解析失败，Copilot 会拒绝生成可靠回答。</p>}
          </div>
        </DetailSection>
        </>
        )}
      </div>

      {activePanel === "actions" && (
      <div className="graph-panel-footer mt-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-[var(--accent)]">
          <Sparkles className="h-4 w-4" />
          节点操作
        </div>
        <div className="node-action-grid grid gap-2">
          {[
            ["基于该节点提问", "ask", Bot],
            ["总结该节点", "summary", Sparkles],
            ["联网补充该节点", "web", Globe2],
            ["生成该节点相关成果", "generate", Bot],
          ].map(([label, intent, Icon]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => onAskNode(intent as NodeIntent)}
              className="liquid-action flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
            >
              <Icon className="h-4 w-4 text-[var(--accent)]" />
              {label as string}
            </button>
          ))}
          <button
            type="button"
            onClick={() => document.getElementById("node-source-snippets")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="liquid-action flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
          >
            <Search className="h-4 w-4 text-[var(--accent)]" />
            查看来源片段
          </button>
          <details className="graph-section">
            <summary>
              <span className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <Layers3 className="h-4 w-4 text-[var(--accent)]" />
                更多成果生成
              </span>
              <ChevronDown className="graph-section-chevron h-4 w-4" />
            </summary>
            <div className="graph-section-body grid gap-2">
              {outputActions.map((label) => (
                <button key={label} type="button" onClick={() => onGenerate(label)} className="liquid-action rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-left text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]">
                  {label}
                </button>
              ))}
            </div>
          </details>
          {canEdit ? (
            <button type="button" onClick={onDeleteNode} className="flex items-center gap-2 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5 text-left text-sm font-semibold text-[var(--danger)] transition hover:border-[var(--danger-border)]">
              <Trash2 className="h-4 w-4" />
              删除该节点
            </button>
          ) : (
            <p className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2.5 text-xs leading-5 text-[var(--warning)]">
              你当前只有查看权限，不能修改管理员共享星图。
            </p>
          )}
        </div>
      </div>
      )}
    </motion.aside>
  );
}

function DetailSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="graph-section" open={defaultOpen}>
      <summary>
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <ChevronDown className="graph-section-chevron h-4 w-4 shrink-0" />
      </summary>
      <div className="graph-section-body">{children}</div>
    </details>
  );
}
