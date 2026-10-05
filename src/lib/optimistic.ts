import { toast } from "sonner";

/**
 * Fire a Supabase write in the background without blocking the UI.
 *
 * The calling code should already have updated local React state optimistically,
 * so the change shows on screen immediately. This sends the write to the DB and,
 * only if it fails, calls `onError` (usually a reload) to reconcile back to the
 * server's truth. Removes the perceived latency of the DB round-trip.
 */
export function bgWrite(op: PromiseLike<{ error: unknown }>, onError?: () => void) {
  Promise.resolve(op).then(
    (res) => {
      if (res && res.error) {
        console.error("[nestly] background write failed", res.error);
        failed();
        onError?.();
      }
    },
    (err) => {
      console.error("[nestly] background write threw", err);
      failed();
      onError?.();
    }
  );
}

// The screen already showed the change, so a failure has to be said out loud —
// otherwise the row just quietly snaps back on the next refresh. One id, so a
// burst of failures (offline) is one toast, not a stack.
function failed() {
  toast.error("השינוי לא נשמר", { id: "bg-write-failed", description: "בדקו את החיבור — מציגים שוב את המצב השמור." });
}

/** A client-side UUID for optimistic inserts (so the row has a stable id before the DB confirms). */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "tmp-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
