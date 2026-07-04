export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";
export type WorkspaceType = "admin_public" | "user_private" | "demo_public";
export type WorkspaceVisibility = "public" | "private";

export const ADMIN_USER_ID = "admin_default";
export const ADMIN_PUBLIC_WORKSPACE_ID = "admin_public_default";

export interface ZhimaiUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  lastActiveAt?: string;
  lastIp?: string;
  online?: boolean;
  isOnline?: boolean;
  enabled?: boolean;
  canManageWorkspace?: boolean;
  canAccessAdminPanel?: boolean;
  canEditAdminGraph?: boolean;
  loginCount?: number;
  mustChangePassword?: boolean;
  isDemo?: boolean;
}

export interface AuthUserRecord extends ZhimaiUser {
  password?: string;
}

export interface SystemMetrics {
  todayVisits: number;
  totalVisits: number;
  loginCount: number;
  uniqueVisitors: number;
  sharedGraphVisits: number;
  copilotUses: number;
  uploadCount: number;
}

export interface SystemAuditLog {
  id: string;
  type: "login" | "logout" | "register" | "workspace" | "upload" | "ask" | "generate" | "delete" | "clear" | "settings";
  actorId?: string;
  actorName?: string;
  detail: string;
  createdAt: string;
  ip?: string;
}

export interface SystemSettings {
  siteName: string;
  allowRegistration: boolean;
  storageMode: "local" | "api";
  version: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  ownerId: string;
  visibility: WorkspaceVisibility;
  createdAt: string;
  updatedAt: string;
  lastPublishedAt?: string;
  description: string;
  version: number;
  updateSummary?: string;
}

export interface WorkspaceAccess {
  workspaceId: string;
  canRead: boolean;
  canEdit: boolean;
  mode: "editable" | "readonly";
  reason: string;
}

export function privateWorkspaceId(userId: string) {
  return `user_private_${userId}`;
}
