import { Copy, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { generateOutput } from "../../services/aiService";
import { useAiStatus } from "../../store/aiStatusStore";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import type { GeneratedOutput, GeneratedOutputType } from "../../types/ai";
import WorkspaceBadge from "../common/WorkspaceBadge";
import SourceCard from "./SourceCard";

const outputTypes: Array<{ key: GeneratedOutputType; label: string; hint: string }> = [
  { key: "resume", label: "简历项目经历", hint: "适合求职材料" },
  { key: "defense", label: "项目答辩稿", hint: "适合比赛答辩" },
  { key: "ppt", label: "PPT 大纲", hint: "适合路演展示" },
  { key: "interview", label: "面试问答", hint: "适合技术面试" },
  { key: "review", label: "复习计划", hint: "适合课程复盘" },
  { key: "summary", label: "项目总结", hint: "适合归档沉淀" },
];

export default function OutputGenerator() {
  const { state, addOutput, canEditCurrentWorkspace } = useKnowledgeStore();
  const { markAiSuccess, markAiFailure } = useAiStatus();
  const [selectedType, setSelectedType] = useState<GeneratedOutputType>("resume");
  const [output, setOutput] = useState<GeneratedOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(type = selectedType) {
    setLoading(true);
    setError(null);
    setSaved(false);
    setCopied(false);
    try {
      const hasUsableSources = state.documents.some((document) => document.canAnswer && document.chunks.length > 0);
      if (!hasUsableSources) {
        setOutput(null);
        setError("当前没有可用来源片段。请先上传可解析正文的资料，再生成成果。");
        return;
      }
      const next = await generateOutput(type, {
        documents: state.documents.slice(0, 4),
        nodeCount: state.graph.nodes.length,
        edgeCount: state.graph.edges.length,
        copilotContext: state.copilotContext,
      });
      markAiSuccess("generate-output");
      setOutput(next);
      if (!next.body?.trim()) setError("AI 已返回结果，但正文为空，请重新生成。");
    } catch (err) {
      markAiFailure("generate-output", err);
      setError(err instanceof Error ? err.message : "成果生成失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void run(selectedType);
  }, []);

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="lux-card rounded-3xl p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="icon-tile">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">成果类型</h2>
            <p className="text-xs text-[var(--text-faint)]">基于星图和来源证据生成</p>
          </div>
        </div>
        <div className="space-y-2">
          {outputTypes.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setSelectedType(item.key);
                void run(item.key);
              }}
              className={`micro-card hover-lift w-full p-4 text-left ${selectedType === item.key ? "border-[var(--accent-border)] bg-[var(--selected-bg)] shadow-[0_0_28px_var(--glow-accent)]" : ""}`}
            >
              <span className="block text-sm font-medium text-[var(--text-primary)]">{item.label}</span>
              <span className="mt-1 block text-xs text-[var(--text-faint)]">{item.hint}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="lux-card rounded-3xl p-5 md:p-7">
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-[var(--border-subtle)] pb-5 md:flex-row md:items-center">
          <div>
            <p className="text-sm text-[var(--accent)]">生成结果</p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{output?.title ?? "正在准备"}</h2>
            <p className="mt-2 text-xs text-[var(--text-faint)]">来源状态：{output ? sourceStatusLabel(output.sourceStatus) : "等待生成"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <WorkspaceBadge compact />
            <button
              type="button"
              onClick={async () => {
                if (!output?.body) return;
                await navigator.clipboard?.writeText(output.body);
                setCopied(true);
              }}
              className="btn-secondary"
            >
              <Copy className="h-4 w-4" />
              {copied ? "已复制" : "复制"}
            </button>
            {canEditCurrentWorkspace ? (
              <button
                type="button"
                onClick={() => {
                  if (!output) return;
                  addOutput(output, state.copilotContext?.nodeId);
                  setSaved(true);
                }}
                className="btn-secondary"
              >
                <Save className="h-4 w-4" />
                {saved ? "已保存" : "保存到星图"}
              </button>
            ) : (
              <span className="rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning)]">
                只读空间不可保存
              </span>
            )}
            <button type="button" onClick={() => void run()} className="btn-primary">
              <RefreshCw className="h-4 w-4" />
              重新生成
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center gap-3 text-[var(--text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
            正在从知识星图和来源片段生成内容
          </div>
        ) : error ? (
          <div className="flex min-h-[360px] flex-col justify-center rounded-3xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-6">
            <p className="text-sm text-[var(--warning)]">{error}</p>
            <button type="button" onClick={() => void run()} className="mt-5 btn-primary w-fit">
              <RefreshCw className="h-4 w-4" />
              重新生成
            </button>
          </div>
        ) : !output ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-6 text-sm text-[var(--text-muted)]">
            请选择一种成果类型开始生成。
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <article className="min-h-[430px] rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-6 shadow-glass-inset">
              <p className="whitespace-pre-wrap text-base leading-8 text-[var(--text-primary)]">{output.body}</p>
            </article>
            <aside className="space-y-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">来源依据</p>
              {(output.sources ?? []).length > 0 ? (
                output.sources.map((source) => <SourceCard key={`${output.id}-${source.documentId}-${source.chunkId ?? source.snippet}`} source={source} />)
              ) : (
                <div className="empty-orbit rounded-3xl p-4 text-sm leading-7 text-[var(--text-faint)]">
                  当前没有可用来源片段。请先上传可解析正文的资料。
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

function sourceStatusLabel(status?: GeneratedOutput["sourceStatus"]) {
  if (status === "api") return "真实 AI";
  if (status === "local_rule") return "本地规则";
  if (status === "mock") return "Mock 演示";
  return "未标记";
}
