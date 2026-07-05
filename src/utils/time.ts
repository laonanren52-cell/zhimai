const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatShanghaiDateTime(value?: string | number | Date | null) {
  if (!value) return "暂无记录";

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value} 00:00`;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";

  const parts = Object.fromEntries(shanghaiDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
