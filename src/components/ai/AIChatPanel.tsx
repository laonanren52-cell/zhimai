import { ArrowUp, BrainCircuit, CheckCircle2, Copy, Globe2, Library, Loader2, RefreshCw, Save, SearchCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { askWithSources } from "../../services/aiService";
import { useAiStatus } from "../../store/aiStatusStore";
import { useKnowledgeStore } from "../../store/knowledgeStore";
import type { AnswerMode, GeneratedOutput, QAResult, WebSourceReference } from "../../types/ai";
import type { SourceReference } from "../../types/graph";
import SourceCard from "./SourceCard";

const answerModes: Array<{ key: AnswerMode; label: string; detail: string; icon: LucideIcon }> = [
  { key: "library", label: "仅资料库", detail: "只使用已上传资料和星图片段", icon: Library },
  { key: "web", label: "联网增强", detail: "需要搜索 API，网页来源单独显示", icon: Globe2 },
  { key: "hybrid", label: "混合验证", detail: "先查本地，不足再联网", icon: SearchCheck },
];

const taskGroups = [
  { title: "总结", tasks: ["总结当前节点", "总结最近上传资料", "提炼核心观点"] },
  { title: "分析", tasks: ["分析关联资料", "找出知识薄弱点", "检查来源是否充分"] },
  { title: "生成", tasks: ["生成简历项目经历", "生成答辩稿", "生成 PPT 大纲", "生成面试问答"] },
];

function modeLabel(mode: AnswerMode) {
  if (mode === "library") return "仅资料库";
  if (mode === "web") return "联网增强";
  return "混合验证";
}

function questionFromContext(context: ReturnType<typeof useKnowledgeStore>["state"]["copilotContext"]) {
  if (!context?.nodeLabel) return "请基于当前资料和知识星图，总结我下一步最值得推进的任务，并引用来源。";
  const neighbors = context.neighborLabels?.length ? `相邻节点：${context.neighborLabels.slice(0, 6).join("、")}。` : "";
  if (context.intent === "summary") return `请总结知识星图节点「${context.nodeLabel}」，说明它的作用、来源片段和关联节点。${neighbors}`;
  if (context.intent === "generate") return `请基于知识星图节点「${context.nodeLabel}」生成一份可复用成果，并给出来源引用。${neighbors}`;
  if (context.intent === "analyze") return `请分析知识星图节点「${context.nodeLabel}」的关联资料、风险和缺失信息。${neighbors}`;
  if (context.intent === "web") return `请联网补充「${context.nodeLabel}」的相关信息，并和本地资料分开说明。${neighbors}`;
  return `请基于知识星图节点「${context.nodeLabel}」回答：这个节点目前最重要的结论是什么？${neighbors}`;
}

export default function AIChatPanel() {
  const { state, recordAsk, addOutput, canEditCurrentWorkspace } = useKnowledgeStore();
  const { status: aiStatus, refreshHealth, markAiSuccess, markAiFailure } = useAiStatus();
  const [answerMode, setAnswerMode] = useState<AnswerMode>(state.copilotContext?.answerMode ?? "hybrid");
  const [question, setQuestion] = useState(() => questionFromContext(state.copilotContext));
  const [result, setResult] = useState<QAResult | null>(null);
  const [visibleAnswer, setVisibleAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("等待任务");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveAs, setSaveAs] = useState<"output" | "concept" | "problem" | "tag">("output");
  const [activeTaskGroup, setActiveTaskGroup] = useState(taskGroups[0].title);
  const [sourceDetail, setSourceDetail] = useState<{ type: "local"; source: SourceReference } | { type: "web"; source: WebSourceReference } | null>(null);

  const answerableDocuments = state.documents.filter((document) => document.canAnswer);
  const chunkCount = answerableDocuments.reduce((sum, document) => sum + document.chunks.length, 0);
  const contextDocuments = state.copilotContext?.relatedDocumentIds?.length
    ? state.documents.filter((document) => state.copilotContext?.relatedDocumentIds?.includes(document.id))
    : answerableDocuments;
  const searchProviderLabel = formatSearchProvider(aiStatus.searchProvider);
  const webSearchStatusLabel = aiStatus.searchConfigured ? `联网搜索：${searchProviderLabel} 已配置` : "联网搜索：未配置";

  const confidenceLabel = useMemo(() => {
    if (!result) return "等待资料问题";
    if (result.confidence >= 0.8) return "可信度高";
    if (result.confidence >= 0.65) return "可信度中";
    return "资料不足";
  }, [result]);

  const followUps = useMemo(() => {
    const node = state.copilotContext?.nodeLabel;
    return node
      ? [`这份资料里哪些内容支撑「${node}」？`, `围绕「${node}」还能生成哪些成果？`, `「${node}」还缺哪些来源证据？`]
      : ["最近上传资料能生成哪些答辩问题？", "哪些内容可以写进简历项目经历？", "当前星图还缺哪些技术说明？"];
  }, [state.copilotContext?.nodeLabel]);

  async function submit(nextQuestion = question, mode = answerMode) {
    setError(null);
    setLoading(true);
    setStatus("正在检索本地来源片段");
    setVisibleAnswer("");
    setSaved(false);
    setCopied(false);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      setStatus(mode === "library" ? "正在基于资料库生成回答" : "正在向后端提交联网增强请求");
      const response = await askWithSources(nextQuestion, state.documents, { mode, context: state.copilotContext });
      markAiSuccess("ask");
      setResult(response);
      recordAsk(nextQuestion);
    } catch (err) {
      markAiFailure("ask", err);
      setError(err instanceof Error ? err.message : "AI 回答失败，请稍后重试。");
      setStatus("请求失败");
    } finally {
      setLoading(false);
      setStatus((current) => (current === "请求失败" ? current : "回答完成"));
    }
  }

  async function saveAnswerAsNode() {
    if (!result?.answer) return;
    const output: GeneratedOutput = {
      id: `copilot-output-${Date.now()}`,
      type: "summary",
      title: state.copilotContext?.nodeLabel ? `${state.copilotContext.nodeLabel} · Copilot 结论` : "Copilot 问答沉淀",
      body: result.answer,
      sources: result.sources,
      createdAt: new Date().toISOString(),
    };
    addOutput(output, state.copilotContext?.nodeId, saveAs);
    setSaved(true);
  }

  useEffect(() => {
    if (!result?.answer) return;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleAnswer(result.answer.slice(0, index));
      if (index >= result.answer.length) window.clearInterval(timer);
    }, 12);
    return () => window.clearInterval(timer);
  }, [result]);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const next = questionFromContext(state.copilotContext);
    const nextMode = state.copilotContext?.answerMode ?? (state.copilotContext?.intent === "web" ? "web" : "hybrid");
    setQuestion(next);
    setAnswerMode(nextMode);
    setResult(null);
    setVisibleAnswer("");
    setStatus("等待发送");
  }, [state.copilotContext?.nodeId, state.copilotContext?.intent]);

  return (
    <div className="copilot-workbench-grid grid items-stretch gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
      <aside className="lux-card workbench-panel thin-scrollbar overflow-y-auto rounded-3xl p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="icon-tile">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">任务控制台</h2>
            <p className="text-xs text-[var(--text-faint)]">总结、分析、生成</p>
          </div>
        </div>

        <div className="micro-card mb-5 p-4">
          <p className="text-xs text-[var(--text-faint)]">当前资料状态</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <span className="rounded-xl bg-[var(--surface-deep)] px-3 py-2 text-[var(--text-secondary)]">{state.documents.length} 份资料</span>
            <span className="rounded-xl bg-[var(--surface-deep)] px-3 py-2 text-[var(--text-secondary)]">{chunkCount} 个片段</span>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {taskGroups.map((group) => (
            <button
              key={group.title}
              type="button"
              onClick={() => setActiveTaskGroup(group.title)}
              className={`liquid-action rounded-2xl border px-3 py-2 text-sm transition ${activeTaskGroup === group.title ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {group.title}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {taskGroups
            .find((group) => group.title === activeTaskGroup)
            ?.tasks.map((task) => (
              <button
                key={task}
                type="button"
                onClick={() => {
                  const context = state.copilotContext?.nodeLabel ? `，当前节点是「${state.copilotContext.nodeLabel}」` : "";
                  const next = `${task}${context}，请引用资料来源并给出可信度。`;
                  setQuestion(next);
                  setResult(null);
                  setVisibleAnswer("");
                  setStatus("等待发送");
                }}
                className="micro-card task-card hover-lift w-full px-4 py-3 text-left text-sm text-[var(--text-secondary)]"
              >
                {task}
              </button>
            ))}
          <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-xs leading-5 text-[var(--text-faint)]">
            预设任务只填充问题，不会自动请求。你也可以在输入框自定义提问。
          </p>
        </div>
      </aside>

      <section className="lux-card workbench-panel flex min-h-0 flex-col rounded-3xl p-5 md:p-7">
        <div className="border-b border-[var(--border-subtle)] pb-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)]">
                <BrainCircuit className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">知源 Copilot</h2>
                <p className="text-sm text-[var(--text-faint)]">
                  {state.copilotContext?.nodeLabel ? `当前节点：${state.copilotContext.nodeLabel}` : `${answerableDocuments.length} 份可问答资料`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--accent)]">
                {confidenceLabel}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-3">
            {answerModes.map((mode) => {
              const Icon = mode.icon;
              const active = answerMode === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setAnswerMode(mode.key)}
                  className={`micro-card liquid-action hover-lift p-3 text-left ${active ? "border-[var(--accent-border)] bg-[var(--selected-bg)] shadow-[0_0_28px_var(--glow-accent)]" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                    {mode.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-faint)]">{mode.detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto py-7">
          <div className="question-card micro-card rounded-3xl p-5">
            <p className="text-sm text-[var(--text-muted)]">你的问题</p>
            <p className="mt-3 text-lg leading-8 text-[var(--text-primary)]">{question}</p>
          </div>

          <div className="answer-card mt-6 rounded-3xl border border-[var(--accent-border)] bg-[var(--selected-bg)] p-5 shadow-[0_0_46px_var(--glow-accent)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--accent)]">
                知源 Copilot · {modeLabel(result?.mode ?? answerMode)} · {sourceStatusLabel(result?.sourceStatus)}
              </p>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--text-muted)]">{status}</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                {status}
              </div>
            ) : (
              <p className="min-h-[120px] whitespace-pre-wrap text-base leading-8 text-[var(--text-primary)]">{visibleAnswer || "等待问题输入。"}</p>
            )}
            {result?.warnings?.length ? (
              <div className="mt-4 space-y-2">
                {result.warnings.map((warning) => (
                  <p key={warning} className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
            {result && !loading && (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(result.answer);
                    setCopied(true);
                  }}
                  className="btn-secondary"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "已复制" : "复制回答"}
                </button>
                {canEditCurrentWorkspace ? (
                  <>
                    <button type="button" onClick={saveAnswerAsNode} className="btn-secondary border-[var(--accent-border)] text-[var(--accent)]">
                      <Save className="h-4 w-4" />
                      {saved ? "已保存到星图" : "保存到星图"}
                    </button>
                    <select
                      value={saveAs}
                      onChange={(event) => setSaveAs(event.target.value as "output" | "concept" | "problem" | "tag")}
                      className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-3 py-2 text-sm text-[var(--text-secondary)] outline-none"
                      title="保存节点类型"
                    >
                      <option value="output">成果节点</option>
                      <option value="concept">总结节点</option>
                      <option value="problem">问题节点</option>
                      <option value="tag">标签节点</option>
                    </select>
                  </>
                ) : (
                  <span className="rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning)]">
                    只读共享星图不能保存到管理员空间
                  </span>
                )}
                <button type="button" onClick={() => void submit()} className="btn-secondary">
                  <RefreshCw className="h-4 w-4" />
                  重新回答
                </button>
              </div>
            )}
            {error && <p className="mt-4 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">{error}</p>}
          </div>

          <div className="micro-card answer-card mt-5 p-4">
            <p className="text-xs text-[var(--text-faint)]">追问建议</p>
            <div className="mt-3 grid gap-2">
              {followUps.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setQuestion(item);
                    setResult(null);
                    setVisibleAnswer("");
                    setStatus("等待发送");
                  }}
                  className="liquid-action rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <form
          className="mt-auto flex gap-3 border-t border-[var(--border-subtle)] pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="输入需要基于资料回答的问题"
            className="input-shell min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm placeholder:text-[var(--text-faint)]"
          />
          <button type="submit" className="btn-primary grid h-12 w-12 shrink-0 place-items-center rounded-2xl p-0" title="发送">
            <ArrowUp className="h-5 w-5" />
          </button>
        </form>
      </section>

      <aside className="lux-card workbench-panel thin-scrollbar overflow-y-auto rounded-3xl p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">来源引用</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-faint)]">本地资料和网页来源分开显示。没有真实片段时不会伪造引用。</p>

        <div className="mt-5 space-y-3">
          <section>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
              本地资料来源
            </div>
            <div className="space-y-3">
              {(result?.sources ?? []).length > 0 ? (
                result?.sources.map((source) => <SourceCard key={`${source.documentId}-${source.chunkId ?? source.snippet}`} source={source} onOpenSource={() => setSourceDetail({ type: "local", source })} />)
              ) : (
                <div className="empty-orbit rounded-3xl p-4 text-sm leading-7 text-[var(--text-faint)]">
                  {contextDocuments.length === 0 ? "当前文件只有文件名，尚未完成正文解析，无法进行可靠回答。" : "还没有生成回答或命中来源片段。"}
                </div>
              )}
            </div>
          </section>

          <section className="pt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <Globe2 className="h-4 w-4 text-[var(--accent)]" />
              网页来源
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-1 text-xs text-[var(--text-faint)]">{webSearchStatusLabel}</span>
            </div>
            <div className="space-y-3">
              {(result?.webSources ?? []).length > 0 ? (
                result?.webSources?.map((source) => <SourceCard key={`${source.url}-${source.retrievedAt}`} webSource={source} onOpenSource={() => setSourceDetail({ type: "web", source })} />)
              ) : (
                <div className="empty-orbit rounded-3xl p-4 text-sm leading-7 text-[var(--text-faint)]">
                  {webSourceEmptyMessage(answerMode, aiStatus.searchConfigured, aiStatus.connection)}
                </div>
              )}
            </div>
          </section>
        </div>
        {sourceDetail && (
          <div className="mt-5 rounded-3xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {sourceDetail.type === "local" ? sourceDetail.source.documentTitle : sourceDetail.source.title}
                </p>
                <p className="mt-1 text-xs text-[var(--text-faint)]">
                  {sourceDetail.type === "local" ? `片段 ${sourceDetail.source.chunkId ?? "未标记"} · 可信度 ${Math.round((sourceDetail.source.score ?? 0.24) * 100)}%` : `${sourceDetail.source.siteName} · 网页来源`}
                </p>
              </div>
              <button type="button" onClick={() => setSourceDetail(null)} className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--text-muted)]">
                关闭
              </button>
            </div>
            <p className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-3 text-xs leading-6 text-[var(--text-secondary)]">
              {sourceDetail.source.snippet}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function sourceStatusLabel(status?: QAResult["sourceStatus"]) {
  if (!status) return "等待回答";
  if (status === "api") return "真实 AI";
  if (status === "local_rule") return "本地规则";
  return "Mock 演示";
}

function formatSearchProvider(provider?: string) {
  if (!provider || provider === "none") return "搜索服务";
  if (provider.toLowerCase() === "tavily") return "Tavily";
  return provider;
}

function webSourceEmptyMessage(mode: AnswerMode, searchConfigured: boolean, connection: string) {
  if (mode === "library") return "仅资料库模式不会检索网页。";
  if (searchConfigured) return "联网搜索已配置，当前回答暂无网页来源。";
  if (connection === "checking") return "正在读取联网搜索配置。";
  return "联网搜索暂未配置，请在后端配置搜索 API。";
}
