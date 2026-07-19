import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600 ${className}`}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/60 px-6 py-12 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="font-medium text-slate-600">{title}</p>
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-slate-50 p-5 sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-200">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
