import { BarChart3, Boxes, CheckCircle2, FileText, Globe2, Network, Search, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import AIRecommendationCard from "../components/dashboard/AIRecommendationCard";
import StatCard from "../components/dashboard/StatCard";
import { useAiStatus } from "../store/aiStatusStore";
import { useAuthStore } from "../store/authStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import { getGraphCounts } from "../utils/graphUtils";
import { formatShanghaiDateTime } from "../utils/time";

type Destination = "dashboard" | "upload" | "graph" | "assistant" | "outputs";

interface DashboardProps {
  onNavigate: (page: Destination) => void;
}

const dynamicWords = ["资料", "项目", "技术", "问题", "成果"];
const heroLines = [
  "上传资料，生成可追溯知识星图",
  "让 AI 基于你的文件回答问题",
  "把项目、技术和成果串联起来",
  "管理共享知识空间，服务更多用户",
];

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { state, canEditCurrentWorkspace } = useKnowledgeStore();
  const { currentUser, metrics } = useAuthStore();
  const { status: aiStatus } = useAiStatus();
  const [wordIndex, setWordIndex] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const counts = getGraphCounts(state.graph);
  const latestDocument = state.documents[0] ?? null;
  const answerableDocuments = state.documents.filter((document) => document.canAnswer);
  const chunkCount = answerableDocuments.reduce((sum, document) => sum + document.chunks.length, 0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWordIndex((index) => (index + 1) % dynamicWords.length);
      setLineIndex((index) => (index + 1) % heroLines.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  const liveItems = useMemo(
    () => [
      latestDocument ? `最近导入：${latestDocument.title}` : "等待导入第一份资料",
      `星图节点：${counts.nodeCount} · 关系：${counts.edgeCount}`,
      `可问答片段：${chunkCount}`,
      `AI 状态：${aiStatus.summary}`,
    ],
    [aiStatus.summary, chunkCount, counts.edgeCount, counts.nodeCount, latestDocument],
  );

  return (
    <div className="page-shell fade-in">
      <section className="dashboard-hero-grid grid gap-8 lg:grid-cols-[minmax(0,1fr)_500px] lg:items-center">
        <div className="relative">
          <h1 className="page-title">
            知脉 AI
            <span className="block text-[var(--text-secondary)]">把资料沉淀成可追溯知识星图</span>
          </h1>
          <p className="dashboard-live-line mt-5 inline-flex rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-2 text-sm text-[var(--accent)]">
            {heroLines[lineIndex]}
          </p>
          <p className="page-subtitle">
            上传文档、项目和笔记后，系统会抽取节点、关系和来源，让问答、总结和成果生成都有依据。
          </p>
          <p className="liquid-action mt-5 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--text-secondary)] shadow-glass-inset">
            把你的
            <span className="inline-flex min-w-[4.2em] justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 font-semibold text-[var(--accent)]">
              {dynamicWords[wordIndex]}
            </span>
            变成知识资产
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => onNavigate("graph")} className="btn-primary">
              <Network className="h-4 w-4" />
              进入知识星图
            </button>
            <button type="button" onClick={() => onNavigate(canEditCurrentWorkspace ? "upload" : "assistant")} className="btn-secondary">
              <FileText className="h-4 w-4" />
              {canEditCurrentWorkspace ? "导入资料" : "向 Copilot 提问"}
            </button>
          </div>
          <div className="mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">
            {liveItems.map((item) => (
              <div key={item} className="micro-card px-4 py-3 text-xs text-[var(--text-muted)]">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="lux-card hero-visual-card p-5">
          <div className="ambient-sheen absolute inset-0" />
          <div className="relative grid gap-4">
            <div className="micro-card rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">星图预览</p>
                  <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{counts.nodeCount} 节点 · {counts.edgeCount} 关系</p>
                </div>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)]">
                  <Network className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-5 grid gap-3">
                {state.graph.nodes.length > 0 ? (
                  state.graph.nodes.slice(0, 5).map((node, index) => (
                    <button key={node.id} type="button" onClick={() => onNavigate("graph")} className="group micro-card hover-lift flex items-center gap-3 p-3 text-left">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_18px_var(--glow-accent)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{node.label}</span>
                        <span className="mt-1 block text-xs text-[var(--text-faint)]">{node.type} · {node.sourceDocumentIds?.[0] ?? "system"}</span>
                      </span>
                      <span className="text-xs text-[var(--text-faint)]">{index + 1}</span>
                    </button>
                  ))
                ) : (
                  <button type="button" onClick={() => onNavigate(canEditCurrentWorkspace ? "upload" : "assistant")} className="empty-orbit rounded-2xl p-5 text-left text-sm leading-7 text-[var(--accent)]">
                    当前空间还没有资料。导入一份文档后，系统会生成第一组知识节点和来源片段。
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <PreviewCard icon={CheckCircle2} label="AI 分析状态" value={aiStatus.summary} detail={`${chunkCount} 个来源片段，${answerableDocuments.length} 份资料可问答`} />
              <PreviewCard icon={FileText} label="最近上传文件" value={latestDocument?.title ?? "暂无资料"} detail={latestDocument?.parseMessage ?? "导入后自动检测正文质量"} />
              <PreviewCard icon={Search} label="访问 / 登录" value={`${metrics.totalVisits} / ${metrics.loginCount}`} detail={`当前用户：${currentUser?.username ?? "未登录"}`} />
              <PreviewCard icon={Globe2} label="联网 / OCR" value={aiStatus.searchConfigured ? `搜索 ${aiStatus.searchProvider}` : "搜索未配置"} detail={aiStatus.ocrEnabled ? "OCR 已开启" : "OCR 未配置，仅影响扫描件识别"} />
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-14">
        <div className="grid grid-flow-dense gap-4 md:grid-cols-12">
          <div className="md:col-span-3">
            <StatCard label="已导入资料" value={`${state.documents.length}`} detail="PDF、Word、笔记和项目资料" icon={FileText} />
          </div>
          <div className="md:col-span-3">
            <StatCard label="知识节点" value={`${counts.nodeCount}`} detail="项目、文档、技术、问题与成果" icon={Boxes} />
          </div>
          <div className="md:col-span-3">
            <StatCard label="关系连接" value={`${counts.edgeCount}`} detail="提及、依赖、解决、生成和引用" icon={Network} />
          </div>
          <div className="md:col-span-3">
            <StatCard label="已保存成果" value={`${state.outputs.length}`} detail="总结、问题、成果节点回写星图" icon={BarChart3} />
          </div>
        </div>
      </section>

      <section className="grid grid-flow-dense gap-5 pb-16 md:grid-cols-12 md:pb-20">
        <div className="md:col-span-7">
          <AIRecommendationCard
            onOpenUpload={() => onNavigate("upload")}
            onOpenGraph={() => onNavigate("graph")}
            onOpenAssistant={() => onNavigate("assistant")}
            onOpenOutputs={() => onNavigate("outputs")}
            recommendations={state.recommendations}
            latestDocument={latestDocument}
          />
        </div>
        <div className="lux-card workbench-panel rounded-3xl p-6 md:col-span-5">
          <div className="mb-5 flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">最近上传</h2>
          </div>
          <div className="space-y-3">
            {state.documents.length > 0 ? (
              state.documents.slice(0, 5).map((document) => (
                <button key={document.id} type="button" onClick={() => onNavigate("graph")} className="group micro-card hover-lift w-full p-4 text-left">
                  <div className="flex items-center justify-between gap-4">
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">{document.title}</span>
                    <span className="shrink-0 text-xs text-[var(--text-faint)]">{formatShanghaiDateTime(document.uploadedAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-6 text-[var(--text-faint)]">{document.canAnswer ? document.summary : document.parseMessage}</p>
                </button>
              ))
            ) : (
              <div className="empty-orbit rounded-2xl p-5 text-sm leading-7 text-[var(--text-faint)]">
                还没有上传资料。先导入一份项目文档，生成第一组知识节点。
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewCard({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="micro-card hover-lift p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
        <Icon className="h-4 w-4 text-[var(--accent)]" />
        {label}
      </div>
      <p className="mt-3 truncate text-sm font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-faint)]">{detail}</p>
    </div>
  );
}
