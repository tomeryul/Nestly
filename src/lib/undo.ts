import { toast } from "sonner";

type Result = { error: unknown } | void | null | undefined;

/**
 * Delete now, offer Undo for a few seconds.
 *
 * Nothing in Nestly asks "are you sure?" — a dialog on every delete is friction
 * on the 99% of deletes that were meant. So the delete happens at once (on
 * screen and in the database, so no refresh, realtime echo or second phone can
 * bring it back), and the toast's Undo writes the snapshot back. The caller
 * captures whatever the delete cascades over (subtasks, completions) in
 * `remove` and puts it back in `restore`.
 */
export function removeWithUndo(opts: {
  /** What went, in a few words: "המוצר נמחק". */
  message: string;
  /** Which one — usually its name. */
  description?: string;
  /** The database delete. Runs immediately; may first snapshot child rows. */
  remove: () => PromiseLike<Result>;
  /** Put the rows back on screen. Runs the instant Undo is pressed. */
  undoLocal: () => void;
  /** Put the rows back in the database. */
  restore: () => PromiseLike<Result>;
  /** Re-read the server's truth if anything failed. */
  reload: () => void;
}) {
  const removed = Promise.resolve()
    .then(opts.remove)
    .then(
      (r) => {
        if (r && r.error) throw r.error;
      },
      (e) => {
        throw e;
      },
    )
    .catch((e) => {
      console.error("[nestly] delete failed", e);
      toast.error("המחיקה לא נשמרה", { description: "בדקו את החיבור ונסו שוב." });
      opts.reload();
      return "failed" as const;
    });

  toast(opts.message, {
    description: opts.description,
    duration: 5000,
    action: {
      label: "ביטול",
      onClick: () => {
        opts.undoLocal();
        // The restore must land after the delete, or the delete would win.
        removed
          .then((state) => (state === "failed" ? undefined : opts.restore()))
          .then((r) => {
            if (r && r.error) throw r.error;
          })
          .catch((e) => {
            console.error("[nestly] undo failed", e);
            toast.error("לא הצלחנו לשחזר");
            opts.reload();
          });
      },
    },
  });
}

/** `list` with `rows` back where they were (or at the end), skipping any already there. */
export function reinsert<T extends { id: string }>(list: T[], rows: T[], index = list.length): T[] {
  const missing = rows.filter((r) => !list.some((x) => x.id === r.id));
  if (!missing.length) return list;
  const next = [...list];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, ...missing);
  return next;
}
