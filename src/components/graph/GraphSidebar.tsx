import { CheckSquare, ChevronDown, FileText, Filter, LocateFixed, RotateCcw, Search, SlidersHorizontal, Square, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { nodeTypeMeta } from "../../data/mockGraphData";
import type { GraphMode } from "../../services/graphService";
import type { KnowledgeDocument } from "../../types/document";
import type { GraphNodeType } from "../../types/graph";
import { cn } from "../../utils/cn";
import type { GraphSearchResult } from "../../utils/graphUtils";

const nodeTypes: GraphNodeType[] = ["project", "document", "tech", "problem", "output", "tag", "concept"];

const modes: Array<{ key: GraphMode; label: string; detail: string }> = [
  { key: "global", label: "全局星图", detail: "展示全部资料星团" },
  { key: "project", label: "当前项目星图", detail: "聚焦项目所在星团" },
  { key: "local", label: "当前节点局部图谱", detail: "只看一阶邻居" },
];

interface GraphSidebarProps {
  canEdit: boolean;
  activeTypes: GraphNodeType[];
  mode: GraphMode;
  search: string;
  stats: {
    nodeCount: number;
    edgeCount: number;
    highlightedLabel?: string;
  };
  searchError?: string | null;
  documents: KnowledgeDocument[];
  searchResults: GraphSearchResult[];
  quickFilter: string | null;
  onSearchChange: (value: string) => void;
  onSelectSearchResult: (nodeId: string) => void;
  onTypeToggle: (type: GraphNodeType) => void;
  onSelectAllTypes: () => void;
  onSelectNoTypes: () => void;
  onInvertTypes: () => void;
  onQuickFilter: (filter: "recent" | "selectedDocument" | "outputs" | "problems" | null) => void;
  onModeChange: (mode: GraphMode) => void;
  onReset: () => void;
  onClearGraph: () => void;
  onDeleteDocument: (documentId: string) => void;
}

export default function GraphSidebar({
  canEdit,
  activeTypes,
  mode,
  search,
  stats,
  searchError,
  documents,
  searchResults,
  quickFilter,
  onSearchChange,
  onSelectSearchResult,
  onTypeToggle,
  onSelectAllTypes,
  onSelectNoTypes,
  onInvertTypes,
  onQuickFilter,
  onModeChange,
  onReset,
  onClearGraph,
  onDeleteDocument,
}: GraphSidebarProps) {
  return (
    <aside className="knowledge-graph-frame graph-side-panel lux-card workbench-panel min-w-0 flex-col rounded-3xl p-4">
      <div className="graph-panel-header">
        <div className="flex items-center gap-3">
          <span className="icon-tile">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">星图控制台</h2>
            <p className="text-xs text-[var(--text-faint)]">搜索、筛选、模式切换</p>
          </div>
        </div>

        {!canEdit && (
          <p className="mt-3 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs leading-5 text-[var(--warning)]">
            只读共享星图：可搜索、查看和提问，不能上传、删除或清空管理员内容。
          </p>
        )}

        <label className="mt-4 block">
          <span className="mb-2 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Search className="h-4 w-4 text-[var(--accent)]" />
            搜索定位节点
          </span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="例如：PWM、RAG、答辩稿"
            className="input-shell w-full rounded-2xl px-4 py-2.5 text-sm placeholder:text-[var(--text-faint)]"
          />
        </label>
        {searchError && (
          <p className="mt-2 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning)]">
            {searchError}
          </p>
        )}
        {search.trim() && searchResults.length > 0 && (
          <div className="thin-scrollbar mt-2 max-h-40 space-y-2 overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-2 shadow-glass-inset">
            {searchResults.map((result) => (
              <button key={result.node.id} type="button" onClick={() => onSelectSearchResult(result.node.id)} className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-[var(--surface-hover)]">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">{result.node.label}</span>
                  <span className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] text-[var(--text-faint)]">
                    {nodeTypeMeta[result.node.type].label}
                  </span>
                </span>
                <span className="mt-1 line-clamp-1 text-xs text-[var(--text-faint)]">{result.sourceTitle ?? result.matchedText}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="graph-panel-scroll thin-scrollbar mt-4">
        <GraphPanelSection title="节点类型筛选" icon={<Filter className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <button type="button" onClick={onSelectAllTypes} className="micro-card hover-lift inline-flex items-center justify-center gap-1 px-2 py-2 text-xs text-[var(--text-secondary)]">
              <CheckSquare className="h-3.5 w-3.5" />
              全选
            </button>
            <button type="button" onClick={onSelectNoTypes} className="micro-card hover-lift inline-flex items-center justify-center gap-1 px-2 py-2 text-xs text-[var(--text-secondary)]">
              <Square className="h-3.5 w-3.5" />
              全不选
            </button>
            <button type="button" onClick={onInvertTypes} className="micro-card hover-lift px-2 py-2 text-xs text-[var(--text-secondary)]">
              反选
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {nodeTypes.map((type) => {
              const active = activeTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onTypeToggle(type)}
                  className={cn(
                    "liquid-action flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm transition",
                    active
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-faint)] hover:text-[var(--text-secondary)]",
                  )}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: nodeTypeMeta[type].color, boxShadow: active ? `0 0 14px ${nodeTypeMeta[type].glow}` : "none" }} />
                  {nodeTypeMeta[type].label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["recent", "最近上传"],
              ["selectedDocument", "当前文档"],
              ["outputs", "只看成果"],
              ["problems", "只看问题"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onQuickFilter(quickFilter === key ? null : (key as "recent" | "selectedDocument" | "outputs" | "problems"))}
                className={cn(
                  "liquid-action rounded-xl border px-3 py-2 text-xs transition",
                  quickFilter === key ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </GraphPanelSection>

        <GraphPanelSection title="星图模式" icon={<LocateFixed className="h-4 w-4 text-[var(--accent)]" />} defaultOpen>
          <div className="space-y-2">
            {modes.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onModeChange(item.key)}
                className={cn(
                  "liquid-action w-full rounded-2xl border p-3 text-left transition",
                  mode === item.key ? "border-[var(--accent-border)] bg-[var(--accent-soft)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] hover:bg-[var(--surface-hover)]",
                )}
              >
                <span className="block text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
                <span className="mt-1 block text-xs text-[var(--text-faint)]">{item.detail}</span>
              </button>
            ))}
          </div>
        </GraphPanelSection>

        <GraphPanelSection title="最近上传资料" icon={<FileText className="h-4 w-4 text-[var(--accent)]" />} defaultOpen={false}>
          {documents.length === 0 ? (
            <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3 text-xs leading-6 text-[var(--text-faint)]">
              暂无入库资料。上传第一份资料后，星图会自动生成文档节点和知识关系。
            </p>
          ) : (
            <div className="space-y-2">
              {documents.slice(0, 5).map((document) => (
                <div key={document.id} className="group rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{document.title}</p>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">{document.uploadedAt} · {document.sizeLabel}</p>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">{document.canAnswer ? `${document.chunks.length} 个片段` : document.parseStatus}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onDeleteDocument(document.id)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] opacity-75 transition hover:opacity-100"
                        title="删除该资料及关联节点"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GraphPanelSection>
      </div>

      <div className="graph-panel-footer">
        <details className="graph-section">
          <summary>
            <span className="text-sm text-[var(--text-muted)]">星图统计</span>
            <ChevronDown className="graph-section-chevron h-4 w-4" />
          </summary>
          <div className="graph-section-body">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-[var(--surface-soft)] p-2.5">
                <p className="text-xs text-[var(--text-faint)]">节点数</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{stats.nodeCount}</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-soft)] p-2.5">
                <p className="text-xs text-[var(--text-faint)]">关系数</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{stats.edgeCount}</p>
              </div>
            </div>
            <div className="mt-2 rounded-2xl bg-[var(--surface-soft)] p-2.5">
              <p className="text-xs text-[var(--text-faint)]">当前高亮节点</p>
              <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">{stats.highlightedLabel || "尚未选择"}</p>
            </div>
          </div>
        </details>
        <button type="button" onClick={onReset} className="btn-secondary mt-3 flex w-full py-2.5">
          <RotateCcw className="h-4 w-4" />
          重置视图
        </button>
        {canEdit && (
          <button type="button" onClick={onClearGraph} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] transition hover:-translate-y-0.5 hover:border-[var(--danger-border)]">
            <Trash2 className="h-4 w-4" />
            清空知识星图
          </button>
        )}
      </div>
    </aside>
  );
}

function GraphPanelSection({
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
