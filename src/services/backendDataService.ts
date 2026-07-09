import type { GeneratedOutput } from "../types/ai";
import type { KnowledgeDocument } from "../types/document";
import type { GraphData } from "../types/graph";
import type { SystemAuditLog, SystemMetrics, SystemSettings, UserPreferences, Workspace, ZhimaiUser } from "../types/workspace";
import type { RecentActivity } from "../store/knowledgeStore";
import { apiClient, ApiClientError } from "./apiClient";

export const SESSION_TOKEN_KEY = "zhimai-ai-session-token";
export const LAST_WORKSPACE_KEY = "zhimai-ai-last-workspace";

export interface WorkspaceDataset {
  documents: KnowledgeDocument[];
  graph: GraphData;
  outputs: GeneratedOutput[];
  recentActivities: RecentActivity[];
  revision?: number;
}

export interface AuthSnapshot {
  token?: string;
  user: ZhimaiUser;
  users?: ZhimaiUser[];
  workspaces: Workspace[];
  currentWorkspaceId?: string | null;
  metrics?: SystemMetrics;
  auditLogs?: SystemAuditLog[];
  settings?: SystemSettings;
}

export interface AdminOverview {
  users: ZhimaiUser[];
  loginLogs: SystemAuditLog[];
  activityLogs: SystemAuditLog[];
  metrics: SystemMetrics;
  settings: SystemSettings;
}

export interface SystemConfigSummary {
  ai: {
    provider: string;
    providerId?: string;
    model: string;
    enabled: boolean;
    allowMock: boolean;
    configured: boolean;
    apiKeyConfigured: boolean;
    apiKeyMasked?: string;
    customProviders?: CustomAiProviderSummary[];
    updatedAt?: string;
  };
  search: {
    enabled: boolean;
    provider: string;
    configured: boolean;
    apiKeyConfigured: boolean;
    apiKeyMasked?: string;
    updatedAt?: string;
  };
  ocr: {
    enabled: boolean;
    provider: string;
    configured: boolean;
    apiKeyConfigured: boolean;
    apiKeyMasked?: string;
    updatedAt?: string;
  };
  updatedAt?: string;
}

export interface CustomAiProviderSummary {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  interfaceType: "openai-compatible" | "deepseek-compatible" | "custom-http";
  enabled: boolean;
  isDefault: boolean;
  note?: string;
  apiKeyConfigured: boolean;
  apiKeyMasked?: string;
  lastTestedAt?: string;
  lastTestOk?: boolean;
  lastTestMessage?: string;
  updatedAt?: string;
}

export interface CustomAiProviderPatch {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  interfaceType: "openai-compatible" | "deepseek-compatible" | "custom-http";
  enabled: boolean;
  isDefault: boolean;
  note?: string;
  apiKey?: string;
}

export interface SystemConfigPatch {
  ai?: {
    provider?: string;
    model?: string;
    enabled?: boolean;
    allowMock?: boolean;
    apiKey?: string;
    customProviders?: CustomAiProviderPatch[];
  };
  search?: {
    enabled?: boolean;
    provider?: string;
    apiKey?: string;
  };
  ocr?: {
    enabled?: boolean;
    provider?: string;
    apiKey?: string;
  };
}

export function getSessionToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SESSION_TOKEN_KEY) ?? "";
}

export function setSessionToken(token?: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  else window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function getLastWorkspaceId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_WORKSPACE_KEY);
}

export function setLastWorkspaceId(workspaceId?: string | null) {
  if (typeof window === "undefined") return;
  if (workspaceId) window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
  else window.localStorage.removeItem(LAST_WORKSPACE_KEY);
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return apiClient<T>(path, options);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new Error(error instanceof Error ? error.message : "后端数据服务请求失败。");
  }
}

export async function loginRemote(username: string, password: string) {
  const snapshot = await apiRequest<AuthSnapshot>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setSessionToken(snapshot.token);
  return snapshot;
}

export async function registerRemote(username: string, email: string, password: string) {
  const snapshot = await apiRequest<AuthSnapshot>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
  setSessionToken(snapshot.token);
  return snapshot;
}

export async function logoutRemote() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
  } finally {
    setSessionToken(null);
  }
}

export async function getCurrentRemoteUser() {
  if (!getSessionToken()) return null;
  return apiRequest<AuthSnapshot>("/api/auth/me");
}

export async function getRemoteWorkspaces() {
  return apiRequest<{ workspaces: Workspace[] }>("/api/workspaces");
}

export async function getWorkspaceDataset(workspaceId: string) {
  return apiRequest<WorkspaceDataset>(`/api/workspaces/${encodeURIComponent(workspaceId)}/data`);
}

export async function saveWorkspaceDataset(workspaceId: string, data: WorkspaceDataset) {
  return apiRequest<WorkspaceDataset>(`/api/workspaces/${encodeURIComponent(workspaceId)}/data`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function recordRemoteActivity(activity: {
  workspaceId?: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
}) {
  return apiRequest("/api/activity", {
    method: "POST",
    body: JSON.stringify(activity),
  });
}

export async function getAdminOverview() {
  return apiRequest<AdminOverview>("/api/admin/overview");
}

export async function getAdminConfig() {
  return apiRequest<{ config: SystemConfigSummary }>("/api/admin/config");
}

export async function updateAdminConfig(config: SystemConfigPatch) {
  return apiRequest<{ config: SystemConfigSummary }>("/api/admin/config", {
    method: "PATCH",
    body: JSON.stringify({ config }),
  });
}

export async function testAdminCustomProvider(provider: CustomAiProviderPatch) {
  return apiRequest<{ result: { ok: boolean; message: string; testedAt: string }; config: SystemConfigSummary }>("/api/admin/config/test-provider", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export async function getUserPreferences() {
  return apiRequest<{ preferences: UserPreferences }>("/api/user/preferences");
}

export async function updateUserPreferences(preferences: Partial<UserPreferences>) {
  return apiRequest<{ preferences: UserPreferences }>("/api/user/preferences", {
    method: "PATCH",
    body: JSON.stringify({ preferences }),
  });
}

export async function updateRemoteUser(userId: string, action: "enable" | "disable" | "delete" | "password", payload: Record<string, unknown> = {}) {
  return apiRequest<AuthSnapshot>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({ userId, action, ...payload }),
  });
}

export async function updateRemoteProfile(payload: { username: string; email: string; password?: string }) {
  return apiRequest<AuthSnapshot>("/api/auth/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function migrateLocalData(workspaceId: string, data: WorkspaceDataset) {
  return apiRequest<WorkspaceDataset>("/api/migrate-local-data", {
    method: "POST",
    body: JSON.stringify({ workspaceId, data }),
  });
}
