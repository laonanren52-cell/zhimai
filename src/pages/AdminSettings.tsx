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
  Save,
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
import {
  getAdminConfig,
  getAdminOverview,
  getUserPreferences,
  testAdminCustomProvider,
  updateAdminConfig,
  updateUserPreferences,
  type AdminOverview,
  type CustomAiProviderPatch,
  type SystemConfigSummary,
} from "../services/backendDataService";
import { useAiStatus } from "../store/aiStatusStore";
import { useAuthStore } from "../store/authStore";
import { useKnowledgeStore } from "../store/knowledgeStore";
import type { UserPreferences } from "../types/workspace";
import { formatShanghaiDateTime } from "../utils/time";

type SettingsSection = "profile" | "security" | "space" | "ai" | "preferences" | "usage" | "members" | "system" | "spaces" | "audit";

const defaultPreferences: UserPreferences = {
  defaultHome: "dashboard",
  graphMode: "global",
  animationsEnabled: true,
  tipsEnabled: true,
  density: "comfortable",
  sidebarExpanded: false,
  updatedAt: "",
};

const emptyCustomProvider: CustomAiProviderPatch = {
  name: "",
  baseUrl: "",
  model: "",
  interfaceType: "openai-compatible",
  enabled: true,
  isDefault: false,
  note: "",
  apiKey: "",
};

function preferenceStorageKey(userId?: string) {
  return `zhimai-user-preferences-${userId || "anonymous"}`;
}

function normalizePreferences(value?: Partial<UserPreferences> | null): UserPreferences {
  return { ...defaultPreferences, ...(value ?? {}) };
}

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
  const [systemConfig, setSystemConfig] = useState<SystemConfigSummary | null>(null);
  const [configDraft, setConfigDraft] = useState({
    aiProvider: "mock",
    aiModel: "mock",
    aiEnabled: true,
    allowMock: true,
    aiApiKey: "",
    searchEnabled: false,
    searchProvider: "none",
    searchApiKey: "",
    ocrEnabled: false,
    ocrProvider: "none",
    ocrApiKey: "",
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [customProviderDraft, setCustomProviderDraft] = useState<CustomAiProviderPatch>(emptyCustomProvider);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);

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
    getAdminConfig()
      .then(({ config }) => {
        if (cancelled) return;
        setSystemConfig(config);
        setConfigDraft((draft) => ({
          ...draft,
          aiProvider: config.ai.providerId || config.ai.provider || "mock",
          aiModel: config.ai.model || "mock",
          aiEnabled: config.ai.enabled,
          allowMock: config.ai.allowMock,
          searchEnabled: config.search.enabled,
          searchProvider: config.search.provider || "none",
          ocrEnabled: config.ocr.enabled,
          ocrProvider: config.ocr.provider || "none",
        }));
      })
      .catch((error) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "系统配置读取失败。");
      });
    return () => {
      cancelled = true;
    };
  }, [canAccessAdminPanel, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    const raw = window.localStorage.getItem(preferenceStorageKey(currentUser.id));
    if (raw) {
      try {
        setPreferences(normalizePreferences(JSON.parse(raw) as Partial<UserPreferences>));
      } catch {
        setPreferences(defaultPreferences);
      }
    }
    getUserPreferences()
      .then(({ preferences: nextPreferences }) => {
        if (!cancelled) setPreferences(normalizePreferences(nextPreferences));
      })
      .catch(() => {
        // Local preference cache keeps the settings usable if the API is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    document.documentElement.classList.toggle("zhimai-motion-off", !preferences.animationsEnabled);
    document.documentElement.classList.toggle("zhimai-density-compact", preferences.density === "compact");
  }, [preferences.animationsEnabled, preferences.density]);

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
  const customProviders = systemConfig?.ai.customProviders ?? [];
  const aiProviderOptions: Array<[string, string]> = [
    ["deepseek", "DeepSeek"],
    ["openai", "OpenAI"],
    ["mock", "Mock"],
    ...customProviders.map((provider): [string, string] => [provider.id, provider.name]),
  ];

  const allSections: Array<{ key: SettingsSection; label: string; detail: string; icon: ReactNode; adminOnly?: boolean }> = [
    { key: "profile", label: "个人资料", detail: "用户名、昵称、邮箱", icon: <UserCog className="h-4 w-4" /> },
    { key: "security", label: "账号安全", detail: "密码、登录、退出", icon: <KeyRound className="h-4 w-4" /> },
    { key: "space", label: "空间与权限", detail: "空间、身份、访问范围", icon: <ShieldCheck className="h-4 w-4" /> },
    { key: "ai", label: "AI 与系统", detail: canAccessAdminPanel ? "模型、搜索、OCR 配置" : "AI 状态只读", icon: <Settings className="h-4 w-4" /> },
    { key: "preferences", label: "偏好设置", detail: "首页、图谱、动画", icon: <SlidersHorizontal className="h-4 w-4" /> },
    { key: "usage", label: "数据与使用", detail: "资料、节点、成果", icon: <Database className="h-4 w-4" /> },
    { key: "members", label: "成员管理", detail: "用户状态与密码", icon: <UsersRound className="h-4 w-4" />, adminOnly: true },
    { key: "system", label: "系统状态", detail: "访问、在线、API", icon: <MonitorDot className="h-4 w-4" />, adminOnly: true },
    { key: "spaces", label: "空间管理", detail: "空间列表与权限", icon: <Globe2 className="h-4 w-4" />, adminOnly: true },
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

  async function saveSystemConfig() {
    if (!canAccessAdminPanel) return;
    setSavingConfig(true);
    setNotice(null);
    try {
      const { config } = await updateAdminConfig({
        ai: {
          provider: configDraft.aiProvider,
          model: configDraft.aiModel,
          enabled: configDraft.aiEnabled,
          allowMock: configDraft.allowMock,
          customProviders: customProviders.map((provider) => ({
            id: provider.id,
            name: provider.name,
            baseUrl: provider.baseUrl,
            model: provider.model,
            interfaceType: provider.interfaceType,
            enabled: provider.enabled,
            isDefault: provider.id === configDraft.aiProvider,
            note: provider.note,
          })),
          ...(configDraft.aiApiKey.trim() ? { apiKey: configDraft.aiApiKey.trim() } : {}),
        },
        search: {
          enabled: configDraft.searchEnabled,
          provider: configDraft.searchProvider,
          ...(configDraft.searchApiKey.trim() ? { apiKey: configDraft.searchApiKey.trim() } : {}),
        },
        ocr: {
          enabled: configDraft.ocrEnabled,
          provider: configDraft.ocrProvider,
          ...(configDraft.ocrApiKey.trim() ? { apiKey: configDraft.ocrApiKey.trim() } : {}),
        },
      });
      setSystemConfig(config);
      setConfigDraft((draft) => ({ ...draft, aiApiKey: "", searchApiKey: "", ocrApiKey: "" }));
      await refreshHealth();
      setNotice("系统配置已保存，健康状态已刷新。普通 Provider、模型、搜索和 OCR 配置无需重启后端。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "系统配置保存失败。");
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveCustomProvider(provider: CustomAiProviderPatch = customProviderDraft) {
    if (!canAccessAdminPanel) return;
    const name = provider.name.trim();
    const baseUrl = provider.baseUrl.trim();
    const model = provider.model.trim();
    if (!name || !baseUrl || !model) {
      setNotice("自定义 Provider 需要填写名称、API Base URL 和 Model。");
      return;
    }
    const id = provider.id || name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "");
    const nextProvider = { ...provider, id, name, baseUrl, model };
    const providers = [
      ...customProviders.filter((item) => item.id !== id).map((item) => ({
        id: item.id,
        name: item.name,
        baseUrl: item.baseUrl,
        model: item.model,
        interfaceType: item.interfaceType,
        enabled: item.enabled,
        isDefault: nextProvider.isDefault ? false : item.isDefault,
        note: item.note,
      })),
      nextProvider,
    ];
    try {
      const { config } = await updateAdminConfig({
        ai: {
          provider: nextProvider.isDefault ? id : configDraft.aiProvider,
          model: nextProvider.isDefault ? model : configDraft.aiModel,
          enabled: configDraft.aiEnabled,
          allowMock: configDraft.allowMock,
          customProviders: providers,
        },
      });
      setSystemConfig(config);
      setConfigDraft((draft) => ({
        ...draft,
        aiProvider: nextProvider.isDefault ? id : draft.aiProvider,
        aiModel: nextProvider.isDefault ? model : draft.aiModel,
      }));
      setCustomProviderDraft(emptyCustomProvider);
      await refreshHealth();
      setNotice(`自定义 Provider「${name}」已保存。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "自定义 Provider 保存失败。");
    }
  }

  async function deleteCustomProvider(providerId: string) {
    if (!window.confirm("确认删除该自定义 Provider 吗？已保存的 API Key 也会从后端配置中移除。")) return;
    const providers = customProviders
      .filter((item) => item.id !== providerId)
      .map((item) => ({
        id: item.id,
        name: item.name,
        baseUrl: item.baseUrl,
        model: item.model,
        interfaceType: item.interfaceType,
        enabled: item.enabled,
        isDefault: item.isDefault,
        note: item.note,
      }));
    const fallbackProvider = configDraft.aiProvider === providerId ? "deepseek" : configDraft.aiProvider;
    try {
      const { config } = await updateAdminConfig({ ai: { provider: fallbackProvider, model: fallbackProvider === "deepseek" ? "deepseek-chat" : configDraft.aiModel, customProviders: providers } });
      setSystemConfig(config);
      setConfigDraft((draft) => ({ ...draft, aiProvider: fallbackProvider, aiModel: config.ai.model }));
      await refreshHealth();
      setNotice("自定义 Provider 已删除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除自定义 Provider 失败。");
    }
  }

  async function testCustomProvider(provider: CustomAiProviderPatch) {
    setTestingProviderId(provider.id || provider.name);
    setNotice(null);
    try {
      const { result, config } = await testAdminCustomProvider(provider);
      setSystemConfig(config);
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "连接测试失败。");
    } finally {
      setTestingProviderId(null);
    }
  }

  function updatePreference(nextPatch: Partial<UserPreferences>) {
    if (!currentUser?.id) return;
    const next = normalizePreferences({ ...preferences, ...nextPatch, updatedAt: new Date().toISOString() });
    setPreferences(next);
    window.localStorage.setItem(preferenceStorageKey(currentUser.id), JSON.stringify(next));
    updateUserPreferences(next)
      .then(({ preferences: saved }) => {
        const normalized = normalizePreferences(saved);
        setPreferences(normalized);
        window.localStorage.setItem(preferenceStorageKey(currentUser.id), JSON.stringify(normalized));
      })
      .catch((error) => {
        setNotice(error instanceof Error ? `偏好已在本地更新，后端保存失败：${error.message}` : "偏好已在本地更新，后端保存失败。");
      });
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
            <SettingsCard title="空间与权限" description="这些信息已从业务页收纳到设置中心。普通用户只能查看自己的访问状态。">
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
              title={canAccessAdminPanel ? "AI 与系统配置" : "AI 状态"}
              description={canAccessAdminPanel ? "管理员可以直接保存常用 AI、联网搜索和 OCR 配置。API Key 仅提交到后端，不会在页面明文展示。" : "当前账号只能查看 AI、搜索与 OCR 运行状态。"}
              action={<button type="button" onClick={() => void refreshHealth()} className="btn-secondary px-3 py-2"><RefreshCw className="h-4 w-4" />刷新</button>}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <InfoRow label="AI Provider" value={aiStatus.provider || systemConfig?.ai.provider || "暂无记录"} />
                <InfoRow label="当前模型" value={aiStatus.model || systemConfig?.ai.model || "暂无记录"} />
                <InfoRow label="联网搜索状态" value={aiStatus.searchConfigured ? `${formatProvider(aiStatus.searchProvider)} 已配置` : "未配置"} />
                <InfoRow label="OCR 状态" value={aiStatus.ocrConfigured || aiStatus.ocrEnabled ? `${formatProvider(systemConfig?.ocr.provider)} 已配置` : "未配置"} />
                <InfoRow label="Mock 状态" value={aiStatus.isMockMode ? "Mock 演示模式" : "真实 AI 模式"} />
                <InfoRow label="健康检查" value={aiStatus.summary} />
              </div>

              {canAccessAdminPanel && (
                <div className="mt-5 grid gap-5">
                  <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI 配置</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SelectField
                        label="AI Provider"
                        value={configDraft.aiProvider}
                        onChange={(value) => {
                          const custom = customProviders.find((provider) => provider.id === value);
                          setConfigDraft((draft) => ({ ...draft, aiProvider: value, aiModel: custom?.model || draft.aiModel }));
                        }}
                        options={aiProviderOptions}
                      />
                      <TextField label="当前模型" value={configDraft.aiModel} onChange={(value) => setConfigDraft((draft) => ({ ...draft, aiModel: value }))} placeholder="deepseek-v4-flash" />
                      <SwitchRow label="启用真实 AI" checked={configDraft.aiEnabled} onChange={(value) => setConfigDraft((draft) => ({ ...draft, aiEnabled: value }))} />
                      <SwitchRow label="允许 Mock 演示模式" checked={configDraft.allowMock} onChange={(value) => setConfigDraft((draft) => ({ ...draft, allowMock: value }))} />
                      <InfoRow label="AI Key 状态" value={systemConfig?.ai.apiKeyConfigured ? `已配置 ${systemConfig.ai.apiKeyMasked || ""}` : "未配置"} />
                      <TextField label="重新填写 AI Key" value={configDraft.aiApiKey} onChange={(value) => setConfigDraft((draft) => ({ ...draft, aiApiKey: value }))} placeholder="不展示旧 Key，留空则保持不变" type="password" />
                    </div>
                  </div>

                  <div className="grid gap-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">自定义 AI 配置</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-faint)]">适用于通义千问、智谱 GLM、Kimi、OpenRouter、硅基流动、本地 Ollama 和其他兼容 OpenAI 格式的服务。</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextField label="Provider 名称" value={customProviderDraft.name} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, name: value }))} placeholder="例如：硅基流动" />
                      <TextField label="API Base URL" value={customProviderDraft.baseUrl} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, baseUrl: value }))} placeholder="https://api.example.com/v1" />
                      <TextField label="Model 名称" value={customProviderDraft.model} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, model: value }))} placeholder="Qwen/Qwen2.5-72B-Instruct" />
                      <SelectField
                        label="接口类型"
                        value={customProviderDraft.interfaceType}
                        onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, interfaceType: value as CustomAiProviderPatch["interfaceType"] }))}
                        options={[["openai-compatible", "OpenAI-compatible"], ["deepseek-compatible", "DeepSeek-compatible"], ["custom-http", "Custom HTTP"]]}
                      />
                      <TextField label="重新填写 API Key" value={customProviderDraft.apiKey || ""} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, apiKey: value }))} placeholder="只提交到后端，不展示旧 Key" type="password" />
                      <TextField label="备注说明" value={customProviderDraft.note || ""} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, note: value }))} placeholder="用途、计费账号或部署说明" />
                      <SwitchRow label="启用该 Provider" checked={customProviderDraft.enabled} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, enabled: value }))} />
                      <SwitchRow label="设为默认模型" checked={customProviderDraft.isDefault} onChange={(value) => setCustomProviderDraft((draft) => ({ ...draft, isDefault: value }))} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void saveCustomProvider()} className="btn-primary px-4 py-2">
                        <Save className="h-4 w-4" />
                        保存自定义 Provider
                      </button>
                      <button type="button" onClick={() => void testCustomProvider(customProviderDraft)} className="btn-secondary px-4 py-2" disabled={testingProviderId === (customProviderDraft.id || customProviderDraft.name)}>
                        <RefreshCw className="h-4 w-4" />
                        {testingProviderId === (customProviderDraft.id || customProviderDraft.name) ? "测试中" : "测试连接"}
                      </button>
                    </div>
                    {customProviders.length > 0 && (
                      <div className="grid gap-2">
                        {customProviders.map((provider) => (
                          <article key={provider.id} className="micro-card p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">{provider.name}</h4>
                                  {provider.isDefault && <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent)]">默认</span>}
                                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-deep)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{provider.enabled ? "启用" : "停用"}</span>
                                  <span className={`rounded-full border px-2 py-0.5 text-xs ${provider.lastTestOk ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]" : "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]"}`}>
                                    {provider.lastTestOk ? "模型可用" : "待测试"}
                                  </span>
                                </div>
                                <p className="mt-2 truncate text-xs text-[var(--text-faint)]">{provider.baseUrl} · {provider.model}</p>
                                <p className="mt-1 text-xs text-[var(--text-faint)]">API Key：{provider.apiKeyConfigured ? `已配置 ${provider.apiKeyMasked || ""}` : "未配置"} · {provider.interfaceType}</p>
                                {provider.lastTestMessage && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-faint)]">{provider.lastTestMessage}</p>}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCustomProviderDraft({
                                    id: provider.id,
                                    name: provider.name,
                                    baseUrl: provider.baseUrl,
                                    model: provider.model,
                                    interfaceType: provider.interfaceType,
                                    enabled: provider.enabled,
                                    isDefault: provider.isDefault,
                                    note: provider.note,
                                    apiKey: "",
                                  })}
                                  className="btn-secondary px-3 py-2"
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void testCustomProvider({
                                    id: provider.id,
                                    name: provider.name,
                                    baseUrl: provider.baseUrl,
                                    model: provider.model,
                                    interfaceType: provider.interfaceType,
                                    enabled: provider.enabled,
                                    isDefault: provider.isDefault,
                                    note: provider.note,
                                  })}
                                  className="btn-secondary px-3 py-2"
                                  disabled={testingProviderId === provider.id}
                                >
                                  测试
                                </button>
                                <button type="button" onClick={() => void deleteCustomProvider(provider.id)} className="rounded-full border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">搜索配置</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SwitchRow label="启用联网搜索" checked={configDraft.searchEnabled} onChange={(value) => setConfigDraft((draft) => ({ ...draft, searchEnabled: value }))} />
                      <SelectField label="搜索 Provider" value={configDraft.searchProvider} onChange={(value) => setConfigDraft((draft) => ({ ...draft, searchProvider: value }))} options={[["tavily", "Tavily"], ["brave", "Brave"], ["serpapi", "SerpAPI"], ["none", "不启用"]]} />
                      <InfoRow label="搜索 Key 状态" value={systemConfig?.search.apiKeyConfigured ? `已配置 ${systemConfig.search.apiKeyMasked || ""}` : "未配置"} />
                      <TextField label="重新填写搜索 Key" value={configDraft.searchApiKey} onChange={(value) => setConfigDraft((draft) => ({ ...draft, searchApiKey: value }))} placeholder="Tavily / Brave / SerpAPI Key" type="password" />
                    </div>
                  </div>

                  <div className="grid gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">OCR 配置</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SwitchRow label="启用 OCR" checked={configDraft.ocrEnabled} onChange={(value) => setConfigDraft((draft) => ({ ...draft, ocrEnabled: value }))} />
                      <TextField label="OCR Provider" value={configDraft.ocrProvider} onChange={(value) => setConfigDraft((draft) => ({ ...draft, ocrProvider: value }))} placeholder="none / aliyun / tencent" />
                      <InfoRow label="OCR Key 状态" value={systemConfig?.ocr.apiKeyConfigured ? `已配置 ${systemConfig.ocr.apiKeyMasked || ""}` : "未配置"} />
                      <TextField label="重新填写 OCR Key" value={configDraft.ocrApiKey} onChange={(value) => setConfigDraft((draft) => ({ ...draft, ocrApiKey: value }))} placeholder="不展示旧 Key，留空则保持不变" type="password" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-3xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-4 text-sm leading-6 text-[var(--warning)] md:flex-row md:items-center md:justify-between">
                    <span>普通 Provider、模型、搜索和 OCR 配置保存后立即生效；底层接口地址、端口、CORS、数据库路径等部署级配置仍建议保留在 .env，修改后可能需要重启后端。</span>
                    <button type="button" onClick={saveSystemConfig} disabled={savingConfig} className="btn-primary justify-center px-4 py-2">
                      <Save className="h-4 w-4" />
                      {savingConfig ? "保存中" : "保存配置"}
                    </button>
                  </div>
                </div>
              )}
            </SettingsCard>
          )}

          {activeSection === "preferences" && (
            <SettingsCard title="偏好设置" description="这些设置属于当前账号，保存后刷新页面仍会保留。">
              <div className="grid gap-4">
                <PreferenceGroup label="默认首页" value={preferences.defaultHome} options={[["dashboard", "工作区"], ["upload", "知识导入"], ["graph", "知脉图"], ["assistant", "Copilot"], ["outputs", "成果工坊"]]} onChange={(value) => updatePreference({ defaultHome: value as UserPreferences["defaultHome"] })} />
                <PreferenceGroup label="默认图谱模式" value={preferences.graphMode} options={[["global", "全局星图"], ["document", "资料聚焦"], ["recent", "最近更新"]]} onChange={(value) => updatePreference({ graphMode: value as UserPreferences["graphMode"] })} />
                <PreferenceGroup label="界面密度" value={preferences.density} options={[["compact", "紧凑模式"], ["comfortable", "舒展模式"]]} onChange={(value) => updatePreference({ density: value as UserPreferences["density"] })} />
                <div className="grid gap-3 md:grid-cols-3">
                  <SwitchRow label="动画光效" checked={preferences.animationsEnabled} onChange={(value) => updatePreference({ animationsEnabled: value })} />
                  <SwitchRow label="小提示" checked={preferences.tipsEnabled} onChange={(value) => updatePreference({ tipsEnabled: value })} />
                  <SwitchRow label="默认展开侧栏" checked={preferences.sidebarExpanded} onChange={(value) => updatePreference({ sidebarExpanded: value })} />
                </div>
                <InfoRow label="最近保存" value={formatShanghaiDateTime(preferences.updatedAt)} />
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

          {activeSection === "spaces" && canAccessAdminPanel && (
            <SettingsCard title="空间管理" description="管理员可查看空间列表与访问类型。">
              <div className="grid gap-3">
                {workspaces.map((workspace) => (
                  <article key={workspace.id} className="micro-card p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{workspace.name}</h3>
                        <p className="mt-1 text-xs text-[var(--text-faint)]">{formatWorkspaceType(workspace.type)} · {workspace.visibility} · v{workspace.version}</p>
                      </div>
                      <span className="text-xs text-[var(--text-faint)]">{formatShanghaiDateTime(workspace.updatedAt)}</span>
                    </div>
                  </article>
                ))}
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input-shell rounded-2xl px-4 py-3 text-sm">
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} className="input-shell rounded-2xl px-4 py-3 text-sm" placeholder={placeholder} />
    </label>
  );
}

function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-left transition hover:border-[var(--accent-border)]"
    >
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className={`rounded-full border px-3 py-1 text-xs ${checked ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-deep)] text-[var(--text-faint)]"}`}>
        {checked ? "开启" : "关闭"}
      </span>
    </button>
  );
}

function PreferenceGroup({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3">
      <div className="mb-3 text-sm text-[var(--text-muted)]">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={`rounded-full border px-3 py-2 text-sm transition ${value === optionValue ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--surface-deep)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
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
  if (!provider || provider === "none") return "未配置";
  if (provider.toLowerCase() === "tavily") return "Tavily";
  if (provider.toLowerCase() === "deepseek") return "DeepSeek";
  if (provider.toLowerCase() === "openai") return "OpenAI";
  return provider;
}
