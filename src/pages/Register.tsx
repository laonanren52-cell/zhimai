import { ArrowLeft, DatabaseZap, FolderKanban, Loader2, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";
import { AuthGlassCard, AuthVisualShell, LiquidInput, MagneticButton } from "../components/common/AuthVisualShell";
import { useAuthStore } from "../store/authStore";

interface RegisterProps {
  onLogin: () => void;
}

const features = [
  {
    title: "个人空间",
    detail: "注册后自动创建你的个人知识空间，资料与成果默认私有。",
    icon: FolderKanban,
  },
  {
    title: "星图沉淀",
    detail: "上传资料后抽取节点、关系和来源片段，持续增长知识资产。",
    icon: Sparkles,
  },
  {
    title: "权限隔离",
    detail: "普通用户不会获得管理员权限，也不能覆盖系统管理员账号。",
    icon: ShieldCheck,
  },
];

export default function Register({ onLogin }: RegisterProps) {
  const { register, authError, clearError } = useAuthStore();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    clearError();
    setLocalError(null);
    const normalizedUsername = username.trim().toLowerCase();
    if (username.trim().length < 2) {
      setLocalError("用户名至少需要 2 个字符。");
      return;
    }
    if (normalizedUsername === "admin") {
      setLocalError("admin 为系统管理员账号，不能用于注册。");
      return;
    }
    if (email.trim().length < 3) {
      setLocalError("请输入邮箱或账号。");
      return;
    }
    if (password.length < 6) {
      setLocalError("密码至少需要 6 位。");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    try {
      await register(username, email, password);
    } catch {
      // The auth store already exposes a user-facing error message.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthVisualShell
      kicker="Create Workspace Account"
      title="注册知识空间账号"
      subtitle="创建你的个人知识星图，用来源片段、节点关系和成果沉淀组织长期知识资产。"
      features={features}
    >
      <AuthGlassCard>
        <form
          className="auth-form"
          aria-busy={submitting}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="auth-card-header">
            <span className="auth-logo-orb">
              <DatabaseZap className="h-6 w-6" />
            </span>
            <div>
              <p className="auth-card-kicker">Private Graph Space</p>
              <h2>创建账号</h2>
            </div>
          </div>

          <div className="auth-field-stack">
            <LiquidInput
              label="用户名"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
            />
            <LiquidInput label="邮箱或账号" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            <LiquidInput label="密码" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" />
            <LiquidInput
              label="确认密码"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </div>

          {(localError || authError) && (
            <p className="auth-error" role="alert">
              {localError || authError}
            </p>
          )}

          <MagneticButton type="submit" loading={submitting} className="mt-7">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {submitting ? "注册中" : "注册并进入空间"}
          </MagneticButton>

          <div className="auth-card-links justify-center">
            <button
              type="button"
              onClick={() => {
                clearError();
                setLocalError(null);
                onLogin();
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              已有账号登录
            </button>
          </div>
        </form>
      </AuthGlassCard>
    </AuthVisualShell>
  );
}
