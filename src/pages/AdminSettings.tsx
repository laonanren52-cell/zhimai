import {
  Activity,
  Ban,
  CheckCircle2,
  Database,
  Globe2,
  KeyRound,
  MonitorDot,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import AiModeBadge from "../components/common/AiModeBadge";
import WorkspaceBadge from "../components/common/WorkspaceBadge";
import { getAdminOverview, type AdminOverview } from "../services/backendDataService";
import { roleLabel, workspaceTypeLabel } from "../services/authService";
import { useAiStatus } from "../store/aiStatusStore";
import { useAuthStore } from "../store/authStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import { formatShanghaiDateTime } from "../utils/time";

export default function AdminSettings() {
  const {
    users,
    workspaces,
    currentUser,
    metrics,
    auditLogs,
    settings,
    authError,
    setUserEnabled,
    deleteUser,
    changePassword,
    updateProfile,
    clearError,
  } = useAuthStore();
  const { state } = useKnowledgeStore();
  const { status: aiStatus } = useAiStatus();
  const [userSearch, setUserSearch] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [profileName, setProfileName] = useState(currentUser?.username ?? "");
  const [profileEmail, setProfileEmail] = useState(currentUser?.email ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    if (currentUser?.role !== "admin" || currentUser.canAccessAdminPanel === false) return;
    let cancelled = false;
    getAdminOverview()
      .then((nextOverview) => {
        if (!cancelled) setOverview(nextOverview);
      })
      .catch(() => {
        // The local store remains as a fallback if the backend is temporarily unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, currentUser?.role, currentUser?.canAccessAdminPanel]);

  const displayUsers = overview?.users ?? users;
  const displayMetrics = overview?.metrics ?? metrics;
  const displaySettings = overview?.settings ?? settings;
  const displayAuditLogs = overview ? [...overview.loginLogs, ...overview.activityLogs] : auditLogs;
  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return displayUsers;
    return displayUsers.filter((user) => `${user.username} ${user.email} ${user.role}`.toLowerCase().includes(keyword));
  }, [displayUsers, userSearch]);

  const uploadCount = state.recentActivities.filter((activity) => activity.type === "upload").length;
  const askCount = state.recentActivities.filter((activity) => activity.type === "ask").length;
  const generateCount = state.recentActivities.filter((activity) => activity.type === "generate").length;
  const onlineUsers = displayUsers.filter((user) => user.online || user.isOnline);
  const adminWorkspace = workspaces.find((workspace) => workspace.type === "admin_public");

  if (currentUser?.role !== "admin" || currentUser.canAccessAdminPanel === false) {
    return (
      <div className="page-shell">
        <section className="lux-card rounded-3xl p-8">
          <p className="page-kicker">权限受限</p>
          <h1 className="page-title-compact">当前账号不能访问管理员后台</h1>
          <p className="page-subtitle">普通用户可以查看共享星图、使用 Copilot 和管理个人星图，但不能进入系统设置。</p>
        </section>
      </div>
    );
  }

  function updateAdminPassword() {
    clearError();
    setNotice(null);
    if (!currentUser) return;
    changePassword(currentUser.id, adminPassword);
    if (adminPassword.length >= 6) {
      setAdminPassword("");
      setNotice("管理员密码已更新。");
    }
  }

  function updateAdminProfile() {
    clearError();
    setNotice(null);
    if (!currentUser) return;
    updateProfile(currentUser.id, profileName, profileEmail);
    setNotice("管理员资料已更新。");
  }

  function resetPassword(userId: string) {
    const temporaryPassword = `Zm-${Math.random().toString(36).slice(2, 8)}-${new Date().getFullYear()}`;
    changePassword(userId, temporaryPassword);
    setNotice(`已生成临时密码：${temporaryPassword}。请通过安全渠道发送给该用户。`);
  }

  return (
    <div className="page-shell fade-in">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="page-kicker">Admin Console</p>
          <h1 className="page-title-compact">设置 / 管理后台</h1>
          <p className="page-subtitle">统一管理成员、空间、访问、AI 状态、系统配置和操作日志。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WorkspaceBadge compact />
          <AiModeBadge compact />
        </div>
      </div>

      {(authError || notice || currentUser.mustChangePassword) && (
        <div className={`mb-5 rounded-3xl border p-4 text-sm leading-7 ${authError ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"}`}>
          {authError || notice || "当前管理员账号仍使用初始化密码策略，建议尽快修改密码。"}
        </div>
      )}

      <section className="admin-metrics-grid mb-5 grid gap-4">
        <AdminMetric icon={<UsersRound className="h-4 w-4" />} label="成员数" value={`${displayUsers.length}`} detail={`${onlineUsers.length} 人在线`} />
        <AdminMetric icon={<Activity className="h-4 w-4" />} label="今日访问" value={`${displayMetrics.todayVisits}`} detail={`总访问 ${displayMetrics.totalVisits}`} />
        <AdminMetric icon={<ShieldCheck className="h-4 w-4" />} label="共享星图访问" value={`${displayMetrics.sharedGraphVisits}`} detail={adminWorkspace?.name ?? "管理员共享星图"} />
        <AdminMetric icon={<Database className="h-4 w-4" />} label="资料 / 节点" value={`${state.documents.length} / ${state.graph.nodes.length}`} detail={`${state.graph.edges.length} 条关系`} />
        <AdminMetric icon={<MonitorDot className="h-4 w-4" />} label="Copilot / 生成" value={`${askCount} / ${generateCount}`} detail={`${uploadCount} 次上传记录`} />
      </section>

      <div className="admin-console-grid grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="lux-card rounded-3xl p-5">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">成员管理</h2>
              <p className="mt-1 text-sm text-[var(--text-faint)]">管理成员状态、角色和访问权限。</p>
            </div>
            <label className="input-shell flex min-w-[260px] items-center gap-2 rounded-2xl px-3 py-2">
              <Search className="h-4 w-4 text-[var(--accent)]" />
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="搜索用户" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]" />
            </label>
          </div>

          <div className="thin-scrollbar max-h-[520px] overflow-y-auto pr-1">
            <div className="grid gap-3">
              {filteredUsers.map((user) => {
                const privateWorkspace = workspaces.find((workspace) => workspace.ownerId === user.id && workspace.type === "user_private");
                return (
                  <article key={user.id} className="micro-card p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">{user.username}</h3>
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-2 py-1 text-xs text-[var(--text-muted)]">{roleLabel(user.role)}</span>
                          <span className={`rounded-full border px-2 py-1 text-xs ${user.enabled === false ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"}`}>
                            {user.enabled === false ? "已停用" : "启用中"}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-xs ${user.online ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-faint)]"}`}>
                            {user.online ? "在线" : "离线"}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm text-[var(--text-muted)]">{user.email}</p>
                        <p className="mt-2 text-xs text-[var(--text-faint)]">
                          注册 {formatShanghaiDateTime(user.createdAt)} · 最近活跃 {formatShanghaiDateTime(user.lastActiveAt)} · 最近 IP {user.lastLoginIp ?? user.lastIp ?? "local-session"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-faint)]">
                          共享星图：可访问 · 个人星图：{privateWorkspace ? "已创建" : "未创建"} · 登录 {user.loginCount ?? 0} 次
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setUserEnabled(user.id, user.enabled === false)} className="btn-secondary px-3 py-2">
                          {user.enabled === false ? <CheckCircle2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                          {user.enabled === false ? "启用" : "停用"}
                        </button>
                        <button type="button" onClick={() => resetPassword(user.id)} className="btn-secondary px-3 py-2">
                          <RefreshCw className="h-4 w-4" />
                          重置密码
                        </button>
                        {user.id !== currentUser.id && (
                          <button type="button" onClick={() => deleteUser(user.id)} className="rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <div className="grid gap-5">
          <section className="lux-card rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="icon-tile">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">密码与账号</h2>
                <p className="text-sm text-[var(--text-faint)]">管理员资料和密码管理。</p>
              </div>
            </div>
            <div className="grid gap-3">
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="管理员用户名" />
              <input value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="绑定邮箱或账号" />
              <button type="button" onClick={updateAdminProfile} className="btn-secondary justify-center">
                <UserCog className="h-4 w-4" />
                更新个人资料
              </button>
              <input value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} type="password" className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="输入新的管理员密码" />
              <button type="button" onClick={updateAdminPassword} className="btn-primary justify-center">
                <KeyRound className="h-4 w-4" />
                修改管理员密码
              </button>
            </div>
          </section>

          <section className="lux-card rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="icon-tile">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">系统配置</h2>
                <p className="text-sm text-[var(--text-faint)]">配置状态与版本信息。</p>
              </div>
            </div>
            <div className="grid gap-3">
              {[
                ["站点名称", displaySettings.siteName],
                ["存储模式", displaySettings.storageMode === "local" ? "本地统一 store" : "API 数据源"],
                ["版本", displaySettings.version],
                ["AI 模型", aiStatus.providerLabel],
                ["联网搜索", aiStatus.searchConfigured ? `已配置 ${aiStatus.searchProvider}` : "未配置"],
                ["OCR", aiStatus.ocrEnabled ? "已开启" : "未配置"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                  <span className="text-sm text-[var(--text-muted)]">{label}</span>
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">{value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="lux-card rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">在线与 IP 状态</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {onlineUsers.length > 0 ? (
              onlineUsers.map((user) => (
                <div key={user.id} className="micro-card p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{user.username}</p>
                  <p className="mt-2 text-xs text-[var(--text-faint)]">最近 IP：{user.lastLoginIp ?? user.lastIp ?? "local-session"}</p>
                  <p className="mt-1 text-xs text-[var(--text-faint)]">最近活跃：{formatShanghaiDateTime(user.lastActiveAt)}</p>
                  <p className="mt-1 text-xs text-[var(--text-faint)]">最近页面：{user.role === "admin" ? "管理后台" : "知识工作台"}</p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-faint)]">暂无在线用户。</p>
            )}
          </div>
        </div>

        <div className="lux-card rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">操作日志</h2>
          </div>
          <div className="thin-scrollbar max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {[...displayAuditLogs, ...state.recentActivities.map((activity) => ({ id: activity.id, type: activity.type, actorName: currentUser.username, detail: activity.title, createdAt: activity.createdAt }))].slice(0, 24).map((log) => (
              <div key={log.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{log.detail}</span>
                  <span className="shrink-0 text-xs text-[var(--text-faint)]">{formatShanghaiDateTime(("loginAt" in log ? log.loginAt : undefined) ?? log.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-faint)]">{log.actorName ?? "system"} · {log.type}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="micro-card hover-lift p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
        <span className="text-[var(--accent)]">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-faint)]">{detail}</p>
    </div>
  );
}
