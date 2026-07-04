import { ArrowRight, DatabaseZap, LockKeyhole, LogOut, Settings, ShieldCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { roleLabel } from "../services/authService";
import { useAuthStore } from "../store/authStore";
import { ADMIN_PUBLIC_WORKSPACE_ID, privateWorkspaceId, type Workspace } from "../types/workspace";

interface WorkspaceSelectProps {
  onEnter: () => void;
}

export default function WorkspaceSelect({ onEnter }: WorkspaceSelectProps) {
  const { currentUser, workspaces, selectWorkspace, logout, canEdit } = useAuthStore();
  if (!currentUser) return null;

  const canManageWorkspace = currentUser.role === "admin" && currentUser.canManageWorkspace !== false;
  const adminWorkspace = workspaces.find((workspace) => workspace.id === ADMIN_PUBLIC_WORKSPACE_ID);
  const privateWorkspace = workspaces.find((workspace) => workspace.id === privateWorkspaceId(currentUser.id));

  function enter(workspace?: Workspace | null) {
    if (!workspace) return;
    selectWorkspace(workspace.id);
    onEnter();
  }

  return (
    <main className="visual-workspace thin-scrollbar relative min-h-screen overflow-x-hidden bg-[var(--page-bg)] px-4 py-8 text-[var(--text-secondary)]">
      <div className="cosmic-backdrop" />
      <div className="aurora-layer" />
      <div className="noise-layer" />
      <section className="relative z-10 mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="page-kicker">选择知识空间</p>
            <h1 className="page-title-compact">进入你的知识星图工作台</h1>
            <p className="page-subtitle">当前用户：{currentUser.username} · {roleLabel(currentUser.role)}</p>
          </div>
          <button type="button" onClick={logout} className="btn-secondary">
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <WorkspaceCard
            icon={<UsersRound className="h-5 w-5" />}
            title="管理员共享星图"
            badge="共享只读"
            detail="查看管理员维护的知识星图，可浏览资料、搜索节点、向 Copilot 提问，但不能修改共享内容。"
            meta={adminWorkspace ? `版本 v${adminWorkspace.version} · ${adminWorkspace.lastPublishedAt?.slice(0, 10) ?? "未发布"}` : "未初始化"}
            button="进入共享星图"
            onClick={() => enter(adminWorkspace)}
          />

          <WorkspaceCard
            icon={<LockKeyhole className="h-5 w-5" />}
            title="我的个人星图"
            badge="私有可编辑"
            detail="进入只属于你的私人知识空间，上传资料、生成节点、保存成果，并持续沉淀个人知识资产。"
            meta={privateWorkspace ? "仅你可访问和编辑" : "即将创建个人空间"}
            button="进入我的星图"
            onClick={() => enter(privateWorkspace)}
          />

          {canManageWorkspace && (
            <WorkspaceCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="主星图管理视图"
              badge="管理员"
              detail="维护共享星图、发布空间更新，并从顶部设置入口进入成员、访问、配置和日志后台。"
              meta={adminWorkspace ? `当前权限：${canEdit(adminWorkspace) ? "可编辑" : "只读"}` : "未初始化"}
              button="进入管理视图"
              strong
              onClick={() => enter(adminWorkspace)}
            />
          )}
        </div>

        <div className="lux-card mt-6 rounded-3xl p-5">
          <div className="flex items-start gap-3">
            <span className="icon-tile">
              {currentUser.role === "admin" ? <Settings className="h-5 w-5" /> : <DatabaseZap className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">空间与权限说明</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--text-muted)]">
                共享星图由管理员维护，普通用户可查看和提问；个人星图由当前用户独立管理。进入工作台后，顶部会持续显示当前角色、空间和权限状态。
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function WorkspaceCard({
  icon,
  title,
  badge,
  detail,
  meta,
  button,
  strong = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  badge: string;
  detail: string;
  meta: string;
  button: string;
  strong?: boolean;
  onClick: () => void;
}) {
  return (
    <article className={`lux-card hover-lift rounded-3xl p-6 ${strong ? "border-[var(--accent-border)] bg-[var(--selected-bg)]" : ""}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="icon-tile">{icon}</span>
        <span className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">{badge}</span>
      </div>
      <h2 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="mt-3 min-h-[84px] text-sm leading-7 text-[var(--text-muted)]">{detail}</p>
      <p className="mt-4 text-xs text-[var(--text-faint)]">{meta}</p>
      <button type="button" onClick={onClick} className={strong ? "btn-primary mt-6 w-full justify-center" : "btn-secondary mt-6 w-full justify-center"}>
        {button}
        <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  );
}
