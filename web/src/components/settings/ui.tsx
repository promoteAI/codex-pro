import type { ReactNode } from "react";

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[22px] font-semibold text-[#f0f0f0] tracking-tight m-0 mb-1.5">{children}</h2>
  );
}

export function PageSub({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-codex-muted leading-relaxed m-0 mb-5 max-w-[560px]">{children}</p>;
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[13px] font-medium text-[#b8b8b8] tracking-wide mb-2.5 ${className}`}>{children}</div>
  );
}

export function SettingsCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-[#222] border border-[#2e2e2e] rounded-xl overflow-hidden mb-5 ${className}`}>
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  desc,
  children,
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-codex-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-[#e0e0e0] mb-0.5">{label}</div>
        {desc != null && <div className="text-xs text-codex-muted leading-snug">{desc}</div>}
      </div>
      {children != null && <div className="shrink-0 flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="relative w-9 h-5 shrink-0 inline-block cursor-pointer">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-label={label}
      />
      <span className="absolute inset-0 rounded-full bg-[#3a3a3a] transition peer-checked:bg-codex-accent after:content-[''] after:absolute after:h-3.5 after:w-3.5 after:left-[3px] after:bottom-[3px] after:rounded-full after:bg-[#888] after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-white" />
    </label>
  );
}

export function ActionBtn({
  children,
  onClick,
  danger,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-md px-3 py-1.5 text-[12.5px] border whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-[#2a2a2a] disabled:hover:text-[#c0c0c0] ${
        danger
          ? "bg-[#3a1a1a] border-[#5a2a2a] text-[#f87171] hover:bg-[#4a2020]"
          : "bg-[#2a2a2a] border-[#3a3a3a] text-[#c0c0c0] hover:bg-[#323232] hover:text-[#e0e0e0]"
      }`}
    >
      {children}
    </button>
  );
}

export function DropdownBtn({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md px-3 py-1.5 text-[12.5px] text-[#c0c0c0] hover:bg-[#323232] whitespace-nowrap"
    >
      {children}
      <span className="text-[10px] opacity-70">▾</span>
    </button>
  );
}

export function SegGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex bg-[#2a2a2a] border border-[#3a3a3a] rounded-md overflow-hidden">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
            value === o.id ? "bg-[#3a3a3a] text-[#e0e0e0]" : "text-[#999] hover:bg-[#323232] hover:text-[#c0c0c0]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-[15px] font-medium text-[#d4d4d4] mb-2">{title}</div>
      <p className="text-[12.5px] text-codex-muted max-w-sm mb-4">{desc}</p>
      {action}
    </div>
  );
}
