import { AlertTriangle, ArrowRight, BadgeCheck, Bot, FileStack, Network } from "lucide-react";
import type { ParsedDocument } from "../../types/document";
import type { AnalysisResult } from "../../types/graph";

interface AnalysisResultCardProps {
  result: AnalysisResult;
  file: File;
  parsed: ParsedDocument;
  onOpenGraph: () => void;
  onOpenAssistant: () => void;
}

export default function AnalysisResultCard({ result, file, parsed, onOpenGraph, onOpenAssistant }: AnalysisResultCardProps) {
  const parsing = result.parsing ?? parsed.diagnostics;
  const canAnswer = parsing?.canAnswer ?? result.sources.some((source) => source.isParsed);
  const knowledgeNodeCount = result.entities.length;
  const fileNodeCount = 1;
  const fileEntityEdgeCount = knowledgeNodeCount > 0 ? Math.min(knowledgeNodeCount, 18) : 0;
  const relationEdgeCount = result.relations.length;
  const newNodeCount = fileNodeCount + knowledgeNodeCount;
  const newEdgeCount = relationEdgeCount + fileEntityEdgeCount;
  const graphWriteState = knowledgeNodeCount > 0 ? "知识节点已生成" : "仅创建文件节点";
  const analysisState = knowledgeNodeCount > 0 ? "已完成" : canAnswer ? "待确认/未生成" : "已阻断";
  const fileType = parsed.kind.toUpperCase();

  return (
    <div className="lux-card rounded-3xl p-6 md:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
        <div>
          <div className={`flex items-center gap-3 ${canAnswer ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
            {canAnswer ? <BadgeCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            <span className="text-sm font-medium">{canAnswer ? "解析完成，可用于问答" : "已入库，但正文不可用于可靠问答"}</span>
          </div>
          <h2 className="mt-4 text-3xl font-semibold text-[var(--text-primary)]">{file.name}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-muted)]">{result.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onOpenGraph} className="btn-primary">
            <Network className="h-4 w-4" />
            查看知识星图
            <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onOpenAssistant} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50" disabled={!canAnswer}>
            <Bot className="h-4 w-4" />
            去问知源 Copilot
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-4 xl:grid-cols-6">
        {[
          ["文件类型", fileType],
          ["文件大小", formatSize(file.size)],
          ["正文提取", statusLabel(parsing?.status)],
          ["质量等级", qualityLabel(parsing?.qualityLevel)],
          ["正文长度", `${parsing?.extractedLength ?? 0}`],
          ["可用片段", `${parsing?.chunkCount ?? result.sources.length} 个`],
          ["可读性评分", `${parsing?.readabilityScore ?? 0}/100`],
          ["中文比例", formatPercent(parsing?.chineseRatio ?? 0)],
          ["异常字符", formatPercent(parsing?.abnormalCharRatio ?? 0)],
          ["换行异常", `${parsing?.newlineAnomalyScore ?? 0}/100`],
          ["疑似扫描", parsing?.needsOcr ? "是" : "否"],
          ["OCR 可用", parsing?.ocrAvailable ? "已配置" : "未配置"],
          ["AI 分析", analysisState],
          ["写入星图", graphWriteState],
          ["新增节点", `${newNodeCount}`],
          ["新增关系", `${newEdgeCount}`],
        ].map(([label, value]) => (
          <div key={label} className="micro-card hover-lift p-4">
            <p className="text-xs text-[var(--text-faint)]">{label}</p>
            <p className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{value}</p>
          </div>
        ))}
      </div>

      {parsing && (
        <div
          className={`mt-5 rounded-2xl border p-4 text-sm leading-7 ${
            parsing.canAnswer
              ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
              : "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"
          }`}
        >
          <p>{parsing.message}</p>
          <p className="mt-2 opacity-90">下一步建议：{parsing.nextSuggestion}</p>
          {!canAnswer && knowledgeNodeCount === 0 && (
            <p className="mt-2 opacity-90">图谱状态：已创建文件节点，但正文质量不足，暂未生成知识节点和关系。</p>
          )}
        </div>
      )}

      {parsing?.preview && (parsing.status === "mild_anomaly" || parsing.status === "moderate_anomaly") && (
        <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-muted)]">正文预览</p>
            <span className="status-pill text-xs">{parsing.status === "moderate_anomaly" ? "低可信度" : "轻微异常"}</span>
          </div>
          <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-4 text-sm leading-7 text-[var(--text-secondary)]">
            {parsing.preview}
          </pre>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-5 shadow-glass-inset">
          <p className="text-sm text-[var(--text-muted)]">关键词</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.keywords.length > 0 ? (
              result.keywords.map((keyword) => (
                <span key={keyword} className="status-pill px-3 py-1 text-sm">
                  {keyword}
                </span>
              ))
            ) : (
              <span className="text-sm text-[var(--text-faint)]">正文不可用，暂未抽取关键词。</span>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-deep)] p-5 shadow-glass-inset">
          <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <FileStack className="h-4 w-4 text-[var(--accent)]" />
            可生成成果
          </p>
          <div className="mt-4 grid gap-2">
            {result.outputs.length > 0 ? (
              result.outputs.map((output) => (
                <div key={output} className="micro-card px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {output}
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-faint)]">
                等正文解析成功后再生成成果。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status?: string) {
  if (status === "parsed") return "正文可用";
  if (status === "mild_anomaly") return "轻微异常";
  if (status === "moderate_anomaly") return "中度异常";
  if (status === "short_text") return "正文较短";
  if (status === "needs_ocr") return "疑似扫描件";
  if (status === "garbled") return "严重乱码";
  if (status === "metadata_only") return "仅元数据";
  if (status === "failed") return "解析失败";
  return "未知";
}

function qualityLabel(level?: string) {
  if (level === "usable") return "正文可用";
  if (level === "mild_anomaly") return "轻微异常";
  if (level === "moderate_anomaly") return "中度异常";
  if (level === "severe_garbled") return "严重乱码";
  if (level === "needs_ocr") return "需要 OCR";
  if (level === "failed") return "不可用";
  return "未知";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatSize(size: number) {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${size} B`;
}
