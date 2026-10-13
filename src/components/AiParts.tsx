import { useCallback, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";

/**
 * Pieces every AI feature shares: the AI only proposes, the person picks what
 * to keep, and only that is written.
 */

/** Which proposed items were left out, by key. */
export function usePicks() {
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const toggle = useCallback(
    (key: string) =>
      setSkipped((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const reset = useCallback((leaveOut: string[] = []) => setSkipped(new Set(leaveOut)), []);
  return { kept: (key: string) => !skipped.has(key), toggle, reset };
}

/** One proposed item: the whole row toggles whether it is kept. */
export function PickRow({ kept, onToggle, title, tags }: { kept: boolean; onToggle: () => void; title: string; tags?: ReactNode }) {
  return (
    <button className="nst-row qa-row" aria-pressed={kept} onClick={onToggle}>
      <span className={`nst-check ${kept ? "on" : ""}`} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="qa-row-body">
        <span className="qa-row-title">{title}</span>
        {tags && <span className="nst-meta">{tags}</span>}
      </span>
    </button>
  );
}

/** The ✨ button that starts an AI action. */
export function AiButton({ busy, onClick, children, busyLabel = "חושב…", block, disabled }: {
  busy?: boolean;
  onClick: () => void;
  children: ReactNode;
  busyLabel?: string;
  block?: boolean;
  disabled?: boolean;
}) {
  return (
    <button className={`btn btn-sm nst-ai-btn ${block ? "btn-block" : ""}`} onClick={onClick} disabled={busy || disabled} aria-busy={busy}>
      <Sparkles size={15} className={busy ? "nst-ai-pulse" : undefined} /> {busy ? busyLabel : children}
    </button>
  );
}
