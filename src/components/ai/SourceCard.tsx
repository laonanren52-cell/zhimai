import { ExternalLink, FileText, Link2 } from "lucide-react";
import type { WebSourceReference } from "../../types/ai";
import type { SourceReference } from "../../types/graph";
import { formatShanghaiDateTime } from "../../utils/time";

interface SourceCardProps {
  source?: SourceReference;
  webSource?: WebSourceReference;
  onOpenNode?: (nodeId: string) => void;
  onOpenSource?: () => void;
}

export default function SourceCard({ source, webSource, onOpenNode, onOpenSource }: SourceCardProps) {
  if (webSource) {
    return (
      <article className="micro-card source-card hover-lift rounded-3xl p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
            <ExternalLink className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <a href={webSource.url} target="_blank" rel="noreferrer" className="break-words text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">
              {webSource.title}
            </a>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              {webSource.siteName} · {formatShanghaiDateTime(webSource.retrievedAt)}
            </p>
            <p className="mt-2 text-xs leading-6 text-[var(--text-muted)]">{webSource.snippet}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {onOpenSource && (
                <button type="button" onClick={onOpenSource} className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[var(--accent)]">
                  查看片段
                </button>
              )}
              <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[var(--accent)]">
                相关度 {Math.round((webSource.relevance ?? 0.72) * 100)}%
              </span>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-1 text-[var(--text-muted)]">
                网页来源
              </span>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (!source) return null;
  const hasSnippet = Boolean(source.snippet?.trim()) && source.isParsed !== false;

  return (
    <article className="micro-card source-card hover-lift rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium text-[var(--text-primary)]">{source.documentTitle}</h3>
          <p className={`mt-2 text-xs leading-6 ${hasSnippet ? "text-[var(--text-muted)]" : "text-[var(--warning)]"}`}>
            {hasSnippet ? source.snippet : "当前文件尚未完成正文解析，因此无法提供片段依据。"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {onOpenSource && (
              <button type="button" onClick={onOpenSource} className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[var(--accent)]">
                查看片段
              </button>
            )}
            <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-1 text-[var(--accent)]">
              可信度 {Math.round((source.score ?? 0.24) * 100)}%
            </span>
            <span className={`rounded-full border px-2 py-1 ${hasSnippet ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"}`}>
              {hasSnippet ? "真实片段" : "正文不可用"}
            </span>
            {source.nodeLabel && (
              <button
                type="button"
                disabled={!source.nodeId || !onOpenNode}
                onClick={() => source.nodeId && onOpenNode?.(source.nodeId)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2 py-1 text-[var(--text-secondary)] disabled:cursor-default"
              >
                <Link2 className="h-3 w-3" />
                {source.nodeLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
