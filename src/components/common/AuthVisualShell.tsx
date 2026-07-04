import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useRef, type ComponentType } from "react";
import LiquidAuroraBackground from "./LiquidAuroraBackground";
import { cn } from "../../utils/cn";

type IconComponent = ComponentType<{ className?: string }>;

export interface AuthFeature {
  title: string;
  detail: string;
  icon: IconComponent;
}

interface AuthVisualShellProps {
  kicker: string;
  title: string;
  subtitle: string;
  features: AuthFeature[];
  children: ReactNode;
}

export function AuthVisualShell({ kicker, title, subtitle, features, children }: AuthVisualShellProps) {
  return (
    <main className="visual-auth auth-page auth-liquid-page thin-scrollbar relative min-h-screen overflow-hidden bg-[var(--page-bg)] px-4 py-6 text-[var(--text-secondary)] md:px-8">
      <LiquidAuroraBackground showCursor />
      <section className="auth-liquid-shell relative z-10 mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,460px)] lg:items-center">
        <div className="auth-copy fade-in">
          <p className="auth-kicker">{kicker}</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          <div className="auth-feature-grid">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article key={feature.title} className="auth-feature-card liquid-card">
                  <span className="auth-feature-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h2>{feature.title}</h2>
                    <p>{feature.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="auth-card-stage">{children}</div>
      </section>
    </main>
  );
}

interface LiquidInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function LiquidInput({ className, label, value, ...props }: LiquidInputProps) {
  return (
    <label className="liquid-field">
      <input {...props} value={value} className={cn("auth-line-input", className)} placeholder=" " />
      <span>{label}</span>
    </label>
  );
}

interface AuthGlassCardProps {
  children: ReactNode;
  className?: string;
}

export function AuthGlassCard({ children, className }: AuthGlassCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={cardRef}
      className={cn("auth-liquid-card", className)}
      onPointerMove={(event) => {
        const card = cardRef.current;
        if (!card || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const rect = card.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const rotateY = ((x / rect.width) - 0.5) * 7;
        const rotateX = ((0.5 - y / rect.height) * 7);
        card.style.setProperty("--card-tilt-x", `${rotateX}deg`);
        card.style.setProperty("--card-tilt-y", `${rotateY}deg`);
        card.style.setProperty("--card-glow-x", `${x}px`);
        card.style.setProperty("--card-glow-y", `${y}px`);
      }}
      onPointerLeave={() => {
        const card = cardRef.current;
        if (!card) return;
        card.style.setProperty("--card-tilt-x", "0deg");
        card.style.setProperty("--card-tilt-y", "0deg");
      }}
    >
      {children}
    </section>
  );
}

interface MagneticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function MagneticButton({ children, className, disabled, loading, onPointerLeave, onPointerMove, ...props }: MagneticButtonProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  return (
    <button
      {...props}
      ref={buttonRef}
      disabled={disabled || loading}
      className={cn("auth-magnetic-button", className)}
      onPointerMove={(event) => {
        const button = buttonRef.current;
        if (button && !disabled && !loading && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
          const rect = button.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          button.style.setProperty("--magnet-x", `${(x - rect.width / 2) * 0.12}px`);
          button.style.setProperty("--magnet-y", `${(y - rect.height / 2) * 0.16}px`);
          button.style.setProperty("--shine-x", `${x}px`);
          button.style.setProperty("--shine-y", `${y}px`);
        }
        onPointerMove?.(event);
      }}
      onPointerLeave={(event) => {
        const button = buttonRef.current;
        if (button) {
          button.style.setProperty("--magnet-x", "0px");
          button.style.setProperty("--magnet-y", "0px");
        }
        onPointerLeave?.(event);
      }}
    >
      <span className={cn("auth-button-content", loading && "is-loading")}>{children}</span>
    </button>
  );
}
