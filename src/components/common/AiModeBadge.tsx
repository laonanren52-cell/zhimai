import { Activity, AlertTriangle, Bot, Database, FileSearch, Globe2, ScanText } from "lucide-react";
import { useAiStatus } from "../../store/aiStatusStore";

interface AiModeBadgeProps {
  compact?: boolean;
}

const toneClass = {
  success: "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]",
  warning: "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]",
  neutral: "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-secondary)]",
};

export default function AiModeBadge({ compact = false }: AiModeBadgeProps) {
  const { status } = useAiStatus();
  const Icon = status.tone === "danger" || status.tone === "warning" ? AlertTriangle : Activity;
  const title = [
    `AI：${status.summary}`,
    `模型：${status.providerLabel}`,
    `本地资料：${status.usableDocuments}/${status.totalDocuments}`,
    `可用片段：${status.chunkCount}`,
    `联网搜索：${status.searchEnabled ? status.searchProvider : "未配置"}`,
    `OCR：${status.ocrEnabled ? "已开启" : "未配置"}`,
    status.lastError ? `最近错误：${status.lastError}` : null,
  ]
    .filter(Boolean)
    .join("；");

  return (
    <div
      className={`ai-mode-glass inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] shadow-glass-inset backdrop-blur-xl ${toneClass[status.tone]}`}
      title={title}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{compact ? status.providerLabel : status.summary}</span>
      {!compact && (
        <>
          <span className="mx-1 h-3 w-px shrink-0 bg-[var(--border-subtle)]" />
          <Database className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="shrink-0">{status.usableDocuments}/{status.totalDocuments}</span>
          <FileSearch className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="shrink-0">{status.chunkCount}</span>
          <Globe2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="shrink-0">{status.searchEnabled ? "搜索" : "搜索未配"}</span>
          <ScanText className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="shrink-0">{status.ocrEnabled ? "OCR" : "OCR未配"}</span>
          <Bot className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </>
      )}
    </div>
  );
}
