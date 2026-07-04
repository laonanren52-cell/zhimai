import { useRef, useState } from "react";
import AnalysisProgress from "../components/upload/AnalysisProgress";
import AnalysisResultCard from "../components/upload/AnalysisResultCard";
import UploadDropzone from "../components/upload/UploadDropzone";
import AiModeBadge from "../components/common/AiModeBadge";
import WorkspaceBadge from "../components/common/WorkspaceBadge";
import { analyzeDocument, analyzeDocumentMock, buildUnavailableAnalysis } from "../services/aiService";
import { parseUploadedFile, validateUpload } from "../services/documentService";
import { useAiStatus } from "../store/aiStatusStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import type { ParsedDocument } from "../types/document";
import type { AnalysisResult } from "../types/graph";

interface UploadProps {
  onOpenGraph: () => void;
  onOpenAssistant: () => void;
}

interface BatchState {
  total: number;
  current: number;
  completed: number;
  failed: number;
  currentName: string;
  errors: string[];
}

export default function Upload({ onOpenGraph, onOpenAssistant }: UploadProps) {
  const { ingestAnalysis, canEditCurrentWorkspace, currentWorkspace } = useKnowledgeStore();
  const { status: aiStatus, markAiSuccess, markAiFailure } = useAiStatus();
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [result, setResult] = useState<{ analysis: AnalysisResult; file: File; parsed: ParsedDocument } | null>(null);
  const [fallbackRequest, setFallbackRequest] = useState<{ file: File; parsed: ParsedDocument } | null>(null);
  const [pendingReview, setPendingReview] = useState<{ file: File; parsed: ParsedDocument } | null>(null);
  const [manualText, setManualText] = useState("");
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const uploadedNames = useRef<Set<string>>(new Set());

  async function handleFile(file: File) {
    setBatchState(null);
    await processFile(file);
  }

  async function handleFiles(files: File[]) {
    if (!canEditCurrentWorkspace) {
      setError("你当前只有查看权限，不能上传资料到管理员共享星图。");
      return;
    }
    const uniqueFiles = files.filter(Boolean);
    if (uniqueFiles.length === 0) {
      setError("没有检测到可导入的文件。");
      return;
    }
    if (uniqueFiles.length === 1) {
      await handleFile(uniqueFiles[0]);
      return;
    }

    let completed = 0;
    let failed = 0;
    const errors: string[] = [];
    setResult(null);
    setFallbackRequest(null);
    setPendingReview(null);
    setError(null);
    setBatchState({ total: uniqueFiles.length, current: 0, completed, failed, currentName: "准备批量导入", errors });

    for (let index = 0; index < uniqueFiles.length; index += 1) {
      const file = uniqueFiles[index];
      setBatchState({ total: uniqueFiles.length, current: index + 1, completed, failed, currentName: file.name, errors: [...errors] });
      const outcome = await processFile(file, true);
      if (outcome.ok) {
        completed += 1;
      } else {
        failed += 1;
        errors.push(`${file.name}：${outcome.message}`);
      }
      setBatchState({ total: uniqueFiles.length, current: index + 1, completed, failed, currentName: file.name, errors: [...errors] });
    }

    setCurrentStep(null);
    setBatchState({ total: uniqueFiles.length, current: uniqueFiles.length, completed, failed, currentName: "批量导入完成", errors });
    setError(failed > 0 ? `批量导入完成：成功 ${completed} 个，失败 ${failed} 个。` : null);
  }

  async function processFile(file: File, fromBatch = false): Promise<{ ok: boolean; message: string }> {
    const validation = validateUpload(file);
    if (!validation.ok) {
      const message = validation.message ?? "资料无法上传。";
      if (!fromBatch) setError(message);
      return { ok: false, message };
    }

    if (!fromBatch) {
      setError(uploadedNames.current.has(file.name) ? "检测到同名资料，将作为新版本继续分析。" : null);
      setResult(null);
      setFallbackRequest(null);
      setPendingReview(null);
    }
    setCurrentStep(0);

    try {
      const parsed = await parseUploadedFile(file);
      for (let step = 0; step < 6; step += 1) {
        setCurrentStep(step);
        await new Promise((resolve) => window.setTimeout(resolve, fromBatch ? 150 : 300));
      }

      if (parsed.diagnostics.requiresUserConfirmation) {
        setCurrentStep(null);
        if (fromBatch) {
          const unavailable = buildUnavailableAnalysis(file.name, parsed);
          ingestAndShowResult(file, parsed, unavailable);
          return { ok: false, message: "正文解析质量一般，需要单独查看预览后继续分析。" };
        }
        setPendingReview({ file, parsed });
        setError(null);
        return { ok: true, message: "正文解析质量一般，等待用户确认继续分析。" };
      }

      if (!parsed.diagnostics.canAnswer) {
        const unavailable = buildUnavailableAnalysis(file.name, parsed);
        ingestAndShowResult(file, parsed, unavailable);
        return { ok: true, message: "已入库，正文暂不可用于可靠问答。" };
      }

      const analysis = await analyzeDocument(parsed.text, file.name, parsed);
      markAiSuccess("analyze");
      ingestAndShowResult(file, parsed, { ...analysis, parsing: parsed.diagnostics });
      return { ok: true, message: "导入成功。" };
    } catch (err) {
      markAiFailure("analyze", err);
      setCurrentStep(null);
      try {
        const parsed = await parseUploadedFile(file);
        if (parsed.diagnostics.canAnswer) setFallbackRequest({ file, parsed });
        if (parsed.diagnostics.requiresUserConfirmation) setPendingReview({ file, parsed });
      } catch {
        setFallbackRequest(null);
      }
      const message = err instanceof Error ? err.message : "AI 分析失败，请重新上传或稍后再试。";
      if (!fromBatch) setError(message);
      return { ok: false, message };
    }
  }

  async function runMockFallback() {
    if (!fallbackRequest) return;
    setError(null);
    setPendingReview(null);
    setCurrentStep(0);
    try {
      for (let step = 0; step < 6; step += 1) {
        setCurrentStep(step);
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      }
      const analysis = await analyzeDocumentMock(fallbackRequest.parsed.text, fallbackRequest.file.name, fallbackRequest.parsed);
      markAiSuccess("mock-analyze");
      ingestAndShowResult(fallbackRequest.file, fallbackRequest.parsed, { ...analysis, parsing: fallbackRequest.parsed.diagnostics });
      setFallbackRequest(null);
    } catch (err) {
      markAiFailure("mock-analyze", err);
      setError(err instanceof Error ? err.message : "mock 演示分析失败。");
    } finally {
      setCurrentStep(null);
    }
  }

  async function continuePendingAnalysis() {
    if (!pendingReview) return;
    const file = pendingReview.file;
    setError(null);
    setFallbackRequest(null);
    setCurrentStep(0);
    try {
      const parsed = await parseUploadedFile(file, { forceAnalyze: true });
      for (let step = 0; step < 6; step += 1) {
        setCurrentStep(step);
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
      const analysis = await analyzeDocument(parsed.text, file.name, parsed);
      markAiSuccess("continue-analyze");
      ingestAndShowResult(file, parsed, { ...analysis, parsing: parsed.diagnostics });
    } catch (err) {
      markAiFailure("continue-analyze", err);
      setCurrentStep(null);
      try {
        const parsed = await parseUploadedFile(file, { forceAnalyze: true });
        if (parsed.diagnostics.canAnswer) setFallbackRequest({ file, parsed });
      } catch {
        setFallbackRequest(null);
      }
      setError(err instanceof Error ? err.message : "继续分析失败，请检查 AI 接口配置后重试。");
    }
  }

  async function handleManualImport() {
    const content = manualText.trim();
    if (content.length < 40) {
      setError("手动导入的正文太短，至少需要 40 个有效字符。");
      return;
    }
    const file = new File([content], `手动导入正文-${new Date().toISOString().slice(0, 10)}.md`, { type: "text/markdown" });
    await handleFile(file);
    setManualText("");
  }

  function ingestAndShowResult(file: File, parsed: ParsedDocument, analysis: AnalysisResult) {
    ingestAnalysis(file, parsed.text, analysis, parsed);
    uploadedNames.current.add(file.name);
    setFallbackRequest(null);
    setPendingReview(null);
    setCurrentStep(null);
    setError(null);
    setResult({
      file,
      parsed,
      analysis: {
        ...analysis,
        title: file.name.includes(".") ? `${file.name} · ${analysis.title}` : analysis.title,
        parsing: parsed.diagnostics,
      },
    });
  }

  return (
    <div className="page-shell fade-in">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="max-w-4xl">
          <p className="page-kicker">
            上传 · 解析 · 切片 · 写入星图
          </p>
          <h1 className="page-title-compact">知识导入</h1>
          <p className="page-subtitle">
            上传资料后，系统会解析正文、检测质量、切片保存来源，再抽取节点和关系写入知识星图。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-faint)]">
            <AiModeBadge compact />
            <span>文件解析、结构化分析和星图写入分段展示；局部失败不会被误报为整站不可用。</span>
          </div>
        </div>
        <button type="button" onClick={onOpenGraph} className="btn-secondary">
          查看知识星图
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <WorkspaceBadge />
        {!canEditCurrentWorkspace && (
          <span className="rounded-full border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-2 text-sm text-[var(--warning)]">
            只读共享星图不能上传资料。请切换到个人星图或管理员管理台。
          </span>
        )}
      </div>

      {!canEditCurrentWorkspace ? (
        <div className="lux-card rounded-3xl p-8">
          <p className="text-sm text-[var(--warning)]">当前空间：{currentWorkspace?.name}</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">你当前只有查看权限</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
            普通用户可以查看管理员共享星图、搜索节点和向 Copilot 提问，但不能上传资料、删除节点或清空管理员内容。
          </p>
          <button type="button" onClick={onOpenGraph} className="btn-primary mt-6">
            返回知识星图
          </button>
        </div>
      ) : (
        <>
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <UploadDropzone onFilesSelected={(files) => void handleFiles(files)} error={error} disabled={currentStep !== null} />
        {currentStep !== null ? (
          <AnalysisProgress currentStep={currentStep} fileName={batchState?.currentName} batch={batchState ? { current: batchState.current, total: batchState.total, completed: batchState.completed, failed: batchState.failed } : undefined} />
        ) : pendingReview ? (
          <QualityReviewPanel
            file={pendingReview.file}
            parsed={pendingReview.parsed}
            onContinue={() => void continuePendingAnalysis()}
            onManualPaste={() => document.getElementById("manual-text-import")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            onReset={() => {
              setPendingReview(null);
              setError("请重新选择文件上传，或使用下方手动粘贴正文。");
            }}
          />
        ) : result ? (
          <AnalysisResultCard result={result.analysis} file={result.file} parsed={result.parsed} onOpenGraph={onOpenGraph} onOpenAssistant={onOpenAssistant} />
        ) : fallbackRequest ? (
          <div className="lux-card flex min-h-[420px] flex-col justify-center rounded-3xl p-8">
            <p className="text-sm text-[var(--warning)]">本次结构化分析未完成</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">文件正文已解析，但 AI 分析请求失败</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-muted)]">
              {aiStatus.connection === "connected"
                ? "AI 代理处于可连接状态，但本次分析请求没有返回可用的结构化结果。可以稍后重试，或使用 Mock 分析继续演示星图链路。"
                : "文件正文已经解析成功，但当前 AI 代理不可用或部分能力未配置。可以检查后端环境变量，或使用 Mock 分析继续演示星图链路。"}
            </p>
            {aiStatus.lastError && (
              <p className="mt-4 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
                最近一次错误：{aiStatus.lastError}
              </p>
            )}
            <button type="button" onClick={() => void runMockFallback()} className="mt-7 btn-secondary w-fit border-[var(--warning-border)] text-[var(--warning)]">
              使用 mock 演示继续
            </button>
          </div>
        ) : (
          <div className="lux-card flex min-h-[420px] flex-col justify-center rounded-3xl p-8">
            <p className="text-sm text-[var(--accent)]">等待资料</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">上传后会显示解析与 AI 分析过程</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--text-muted)]">
              结果会显示正文提取状态、正文长度、乱码检测、OCR 需求、写入星图状态和可用于问答的片段数量。
            </p>
          </div>
        )}
      </div>

      {batchState && currentStep === null && batchState.total > 1 && (
        <section className="lux-card mt-5 rounded-3xl p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-sm text-[var(--accent)]">批量导入结果</p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                成功 {batchState.completed} 个，失败 {batchState.failed} 个
              </h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">最后处理：{batchState.currentName}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="status-pill border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]">已写入 {batchState.completed}</span>
              <span className="status-pill border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]">失败 {batchState.failed}</span>
            </div>
          </div>
          {batchState.errors.length > 0 && (
            <div className="mt-4 grid gap-2">
              {batchState.errors.slice(0, 6).map((item) => (
                <p key={item} className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
                  {item}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <section id="manual-text-import" className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="lux-card rounded-3xl p-6">
          <p className="text-sm text-[var(--accent)]">手动复制正文导入</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">文件解析失败时，直接粘贴正文</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
            扫描版 PDF、编码异常 PDF 或暂不支持的格式，可以先把正文复制到这里，系统仍会完成切片、AI 分析和星图写入。
          </p>
        </div>
        <div className="lux-card rounded-3xl p-5">
          <textarea
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="粘贴文档正文、项目说明、课程笔记或会议记录..."
            className="input-shell min-h-[160px] w-full resize-y rounded-2xl px-4 py-3 text-sm leading-7 placeholder:text-[var(--text-faint)]"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-faint)]">{manualText.trim().length} 字符</span>
            <button type="button" onClick={() => void handleManualImport()} className="btn-secondary">
              手动导入并生成星图
            </button>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}

function QualityReviewPanel({
  file,
  parsed,
  onContinue,
  onManualPaste,
  onReset,
}: {
  file: File;
  parsed: ParsedDocument;
  onContinue: () => void;
  onManualPaste: () => void;
  onReset: () => void;
}) {
  const diagnostics = parsed.diagnostics;
  const metrics = [
    ["正文长度", `${diagnostics.extractedLength}`],
    ["可读性评分", `${diagnostics.readabilityScore}/100`],
    ["中文比例", percent(diagnostics.chineseRatio)],
    ["异常字符比例", percent(diagnostics.abnormalCharRatio)],
    ["换行异常", `${diagnostics.newlineAnomalyScore}/100`],
    ["允许继续分析", diagnostics.allowContinue ? "是" : "否"],
  ];

  return (
    <div className="lux-card rounded-3xl p-6 md:p-8">
      <p className="text-sm text-[var(--warning)]">正文质量复核</p>
      <h2 className="mt-3 text-3xl font-semibold text-[var(--text-primary)]">{file.name}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-muted)]">{diagnostics.message}</p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="micro-card p-4">
            <p className="text-xs text-[var(--text-faint)]">{label}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm leading-7 text-[var(--warning)]">
        <p>推荐处理方式：先查看正文预览。如果整体可读，可以继续分析；系统会把来源片段标记为低可信度。</p>
        <p className="mt-1">当前不会根据文件名生成假摘要，也不会在未确认前抽取知识节点和关系。</p>
      </div>

      <div id="quality-preview" className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">正文预览</p>
          <span className="status-pill text-xs">前 {Math.min(1000, diagnostics.preview.length)} 字</span>
        </div>
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-4 text-sm leading-7 text-[var(--text-secondary)]">
          {diagnostics.preview || "没有可显示的正文预览。"}
        </pre>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => document.getElementById("quality-preview")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="btn-secondary">
          查看正文预览
        </button>
        <button type="button" onClick={onContinue} className="btn-primary">
          继续分析
        </button>
        <button type="button" onClick={onReset} className="btn-secondary">
          重新上传
        </button>
        <button type="button" onClick={onManualPaste} className="btn-secondary">
          手动粘贴正文
        </button>
        <button type="button" className="btn-secondary cursor-not-allowed opacity-45" disabled>
          尝试 OCR（未配置）
        </button>
      </div>
    </div>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
