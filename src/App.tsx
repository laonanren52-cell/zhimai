import { Bot, DatabaseZap, FileUp, GitBranch, Home, Layers3, LogOut, Settings, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import AiModeBadge from "./components/common/AiModeBadge";
import WorkspaceBadge from "./components/common/WorkspaceBadge";
import AdminSettings from "./pages/AdminSettings";
import Assistant from "./pages/Assistant";
import Dashboard from "./pages/Dashboard";
import Graph from "./pages/Graph";
import Login from "./pages/Login";
import Outputs from "./pages/Outputs";
import Register from "./pages/Register";
import Upload from "./pages/Upload";
import WorkspaceSelect from "./pages/WorkspaceSelect";
import { useAuthStore } from "./store/authStore";
import { useKnowledgeStore } from "./store/knowledgeStore";
import { cn } from "./utils/cn";

type PageKey = "dashboard" | "upload" | "graph" | "assistant" | "outputs" | "settings";

const navItems: Array<{ key: PageKey; label: string; icon: LucideIcon }> = [
  { key: "dashboard", label: "工作台", icon: Home },
  { key: "upload", label: "知识导入", icon: FileUp },
  { key: "graph", label: "知脉星图", icon: GitBranch },
  { key: "assistant", label: "知源 Copilot", icon: Bot },
  { key: "outputs", label: "成果工坊", icon: Layers3 },
];

function App() {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [authPage, setAuthPage] = useState<"login" | "register">("login");
  const [pointer, setPointer] = useState({ x: 50, y: 12 });
  const { currentUser, currentWorkspace, logout, clearWorkspaceSelection } = useAuthStore();
  const { canEditCurrentWorkspace } = useKnowledgeStore();
  const canAccessAdminPanel = currentUser?.role === "admin" && currentUser.canAccessAdminPanel !== false;

  const availableNavItems = navItems.filter((item) => canEditCurrentWorkspace || (item.key !== "upload" && item.key !== "outputs"));
  const visualClassByPage: Record<PageKey, string> = {
    dashboard: "visual-dashboard",
    upload: "visual-workbench",
    graph: "visual-graph",
    assistant: "visual-copilot",
    outputs: "visual-workbench",
    settings: "visual-admin",
  };

  const currentPage = useMemo(() => {
    switch (page) {
      case "upload":
        return canEditCurrentWorkspace ? <Upload onOpenGraph={() => setPage("graph")} onOpenAssistant={() => setPage("assistant")} /> : <Graph onOpenAssistant={() => setPage("assistant")} />;
      case "graph":
        return <Graph onOpenAssistant={() => setPage("assistant")} />;
      case "assistant":
        return <Assistant />;
      case "outputs":
        return <Outputs />;
      case "settings":
        return canAccessAdminPanel ? <AdminSettings /> : <Dashboard onNavigate={setPage} />;
      default:
        return <Dashboard onNavigate={setPage} />;
    }
  }, [canAccessAdminPanel, canEditCurrentWorkspace, page]);

  if (!currentUser) {
    return authPage === "register" ? <Register onLogin={() => setAuthPage("login")} /> : <Login onRegister={() => setAuthPage("register")} />;
  }
  if (!currentWorkspace) return <WorkspaceSelect onEnter={() => setPage("dashboard")} />;

  return (
    <main
      className={cn("app-viewport relative min-h-screen w-full max-w-full overflow-x-hidden bg-[var(--page-bg)] text-[var(--text-secondary)]", visualClassByPage[page])}
      style={{ "--mx": `${pointer.x}%`, "--my": `${pointer.y}%` } as CSSProperties}
      onPointerMove={(event) => {
        setPointer({
          x: Math.round((event.clientX / Math.max(1, window.innerWidth)) * 100),
          y: Math.round((event.clientY / Math.max(1, window.innerHeight)) * 100),
        });
      }}
    >
      <div className="cosmic-backdrop" />
      <div className="aurora-layer" />
      <div className="noise-layer" />

      <header className="sticky top-0 z-40 px-3 pt-3 md:px-6">
        <div className="topbar-glass app-topbar mx-auto max-w-[1500px] px-3 py-2 md:px-4">
          <div className="topbar-left">
            <button
              type="button"
              onClick={() => setPage("dashboard")}
              className="brand-pill group flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-left shadow-soft transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_0_28px_var(--glow-accent)]">
                <DatabaseZap className="h-4 w-4" />
              </span>
              <span className="hidden sm:block">
                <span className="block text-[13px] font-semibold tracking-[0.16em] text-[var(--text-secondary)]">ZHIMAI AI</span>
                <span className="block text-[11px] text-[var(--text-faint)]">个人知识图谱工作台</span>
              </span>
            </button>

            <nav className="nav-glass flex min-w-0 items-center gap-1 rounded-full border border-[var(--border-subtle)] p-1">
              {availableNavItems.map((item) => {
                const Icon = item.icon;
                const active = item.key === page;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPage(item.key)}
                    className={cn(
                      "nav-tab flex items-center gap-2 rounded-full px-3 py-2 text-sm text-[var(--text-muted)] md:px-3.5",
                      active && "is-active bg-[var(--selected-bg)] text-[var(--accent)] shadow-[0_0_24px_var(--glow-accent)]",
                      !active && "hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
                    )}
                    title={item.label}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="nav-label">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="topbar-center">
            <WorkspaceBadge compact />
          </div>

          <div className="topbar-right">
            <AiModeBadge compact />
            <button type="button" onClick={clearWorkspaceSelection} className="btn-secondary px-3 py-2" title="切换知识空间">
              <UsersRound className="h-4 w-4" />
              <span className="hidden xl:inline">空间</span>
            </button>
            {canAccessAdminPanel && (
              <button type="button" onClick={() => setPage("settings")} className="btn-secondary px-3 py-2" title="设置 / 管理后台">
                <Settings className="h-4 w-4" />
                <span className="hidden xl:inline">设置</span>
              </button>
            )}
            <button type="button" onClick={logout} className="btn-secondary px-3 py-2" title="退出登录">
              <LogOut className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setPage("graph")} className="btn-primary px-4 py-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden xl:inline">打开星图</span>
            </button>
          </div>
        </div>
      </header>

      <div key={`${currentWorkspace.id}-${page}`} className="page-transition relative z-10">
        {currentPage}
      </div>
    </main>
  );
}

export default App;
