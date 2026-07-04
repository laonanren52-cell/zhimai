import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import {
  AUTH_STORAGE_KEY,
  canEditWorkspace,
  canReadWorkspace,
  createAdminWorkspace,
  createUserWorkspace,
  demoUsers,
  toPublicUser,
  workspaceAccess,
} from "../services/authService";
import {
  getCurrentRemoteUser,
  getLastWorkspaceId,
  loginRemote,
  logoutRemote,
  registerRemote,
  setLastWorkspaceId,
  updateRemoteProfile,
  updateRemoteUser,
  type AuthSnapshot,
} from "../services/backendDataService";
import {
  ADMIN_PUBLIC_WORKSPACE_ID,
  ADMIN_USER_ID,
  privateWorkspaceId,
  type AuthUserRecord,
  type SystemAuditLog,
  type SystemMetrics,
  type SystemSettings,
  type Workspace,
  type WorkspaceAccess,
  type ZhimaiUser,
} from "../types/workspace";

interface AuthState {
  users: AuthUserRecord[];
  workspaces: Workspace[];
  currentUser: ZhimaiUser | null;
  currentWorkspaceId: string | null;
  authError: string | null;
  metrics: SystemMetrics;
  auditLogs: SystemAuditLog[];
  settings: SystemSettings;
}

type AuthAction =
  | { type: "login"; username: string; password: string }
  | { type: "register"; username: string; email: string; password: string }
  | { type: "hydrate"; snapshot: AuthSnapshot }
  | { type: "setError"; error: string }
  | { type: "logout" }
  | { type: "selectWorkspace"; workspaceId: string }
  | { type: "clearWorkspace" }
  | { type: "publishWorkspace"; workspaceId: string; summary: string }
  | { type: "clearError" }
  | { type: "setUserEnabled"; userId: string; enabled: boolean }
  | { type: "deleteUser"; userId: string }
  | { type: "changePassword"; userId: string; password: string; actorId?: string }
  | { type: "updateProfile"; userId: string; username: string; email: string };

interface AuthContextValue {
  users: ZhimaiUser[];
  workspaces: Workspace[];
  currentUser: ZhimaiUser | null;
  currentWorkspace: Workspace | null;
  currentAccess: WorkspaceAccess | null;
  authError: string | null;
  metrics: SystemMetrics;
  auditLogs: SystemAuditLog[];
  settings: SystemSettings;
  login: (username: string, password: string) => void;
  register: (username: string, email: string, password: string) => void;
  logout: () => void;
  selectWorkspace: (workspaceId: string) => void;
  clearWorkspaceSelection: () => void;
  publishWorkspace: (summary: string) => void;
  clearError: () => void;
  setUserEnabled: (userId: string, enabled: boolean) => void;
  deleteUser: (userId: string) => void;
  changePassword: (userId: string, password: string) => void;
  updateProfile: (userId: string, username: string, email: string) => void;
  canRead: (workspace: Workspace) => boolean;
  canEdit: (workspace: Workspace) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function nowIso() {
  return new Date().toISOString();
}

function sessionIp() {
  return "local-session";
}

function defaultMetrics(): SystemMetrics {
  return {
    todayVisits: 0,
    totalVisits: 0,
    loginCount: 0,
    uniqueVisitors: 0,
    sharedGraphVisits: 0,
    copilotUses: 0,
    uploadCount: 0,
  };
}

function defaultSettings(): SystemSettings {
  return {
    siteName: "知脉 AI",
    allowRegistration: true,
    storageMode: "local",
    version: "0.1.0",
    updatedAt: nowIso(),
  };
}

function audit(state: AuthState, log: Omit<SystemAuditLog, "id" | "createdAt">) {
  return [
    {
      ...log,
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: nowIso(),
      ip: log.ip ?? sessionIp(),
    },
    ...state.auditLogs,
  ].slice(0, 120);
}

function normalizeUser(user: AuthUserRecord): AuthUserRecord {
  const seed = demoUsers.find((item) => item.id === user.id || item.username === user.username);
  const isAdminUsername = user.username?.trim().toLowerCase() === "admin" || user.id === ADMIN_USER_ID;
  const shouldMigrateOldAdminSeed =
    isAdminUsername &&
    Boolean(seed?.password) &&
    (!user.password || user.role !== "admin" || user.isDemo || user.mustChangePassword !== false);
  return {
    ...seed,
    ...user,
    password: shouldMigrateOldAdminSeed ? seed?.password : user.password ?? seed?.password,
    role: isAdminUsername ? "admin" : user.role ?? seed?.role ?? "user",
    status: isAdminUsername ? "active" : user.status ?? (user.enabled === false ? "disabled" : "active"),
    enabled: isAdminUsername ? true : user.enabled ?? true,
    canManageWorkspace: isAdminUsername ? true : user.canManageWorkspace ?? seed?.canManageWorkspace ?? false,
    canAccessAdminPanel: isAdminUsername ? true : user.canAccessAdminPanel ?? seed?.canAccessAdminPanel ?? false,
    canEditAdminGraph: isAdminUsername ? true : user.canEditAdminGraph ?? seed?.canEditAdminGraph ?? false,
    online: user.online ?? false,
    loginCount: user.loginCount ?? 0,
    lastActiveAt: user.lastActiveAt ?? user.createdAt,
    lastIp: user.lastIp ?? "local-session",
    mustChangePassword: isAdminUsername ? user.mustChangePassword ?? true : user.mustChangePassword ?? false,
  };
}

function ensureDefaultAdminUsers(users: AuthUserRecord[]) {
  const normalized = users.map(normalizeUser);
  const adminIndex = normalized.findIndex((user) => user.username.trim().toLowerCase() === "admin" || user.id === ADMIN_USER_ID);
  const adminSeed = normalizeUser(demoUsers.find((user) => user.username === "admin") ?? demoUsers[0]);

  if (adminIndex === -1) return [adminSeed, ...normalized];

  return normalized.map((user, index) => (index === adminIndex ? normalizeUser({ ...adminSeed, ...user, username: "admin" }) : user));
}

function ensureWorkspaceList(users: AuthUserRecord[], workspaces: Workspace[]) {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  byId.set(ADMIN_PUBLIC_WORKSPACE_ID, byId.get(ADMIN_PUBLIC_WORKSPACE_ID) ?? createAdminWorkspace());
  users.forEach((user) => {
    const privateId = privateWorkspaceId(user.id);
    if (!byId.has(privateId)) byId.set(privateId, createUserWorkspace(user));
  });
  return [...byId.values()];
}

function createInitialAuthState(): AuthState {
  const users = ensureDefaultAdminUsers(demoUsers);
  return {
    users,
    workspaces: ensureWorkspaceList(users, [createAdminWorkspace()]),
    currentUser: null,
    currentWorkspaceId: null,
    authError: null,
    metrics: defaultMetrics(),
    auditLogs: [],
    settings: defaultSettings(),
  };
}

function reviveAuthState(value: Partial<AuthState>): AuthState {
  const users = ensureDefaultAdminUsers(value.users?.length ? value.users : demoUsers);
  const currentUserRecord = value.currentUser
    ? users.find((user) => user.id === value.currentUser?.id) ?? users.find((user) => user.username === value.currentUser?.username) ?? null
    : null;
  return {
    users,
    workspaces: ensureWorkspaceList(users, value.workspaces ?? [createAdminWorkspace()]),
    currentUser: currentUserRecord ? toPublicUser(currentUserRecord) : null,
    currentWorkspaceId: value.currentWorkspaceId ?? null,
    authError: null,
    metrics: { ...defaultMetrics(), ...(value.metrics ?? {}) },
    auditLogs: value.auditLogs ?? [],
    settings: { ...defaultSettings(), ...(value.settings ?? {}) },
  };
}

function loadInitialAuthState() {
  if (typeof window === "undefined") return createInitialAuthState();
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? reviveAuthState(JSON.parse(raw) as Partial<AuthState>) : createInitialAuthState();
  } catch {
    return createInitialAuthState();
  }
}

function matchUser(users: AuthUserRecord[], username: string) {
  const normalized = username.trim().toLowerCase();
  return users.find((user) => user.username.toLowerCase() === normalized || user.email.toLowerCase() === normalized);
}

function publicFromUsers(users: AuthUserRecord[], userId: string) {
  const record = users.find((user) => user.id === userId);
  return record ? toPublicUser(record) : null;
}

function stateFromSnapshot(state: AuthState, snapshot: AuthSnapshot): AuthState {
  const users = ensureDefaultAdminUsers((snapshot.users?.length ? snapshot.users : [snapshot.user]) as AuthUserRecord[]);
  const currentUserRecord = users.find((user) => user.id === snapshot.user.id) ?? ({ ...snapshot.user } as AuthUserRecord);
  const currentWorkspaceId = snapshot.currentWorkspaceId ?? getLastWorkspaceId() ?? null;
  return {
    ...state,
    users,
    workspaces: ensureWorkspaceList(users, snapshot.workspaces ?? state.workspaces),
    currentUser: toPublicUser(currentUserRecord),
    currentWorkspaceId,
    authError: null,
    metrics: snapshot.metrics ?? state.metrics,
    auditLogs: snapshot.auditLogs ?? state.auditLogs,
    settings: snapshot.settings ?? { ...state.settings, storageMode: "api" },
  };
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  if (action.type === "hydrate") return stateFromSnapshot(state, action.snapshot);
  if (action.type === "setError") return { ...state, authError: action.error };

  if (action.type === "login") {
    const normalizedUsers = ensureDefaultAdminUsers(state.users);
    const normalizedWorkspaces = ensureWorkspaceList(normalizedUsers, state.workspaces);
    const user = matchUser(normalizedUsers, action.username);
    if (!user) {
      return { ...state, users: normalizedUsers, workspaces: normalizedWorkspaces, authError: "账号不存在，请检查账号或先注册。" };
    }
    if (!user.password || user.password !== action.password) {
      return { ...state, users: normalizedUsers, workspaces: normalizedWorkspaces, authError: "密码错误，请重新输入。" };
    }
    if (user.enabled === false || user.status === "disabled") {
      return { ...state, users: normalizedUsers, workspaces: normalizedWorkspaces, authError: "该账号已被停用，请联系管理员。" };
    }
    const stamp = nowIso();
    const users: AuthUserRecord[] = normalizedUsers.map((item): AuthUserRecord =>
      item.id === user.id
        ? {
            ...item,
            lastLoginAt: stamp,
            lastActiveAt: stamp,
            lastIp: sessionIp(),
            online: true,
            status: "active",
            loginCount: (item.loginCount ?? 0) + 1,
          }
        : { ...item, online: item.online && item.id === state.currentUser?.id ? false : item.online },
    );
    const metrics = {
      ...state.metrics,
      todayVisits: state.metrics.todayVisits + 1,
      totalVisits: state.metrics.totalVisits + 1,
      loginCount: state.metrics.loginCount + 1,
      uniqueVisitors: new Set(users.filter((item) => item.lastLoginAt).map((item) => item.id)).size,
    };
    const nextState = {
      ...state,
      users,
      metrics,
      workspaces: ensureWorkspaceList(users, normalizedWorkspaces),
      currentUser: publicFromUsers(users, user.id),
      currentWorkspaceId: null,
      authError: null,
    };
    return {
      ...nextState,
      auditLogs: audit(nextState, { type: "login", actorId: user.id, actorName: user.username, detail: `${user.username} 登录系统` }),
    };
  }

  if (action.type === "register") {
    if (!state.settings.allowRegistration) return { ...state, authError: "当前系统未开放注册。" };
    const normalizedUsers = ensureDefaultAdminUsers(state.users);
    const username = action.username.trim();
    const email = action.email.trim();
    if (username.length < 2 || email.length < 3 || action.password.length < 6) {
      return { ...state, authError: "请填写有效用户名、邮箱/账号和至少 6 位密码。" };
    }
    if (username.toLowerCase() === "admin" || email.toLowerCase() === "admin" || email.toLowerCase() === "admin@zhimai.local") {
      return { ...state, users: normalizedUsers, workspaces: ensureWorkspaceList(normalizedUsers, state.workspaces), authError: "admin 为系统管理员账号，不能用于注册。" };
    }
    if (matchUser(normalizedUsers, username) || matchUser(normalizedUsers, email)) {
      return { ...state, authError: "该用户名或邮箱/账号已存在。" };
    }
    const createdAt = nowIso();
    const user: AuthUserRecord = {
      id: `user_${Date.now()}`,
      username,
      email,
      password: action.password,
      role: "user",
      status: "active",
      createdAt,
      lastLoginAt: createdAt,
      lastActiveAt: createdAt,
      lastIp: sessionIp(),
      online: true,
      enabled: true,
      canManageWorkspace: false,
      canAccessAdminPanel: false,
      canEditAdminGraph: false,
      loginCount: 1,
    };
    const users = [...normalizedUsers, user];
    const nextState = {
      ...state,
      users,
      workspaces: ensureWorkspaceList(users, state.workspaces),
      currentUser: toPublicUser(user),
      currentWorkspaceId: null,
      authError: null,
      metrics: {
        ...state.metrics,
        totalVisits: state.metrics.totalVisits + 1,
        todayVisits: state.metrics.todayVisits + 1,
        loginCount: state.metrics.loginCount + 1,
        uniqueVisitors: new Set(users.filter((item) => item.lastLoginAt).map((item) => item.id)).size,
      },
    };
    return {
      ...nextState,
      auditLogs: audit(nextState, { type: "register", actorId: user.id, actorName: user.username, detail: `${user.username} 注册并进入系统` }),
    };
  }

  if (action.type === "logout") {
    const currentUser = state.currentUser;
    const users = currentUser ? state.users.map((user) => (user.id === currentUser.id ? { ...user, online: false, lastActiveAt: nowIso() } : user)) : state.users;
    const nextState = { ...state, users, currentUser: null, currentWorkspaceId: null, authError: null };
    return currentUser
      ? { ...nextState, auditLogs: audit(nextState, { type: "logout", actorId: currentUser.id, actorName: currentUser.username, detail: `${currentUser.username} 退出登录` }) }
      : nextState;
  }

  if (action.type === "selectWorkspace") {
    const workspace = state.workspaces.find((item) => item.id === action.workspaceId) ?? null;
    if (!canReadWorkspace(state.currentUser, workspace)) return { ...state, authError: "你没有权限访问该知识空间。" };
    const users = state.currentUser
      ? state.users.map((user) => (user.id === state.currentUser?.id ? { ...user, lastActiveAt: nowIso(), online: true } : user))
      : state.users;
    const nextState = { ...state, users, currentWorkspaceId: action.workspaceId, authError: null };
    return {
      ...nextState,
      metrics: {
        ...state.metrics,
        sharedGraphVisits: workspace?.type === "admin_public" ? state.metrics.sharedGraphVisits + 1 : state.metrics.sharedGraphVisits,
      },
      auditLogs: audit(nextState, {
        type: "workspace",
        actorId: state.currentUser?.id,
        actorName: state.currentUser?.username,
        detail: `进入空间：${workspace?.name ?? action.workspaceId}`,
      }),
    };
  }

  if (action.type === "clearWorkspace") {
    return { ...state, currentWorkspaceId: null, authError: null };
  }

  if (action.type === "publishWorkspace") {
    const workspace = state.workspaces.find((item) => item.id === action.workspaceId) ?? null;
    if (!canEditWorkspace(state.currentUser, workspace)) return { ...state, authError: "你当前没有发布该空间的权限。" };
    const stamp = nowIso();
    const nextState = {
      ...state,
      workspaces: state.workspaces.map((item) =>
        item.id === action.workspaceId
          ? {
              ...item,
              updatedAt: stamp,
              lastPublishedAt: stamp,
              version: item.version + 1,
              updateSummary: action.summary.trim() || "管理员发布了新的星图更新。",
            }
          : item,
      ),
      authError: null,
    };
    return {
      ...nextState,
      auditLogs: audit(nextState, { type: "settings", actorId: state.currentUser?.id, actorName: state.currentUser?.username, detail: `发布空间更新：${workspace?.name}` }),
    };
  }

  if (action.type === "setUserEnabled") {
    if (action.userId === state.currentUser?.id) return { ...state, authError: "不能停用当前登录账号。" };
    const users: AuthUserRecord[] = state.users.map((user): AuthUserRecord =>
      user.id === action.userId ? { ...user, enabled: action.enabled, status: action.enabled ? "active" : "disabled", online: action.enabled ? user.online : false } : user,
    );
    const target = users.find((user) => user.id === action.userId);
    const nextState = { ...state, users, authError: null };
    return {
      ...nextState,
      auditLogs: audit(nextState, {
        type: "settings",
        actorId: state.currentUser?.id,
        actorName: state.currentUser?.username,
        detail: `${action.enabled ? "启用" : "停用"}用户：${target?.username ?? action.userId}`,
      }),
    };
  }

  if (action.type === "deleteUser") {
    if (action.userId === state.currentUser?.id) return { ...state, authError: "不能删除当前登录账号。" };
    const target = state.users.find((user) => user.id === action.userId);
    const users = state.users.filter((user) => user.id !== action.userId);
    const workspaces = state.workspaces.filter((workspace) => workspace.ownerId !== action.userId);
    const nextState = { ...state, users, workspaces, authError: null };
    return {
      ...nextState,
      auditLogs: audit(nextState, {
        type: "settings",
        actorId: state.currentUser?.id,
        actorName: state.currentUser?.username,
        detail: `删除用户：${target?.username ?? action.userId}`,
      }),
    };
  }

  if (action.type === "changePassword") {
    if (action.password.length < 6) return { ...state, authError: "新密码至少需要 6 位。" };
    const users = state.users.map((user) => (user.id === action.userId ? { ...user, password: action.password, mustChangePassword: false } : user));
    const target = users.find((user) => user.id === action.userId);
    const currentUser = state.currentUser?.id === action.userId ? publicFromUsers(users, action.userId) : state.currentUser;
    const nextState = { ...state, users, currentUser, authError: null };
    return {
      ...nextState,
      auditLogs: audit(nextState, {
        type: "settings",
        actorId: action.actorId ?? state.currentUser?.id,
        actorName: state.currentUser?.username,
        detail: `修改账号密码：${target?.username ?? action.userId}`,
      }),
    };
  }

  if (action.type === "updateProfile") {
    const username = action.username.trim();
    const email = action.email.trim();
    if (username.length < 2 || email.length < 3) return { ...state, authError: "用户名和邮箱/账号不能为空。" };
    const duplicated = state.users.some((user) => user.id !== action.userId && (user.username.toLowerCase() === username.toLowerCase() || user.email.toLowerCase() === email.toLowerCase()));
    if (duplicated) return { ...state, authError: "用户名或邮箱/账号已被占用。" };
    const users = state.users.map((user) => (user.id === action.userId ? { ...user, username, email, lastActiveAt: nowIso() } : user));
    const currentUser = state.currentUser?.id === action.userId ? publicFromUsers(users, action.userId) : state.currentUser;
    const nextState = { ...state, users, currentUser, authError: null };
    return {
      ...nextState,
      auditLogs: audit(nextState, {
        type: "settings",
        actorId: state.currentUser?.id,
        actorName: state.currentUser?.username,
        detail: `更新个人资料：${username}`,
      }),
    };
  }

  if (action.type === "clearError") return { ...state, authError: null };
  return state;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, undefined, loadInitialAuthState);

  useEffect(() => {
    let cancelled = false;
    getCurrentRemoteUser()
      .then((snapshot) => {
        if (!cancelled && snapshot) dispatch({ type: "hydrate", snapshot });
      })
      .catch(() => {
        // Keep the local fallback state when the API is not available.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.currentWorkspaceId) ?? null,
    [state.currentWorkspaceId, state.workspaces],
  );
  const currentAccess = useMemo(() => workspaceAccess(state.currentUser, currentWorkspace), [currentWorkspace, state.currentUser]);

  useEffect(() => {
    setLastWorkspaceId(state.currentWorkspaceId);
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ currentWorkspaceId: state.currentWorkspaceId }));
  }, [currentWorkspace, state]);

  const value = useMemo<AuthContextValue>(
    () => ({
      users: state.users.map(toPublicUser),
      workspaces: state.workspaces,
      currentUser: state.currentUser,
      currentWorkspace,
      currentAccess,
      authError: state.authError,
      metrics: state.metrics,
      auditLogs: state.auditLogs,
      settings: state.settings,
      login: (username, password) => {
        loginRemote(username, password)
          .then((snapshot) => dispatch({ type: "hydrate", snapshot }))
          .catch((error) => dispatch({ type: "setError", error: error instanceof Error ? error.message : "登录失败，请稍后重试。" }));
      },
      register: (username, email, password) => {
        registerRemote(username, email, password)
          .then((snapshot) => dispatch({ type: "hydrate", snapshot }))
          .catch((error) => dispatch({ type: "setError", error: error instanceof Error ? error.message : "注册失败，请稍后重试。" }));
      },
      logout: () => {
        void logoutRemote().finally(() => dispatch({ type: "logout" }));
      },
      selectWorkspace: (workspaceId) => {
        setLastWorkspaceId(workspaceId);
        dispatch({ type: "selectWorkspace", workspaceId });
      },
      clearWorkspaceSelection: () => {
        setLastWorkspaceId(null);
        dispatch({ type: "clearWorkspace" });
      },
      publishWorkspace: (summary) => {
        if (currentWorkspace) dispatch({ type: "publishWorkspace", workspaceId: currentWorkspace.id, summary });
      },
      clearError: () => dispatch({ type: "clearError" }),
      setUserEnabled: (userId, enabled) => {
        updateRemoteUser(userId, enabled ? "enable" : "disable")
          .then((snapshot) => dispatch({ type: "hydrate", snapshot }))
          .catch(() => dispatch({ type: "setUserEnabled", userId, enabled }));
      },
      deleteUser: (userId) => {
        updateRemoteUser(userId, "delete")
          .then((snapshot) => dispatch({ type: "hydrate", snapshot }))
          .catch(() => dispatch({ type: "deleteUser", userId }));
      },
      changePassword: (userId, password) => {
        const request =
          userId === state.currentUser?.id ? updateRemoteProfile({ username: state.currentUser.username, email: state.currentUser.email, password }) : updateRemoteUser(userId, "password", { password });
        request
          .then((snapshot) => dispatch({ type: "hydrate", snapshot }))
          .catch((error) => {
            if (error instanceof Error) dispatch({ type: "setError", error: error.message });
            else dispatch({ type: "changePassword", userId, password });
          });
      },
      updateProfile: (userId, username, email) => {
        const request = userId === state.currentUser?.id ? updateRemoteProfile({ username, email }) : Promise.reject(new Error("只能修改当前账号资料。"));
        request
          .then((snapshot) => dispatch({ type: "hydrate", snapshot }))
          .catch((error) => {
            if (error instanceof Error) dispatch({ type: "setError", error: error.message });
            else dispatch({ type: "updateProfile", userId, username, email });
          });
      },
      canRead: (workspace) => canReadWorkspace(state.currentUser, workspace),
      canEdit: (workspace) => canEditWorkspace(state.currentUser, workspace),
    }),
    [currentAccess, currentWorkspace, state.auditLogs, state.authError, state.currentUser, state.metrics, state.settings, state.users, state.workspaces],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthStore() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthStore must be used inside AuthProvider.");
  return context;
}
