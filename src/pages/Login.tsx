import { ArrowRight, DatabaseZap, KeyRound, Loader2, LogIn, Network, Settings2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AuthGlassCard, AuthVisualShell, LiquidInput, MagneticButton } from "../components/common/AuthVisualShell";
import { useAuthStore } from "../store/authStore";

interface LoginProps {
  onRegister: () => void;
}

const features = [
  {
    title: "知识空间",
    detail: "个人星图与管理员共享星图分层管理，资料权限边界清晰。",
    icon: Network,
  },
  {
    title: "来源可信",
    detail: "每次问答、总结和成果生成都回到真实片段与节点关系。",
    icon: ShieldCheck,
  },
  {
    title: "管理后台",
    detail: "成员、访问日志、共享星图和系统配置统一管理。",
    icon: Settings2,
  },
];

export default function Login({ onRegister }: LoginProps) {
  const { login, authError, clearError } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    clearError();
    setLocalError(null);
    if (!username.trim()) {
      setLocalError("请输入账号或邮箱。");
      return;
    }
    if (!password) {
      setLocalError("请输入密码。");
      return;
    }

    setSubmitting(true);
    try {
      await login(username, password);
    } catch {
      // The auth store already exposes a user-facing error message.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthVisualShell
      kicker="ZHIMAI AI · Private Knowledge Graph"
      title="登录知脉 AI"
      subtitle="进入你的个人知识星图工作台，把资料、项目、问题和成果沉淀成可追溯的知识资产。"
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
              <p className="auth-card-kicker">Secure Workspace</p>
              <h2>账号登录</h2>
            </div>
          </div>

          <div className="auth-field-stack">
            <LiquidInput
              label="邮箱 / 账号"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
            />
            <LiquidInput
              label="密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>

          {(localError || authError) && (
            <p className="auth-error" role="alert">
              {localError || authError}
            </p>
          )}

          <MagneticButton type="submit" loading={submitting} className="mt-7">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {submitting ? "登录中" : "登录知脉 AI"}
          </MagneticButton>

          <div className="auth-card-links">
            <button
              type="button"
              onClick={() => {
                clearError();
                setLocalError(null);
                onRegister();
              }}
            >
              新用户注册
              <ArrowRight className="h-4 w-4" />
            </button>
            <button type="button" aria-label="忘记密码，当前版本为占位入口">
              <KeyRound className="h-4 w-4" />
              忘记密码
            </button>
          </div>
        </form>
      </AuthGlassCard>
    </AuthVisualShell>
  );
}
