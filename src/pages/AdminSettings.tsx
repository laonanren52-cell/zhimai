import {
  Activity,
  Ban,
  CheckCircle2,
  Database,
  Download,
  Globe2,
  KeyRound,
  LogOut,
  MonitorDot,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getAdminOverview, type AdminOverview } from "../services/backendDataService";
import { useAiStatus } from "../store/aiStatusStore";
import { useAuthStore } from "../store/authStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import { formatShanghaiDateTime } from "../utils/time";

type SettingsSection = "profile" | "security" | "space" | "ai" | "preferences" | "usage" | "members" | "system" | "audit";

export default function AdminSettings() {
  const {
    users,
    workspaces,
    currentUser,
    currentWorkspace,
    currentAccess,
    metrics,
    auditLogs,
    authError,
    setUserEnabled,
    deleteUser,
    changePassword,
    updateProfile,
    clearError,
    logout,
  } = useAuthStore();
  const { state } = useKnowledgeStore();
  const { status: aiStatus, refreshHealth } = useAiStatus();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");
  const [userSearch, setUserSearch] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [profileName, setProfileName] = useState(currentUser?.username ?? "");
  const [profileEmail, setProfileEmail] = useState(currentUser?.email ?? "");
  const [nickname, setNickname] = useState(currentUser?.username ?? "");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  const canAccessAdminPanel = currentUser?.role === "admin" && currentUser.canAccessAdminPanel !== false;

  useEffect(() => {
    setProfileName(currentUser?.username ?? "");
    setProfileEmail(currentUser?.email ?? "");
    setNickname(currentUser?.username ?? "");
  }, [currentUser?.email, currentUser?.username]);

  useEffect(() => {
    if (!canAccessAdminPanel) return;
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
  }, [canAccessAdminPanel, currentUser?.id]);

  const displayUsers = canAccessAdminPanel ? overview?.users ?? users : currentUser ? [currentUser] : [];
  const displayMetrics = overview?.metrics ?? metrics;
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
  const permissionStatus = currentAccess?.canEdit ? "可编辑" : currentAccess?.canRead ? "只读" : "无访问权限";

  const allSections: Array<{ key: SettingsSection; label: string; detail: string; icon: ReactNode; adminOnly?: boolean }> = [
    { key: "profile", label: "个人资料", detail: "用户名、昵称、邮箱", icon: <UserCog className="h-4 w-4" /> },
    { key: "security", label: "账号安全", detail: "密码、登录、退出", icon: <KeyRound className="h-4 w-4" /> },
    { key: "space", label: "空间与权限", detail: "空间、身份、访问范围", icon: <ShieldCheck className="h-4 w-4" /> },
    { key: "ai", label: "AI 与系统", detail: "模型、搜索、OCR", icon: <Settings className="h-4 w-4" /> },
    { key: "preferences", label: "偏好设置", detail: "首页、图谱、动画", icon: <SlidersHorizontal className="h-4 w-4" /> },
    { key: "usage", label: "数据与使用", detail: "资料、节点、成果", icon: <Database className="h-4 w-4" /> },
    { key: "members", label: "成员管理", detail: "用户状态与密码", icon: <UsersRound className="h-4 w-4" />, adminOnly: true },
    { key: "system", label: "系统状态", detail: "访问、在线、API", icon: <MonitorDot className="h-4 w-4" />, adminOnly: true },
    { key: "audit", label: "日志审计", detail: "登录与关键操作", icon: <Activity className="h-4 w-4" />, adminOnly: true },
  ];
  const sections = allSections.filter((section) => !section.adminOnly || canAccessAdminPanel);

  function updateAccountPassword() {
    clearError();
    setNotice(null);
    if (!currentUser) return;
    changePassword(currentUser.id, accountPassword);
    if (accountPassword.length >= 6) {
      setAccountPassword("");
      setNotice("密码已更新。");
    }
  }

  function updateAccountProfile() {
    clearError();
    setNotice(null);
    if (!currentUser) return;
    updateProfile(currentUser.id, profileName, profileEmail);
    setNotice("账户资料已更新。");
  }

  function resetPassword(userId: string) {
    const temporaryPassword = `Zm-${Math.random().toString(36).slice(2, 8)}-${new Date().getFullYear()}`;
    changePassword(userId, temporaryPassword);
    setNotice(`已生成临时密码：${temporaryPassword}。请通过安全渠道发送给该用户。`);
  }

  return (
    <div className="page-shell fade-in">
      <div className="mb-6">
        <h1 className="page-title-compact">设置</h1>
        <p className="page-subtitle">个人资料、账户安全、空间权限、AI 状态和管理员工具集中在这里管理。</p>
      </div>

      {(authError || notice || currentUser?.mustChangePassword) && (
        <div className={`mb-5 rounded-3xl border p-4 text-sm leading-7 ${authError ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"}`}>
          {authError || notice || "当前账号仍在使用初始化密码策略，建议尽快修改密码。"}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lux-card h-fit rounded-3xl p-4">
          <div className="mb-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{currentUser?.username ?? "未登录"}</p>
            <p className="mt-1 text-xs text-[var(--text-faint)]">{formatRole(currentUser?.role)} · {permissionStatus}</p>
          </div>
          <div className="grid gap-2">
            {sections.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={`liquid-action flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${activeSection === section.key ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-soft)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--surface-deep)]">{section.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{section.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-faint)]">{section.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0">
          {activeSection === "profile" && (
            <SettingsCard title="个人资料" description="维护基础身份信息。头像和手机号暂以本地展示入口保留。">
              <div className="grid gap-3 md:grid-cols-2">
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="用户名" />
                <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="昵称" />
                <input value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="邮箱或账号" />
                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="手机号（可选）" />
              </div>
              <button type="button" onClick={updateAccountProfile} className="btn-primary mt-4">
                <UserCog className="h-4 w-4" />
                更新资料
              </button>
            </SettingsCard>
          )}

          {activeSection === "security" && (
            <SettingsCard title="账号安全" description="修改密码、查看最近登录摘要并退出当前账号。">
              <div className="grid gap-3 md:grid-cols-2">
                <InfoRow label="当前账号" value={currentUser?.username ?? "暂无记录"} />
                <InfoRow label="最近登录" value={formatShanghaiDateTime(currentUser?.lastLoginAt)} />
                <InfoRow label="最近活跃" value={formatShanghaiDateTime(currentUser?.lastActiveAt)} />
                <InfoRow label="登录 IP" value={currentUser?.lastLoginIp ?? currentUser?.lastIp ?? "local-session"} />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} type="password" className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder="输入新密码" />
                <button type="button" onClick={updateAccountPassword} className="btn-primary justify-center">
                  <KeyRound className="h-4 w-4" />
                  修改密码
                </button>
                <button type="button" onClick={logout} className="btn-secondary justify-center">
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              </div>
            </SettingsCard>
          )}

          {activeSection === "space" && (
            <SettingsCard title="空间与权限" description="这些信息已从业务页收纳到设置中心。">
              <div className="grid gap-3 md:grid-cols-2">
                <InfoRow label="当前空间" value={currentWorkspace?.name ?? "暂无记录"} />
                <InfoRow label="空间类型" value={formatWorkspaceType(currentWorkspace?.type)} />
                <InfoRow label="当前用户" value={currentUser?.username ?? "暂无记录"} />
                <InfoRow label="当前身份" value={formatRole(currentUser?.role)} />
                <InfoRow label="访问权限" value={permissionStatus} />
                <InfoRow label="访问范围" value={currentAccess?.reason ?? "暂无记录"} />
              </div>
            </SettingsCard>
          )}

          {activeSection === "ai" && (
            <SettingsCard
              title="AI 与系统"
              description="只展示运行状态，不暴露任何 API Key。"
              action={<button type="button" onClick={() => void refreshHealth()} className="btn-secondary px-3 py-2"><RefreshCw className="h-4 w-4" />刷新</button>}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <InfoRow label="AI Provider" value={aiStatus.provider || "暂无记录"} />
                <InfoRow label="当前模型" value={aiStatus.model || "暂无记录"} />
                <InfoRow label="联网增强" value={aiStatus.searchConfigured ? `${formatProvider(aiStatus.searchProvider)} 已配置` : "未配置"} />
                <InfoRow label="OCR 状态" value={aiStatus.ocrConfigured || aiStatus.ocrEnabled ? "已配置" : "未配置"} />
                <InfoRow label="Mock 状态" value={aiStatus.isMockMode ? "Mock 演示模式" : "真实 AI 模式"} />
                <InfoRow label="健康检查" value={aiStatus.summary} />
              </div>
            </SettingsCard>
          )}

          {activeSection === "preferences" && (
            <SettingsCard title="偏好设置" description="当前为前端偏好入口，后续可接入持久化。">
              <div className="grid gap-3 md:grid-cols-2">
                <ToggleRow label="默认首页" value="工作区" />
                <ToggleRow label="默认图谱模式" value="全局星图" />
                <ToggleRow label="动画光效" value="显示" />
                <ToggleRow label="小提示" value="显示" />
                <ToggleRow label="界面密度" value="舒展模式" />
                <ToggleRow label="默认展开侧栏" value="关闭" />
              </div>
            </SettingsCard>
          )}

          {activeSection === "usage" && (
            <SettingsCard title="数据与使用" description="快速查看当前空间的数据规模。">
              <div className="admin-metrics-grid grid gap-4">
                <StatTile icon={<Database className="h-4 w-4" />} label="资料数" value={`${state.documents.length}`} detail={`${uploadCount} 次上传记录`} />
                <StatTile icon={<ShieldCheck className="h-4 w-4" />} label="节点 / 关系" value={`${state.graph.nodes.length} / ${state.graph.edges.length}`} detail="当前星图规模" />
                <StatTile icon={<Activity className="h-4 w-4" />} label="问答 / 生成" value={`${askCount} / ${generateCount}`} detail="最近活动统计" />
                <StatTile icon={<Download className="h-4 w-4" />} label="导出数据" value="入口保留" detail="后续可接入真实导出" />
              </div>
            </SettingsCard>
          )}

          {activeSection === "members" && canAccessAdminPanel && (
            <SettingsCard title="成员管理" description="搜索用户，管理状态，重置密码或删除账号。">
              <label className="input-shell mb-4 flex max-w-md items-center gap-2 rounded-2xl px-3 py-2">
                <Search className="h-4 w-4 text-[var(--accent)]" />
                <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="搜索用户" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-faint)]" />
              </label>
              <div className="thin-scrollbar max-h-[620px] overflow-y-auto pr-1">
                <div className="grid gap-3">
                  {filteredUsers.map((user) => (
                    <article key={user.id} className="micro-card p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold text-[var(--text-primary)]">{user.username}</h3>
                            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-2 py-1 text-xs text-[var(--text-muted)]">{formatRole(user.role)}</span>
                            <span className={`rounded-full border px-2 py-1 text-xs ${user.enabled === false ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"}`}>
                              {user.enabled === false ? "已停用" : "启用中"}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm text-[var(--text-muted)]">{user.email}</p>
                          <p className="mt-2 text-xs text-[var(--text-faint)]">注册 {formatShanghaiDateTime(user.createdAt)} · 最近活跃 {formatShanghaiDateTime(user.lastActiveAt)} · 登录 {user.loginCount ?? 0} 次</p>
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
                          {user.id !== currentUser?.id && (
                            <button type="button" onClick={() => deleteUser(user.id)} className="rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]" title="删除用户">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </SettingsCard>
          )}

          {activeSection === "system" && canAccessAdminPanel && (
            <SettingsCard title="系统状态" description="管理员可见的运行与访问概览。">
              <div className="admin-metrics-grid grid gap-4">
                <StatTile icon={<UsersRound className="h-4 w-4" />} label="成员数" value={`${displayUsers.length}`} detail={`${onlineUsers.length} 人在线`} />
                <StatTile icon={<Activity className="h-4 w-4" />} label="今日访问" value={`${displayMetrics.todayVisits}`} detail={`总访问 ${displayMetrics.totalVisits}`} />
                <StatTile icon={<Globe2 className="h-4 w-4" />} label="API 健康" value={aiStatus.connection} detail={aiStatus.summary} />
                <StatTile icon={<Database className="h-4 w-4" />} label="资料 / 节点" value={`${state.documents.length} / ${state.graph.nodes.length}`} detail={`${state.graph.edges.length} 条关系`} />
              </div>
            </SettingsCard>
          )}

          {activeSection === "audit" && canAccessAdminPanel && (
            <SettingsCard title="日志审计" description="最近登录、导入、修改和关键操作。">
              <div className="thin-scrollbar max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {[
                  ...displayAuditLogs,
                  ...state.recentActivities.map((activity) => ({ id: activity.id, type: activity.type, actorName: currentUser?.username, detail: activity.title, createdAt: activity.createdAt })),
                ]
                  .slice(0, 32)
                  .map((log) => (
                    <div key={log.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{log.detail}</span>
                        <span className="shrink-0 text-xs text-[var(--text-faint)]">{formatShanghaiDateTime(("loginAt" in log ? log.loginAt : undefined) ?? log.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-faint)]">{log.actorName ?? "system"} · {log.type}</p>
                    </div>
                  ))}
              </div>
            </SettingsCard>
          )}
        </section>
      </div>
    </div>
  );
}

function SettingsCard({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="lux-card rounded-3xl p-5 md:p-6">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-faint)]">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
      <span className="shrink-0 text-sm text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-[var(--text-primary)]">{value || "暂无记录"}</span>
    </div>
  );
}

function ToggleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">{value}</span>
    </div>
  );
}

function StatTile({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
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

function formatWorkspaceType(type?: string) {
  if (type === "admin_public") return "管理员共享星图";
  if (type === "user_private") return "个人星图";
  if (type === "demo_public") return "演示星图";
  return "暂无记录";
}

function formatRole(role?: string) {
  if (role === "admin") return "管理员";
  if (role === "user") return "普通用户";
  return "暂无记录";
}

function formatProvider(provider?: string) {
  if (!provider || provider === "none") return "搜索服务";
  if (provider.toLowerCase() === "tavily") return "Tavily";
  return provider;
}
