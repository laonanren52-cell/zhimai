import { getLastWorkspaceId, getSessionToken } from "./backendDataService";

export type ApiClientErrorCode = "network" | "localhost" | "not_found" | "cors" | "server" | "unknown";

export class ApiClientError extends Error {
  readonly code: ApiClientErrorCode;
  readonly status?: number;
  constructor(message: string, code: ApiClientErrorCode = "unknown", status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:3001";
  return "";
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLocalApiBaseUrl(value: string) {
  if (!value) return false;
  try {
    return isLocalhost(new URL(value).hostname);
  } catch {
    return /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value);
  }
}

function isLikelyCorsFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cors|cross-origin|access-control|preflight/i.test(message);
}

function classifyError(response: Response): ApiClientError {
  if (response.status === 404) return new ApiClientError("后端接口不存在，请检查后端是否部署了对应的 /api 路由。", "not_found", 404);
  if (response.status === 403) return new ApiClientError("请求被拒绝，可能是跨域配置错误或当前账号无权限。请检查后端 CORS 和鉴权配置。", "cors", 403);
  if (response.status === 0 || response.type === "opaque") return new ApiClientError("跨域请求被拦截，请检查后端 CORS 配置。", "cors", response.status);
  if (response.status >= 500) return new ApiClientError("服务器内部错误，请查看后端日志。", "server", response.status);
  return new ApiClientError(`后端数据服务请求失败：${response.status}`, "unknown", response.status);
}

function buildLocalhostMessage(apiBaseUrl: string) {
  const suffix = apiBaseUrl ? `当前 API 地址：${apiBaseUrl}` : "当前 API 地址为空，将使用同域 /api。";
  if (typeof window === "undefined") return `生产环境 API 地址仍指向 localhost，请配置 VITE_API_BASE_URL 或使用 /api 反向代理。${suffix}`;
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `当前页面运行在本地开发环境，可以使用本地后端；生产环境请勿配置 localhost。${suffix}`;
  }
  return `生产环境 API 地址错误：不能指向 localhost 或 127.0.0.1。请在 EdgeOne Pages 配置 VITE_API_BASE_URL 为后端公网地址，或配置同域 /api 反向代理。${suffix}`;
}

function buildNetworkMessage(apiBaseUrl: string, path: string, error: unknown) {
  if (isLocalApiBaseUrl(apiBaseUrl) && !import.meta.env.DEV) return buildLocalhostMessage(apiBaseUrl);
  if (isLikelyCorsFailure(error)) return "跨域配置错误：浏览器拦截了 API 请求，请检查后端 CORS 响应头和预检请求。";
  const target = `${apiBaseUrl}${path}`;
  if (path !== "/api/health") {
    return `后端服务不可用：无法请求 ${target}。请先确认 /api/health 可访问，再重试登录。`;
  }
  return `后端服务不可用：/api/health 无法访问。请确认后端已单独部署并正在运行。`;
}

export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  const token = getSessionToken();
  const lastWorkspaceId = getLastWorkspaceId();
  if (isLocalApiBaseUrl(apiBaseUrl) && !import.meta.env.DEV) {
    throw new ApiClientError(buildLocalhostMessage(apiBaseUrl), "localhost");
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(lastWorkspaceId ? { "X-Zhimai-Workspace-Id": lastWorkspaceId } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiClientError(buildNetworkMessage(apiBaseUrl, path, error), isLikelyCorsFailure(error) ? "cors" : "network");
  }

  const text = await response.text();
  let payload: unknown = {};
  try {
    payload = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    payload = { error: text || "后端返回了无法解析的响应。" };
  }

  if (!response.ok) {
    const error = classifyError(response);
    if (typeof payload === "object" && payload && "error" in payload) {
      error.message = String((payload as { error: string }).error);
    }
    throw error;
  }

  return payload as T;
}
