import {
  ADMIN_PUBLIC_WORKSPACE_ID,
  ADMIN_USER_ID,
  privateWorkspaceId,
  type AuthUserRecord,
  type UserRole,
  type Workspace,
  type WorkspaceAccess,
  type WorkspaceType,
  type ZhimaiUser,
} from "../types/workspace";
import { getLastWorkspaceId, getSessionToken } from "./backendDataService";

export const AUTH_STORAGE_KEY = "zhimai-ai-auth-v1";

const now = new Date().toISOString();

export const demoUsers: AuthUserRecord[] = [
  {
    id: ADMIN_USER_ID,
    username: "admin",
    email: "admin@zhimai.local",
    password: "123456",
    role: "admin",
    status: "active",
    createdAt: now,
    lastActiveAt: now,
    lastIp: "local-session",
    online: false,
    enabled: true,
    canManageWorkspace: true,
    canAccessAdminPanel: true,
    canEditAdminGraph: true,
    loginCount: 0,
    mustChangePassword: true,
    isDemo: true,
  },
  {
    id: "user_default",
    username: "user",
    email: "user@zhimai.local",
    password: "123456",
    role: "user",
    status: "active",
    createdAt: now,
    lastActiveAt: now,
    lastIp: "local-session",
    online: false,
    enabled: true,
    canManageWorkspace: false,
    canAccessAdminPanel: false,
    canEditAdminGraph: false,
    loginCount: 0,
    isDemo: true,
  },
];

export function createAdminWorkspace(): Workspace {
  return {
    id: ADMIN_PUBLIC_WORKSPACE_ID,
    name: "管理员共享星图",
    type: "admin_public",
    ownerId: ADMIN_USER_ID,
    visibility: "public",
    createdAt: now,
    updatedAt: now,
    lastPublishedAt: now,
    description: "由管理员维护的主知识星图，普通用户可查看、搜索和向 Copilot 提问。",
    version: 1,
    updateSummary: "初始化共享知识空间。",
  };
}

export function createUserWorkspace(user: Pick<ZhimaiUser, "id" | "username">): Workspace {
  const stamp = new Date().toISOString();
  return {
    id: privateWorkspaceId(user.id),
    name: `${user.username} 的个人星图`,
    type: "user_private",
    ownerId: user.id,
    visibility: "private",
    createdAt: stamp,
    updatedAt: stamp,
    description: "只属于当前用户的私人知识空间，可上传资料、生成节点并保存成果。",
    version: 1,
  };
}

export function toPublicUser(user: AuthUserRecord): ZhimaiUser {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

export function canReadWorkspace(user: ZhimaiUser | null, workspace: Workspace | null) {
  if (!user || !workspace) return false;
  if (user.role === "admin" && user.canAccessAdminPanel !== false && workspace.visibility === "public") return true;
  if (workspace.type === "admin_public") return true;
  if (workspace.type === "demo_public") return true;
  return workspace.ownerId === user.id;
}

export function canEditWorkspace(user: ZhimaiUser | null, workspace: Workspace | null) {
  if (!user || !workspace) return false;
  if (user.role === "admin" && user.canEditAdminGraph !== false && workspace.type === "admin_public") return true;
  return workspace.type === "user_private" && workspace.ownerId === user.id;
}

export function workspaceAccess(user: ZhimaiUser | null, workspace: Workspace | null): WorkspaceAccess | null {
  if (!workspace) return null;
  const canRead = canReadWorkspace(user, workspace);
  const canEdit = canEditWorkspace(user, workspace);
  return {
    workspaceId: workspace.id,
    canRead,
    canEdit,
    mode: canEdit ? "editable" : "readonly",
    reason: canEdit ? "当前空间可编辑" : workspace.type === "admin_public" ? "管理员共享星图为只读，可查看和提问" : "当前用户没有编辑权限",
  };
}

export function workspaceTypeLabel(type: WorkspaceType) {
  if (type === "admin_public") return "管理员共享";
  if (type === "user_private") return "个人私有";
  return "公开演示";
}

export function roleLabel(role: UserRole) {
  return role === "admin" ? "管理员" : "普通用户";
}

export function getStoredAuthSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken();
  const lastWorkspaceId = getLastWorkspaceId();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
      ...(lastWorkspaceId ? { "X-Zhimai-Workspace-Id": lastWorkspaceId } : {}),
    };
  }
  const snapshot = getStoredAuthSnapshot();
  const user = snapshot?.currentUser as ZhimaiUser | null | undefined;
  const workspace = snapshot?.currentWorkspace as Workspace | null | undefined;
  if (!user) return {};
  return {
    "X-Zhimai-User-Id": user.id,
    "X-Zhimai-User-Role": user.role,
    ...(workspace?.id ? { "X-Zhimai-Workspace-Id": workspace.id } : {}),
  };
}
