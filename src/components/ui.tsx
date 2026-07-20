import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-5 w-5 animate-spin rounded-full border-2 border-t-transparent ${className}`}
      style={{ borderColor: "var(--border-2)", borderTopColor: "var(--accent)" }}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="empty-state">
      {icon && <div className="icon">{icon}</div>}
      <p style={{ color: "var(--text-3)", fontWeight: 600 }}>{title}</p>
      {hint && <p style={{ fontSize: 13 }}>{hint}</p>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portal to <body> so the sheet escapes the app's stacking context and sits
  // above the bottom nav (otherwise the last field / save button is hidden).
  return createPortal(
    <div className="nst-modal-bg" dir="rtl" onClick={onClose}>
      <div className="nst-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nst-modal-head">
          <h3>{title}</h3>
          <button className="nst-del" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
