import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useFlip } from "./flip";

/** How long the hand has to rest before ticked rows move. */
const SETTLE_MS = 900;

/**
 * Done rows sink to the bottom of their list — but not the instant they are
 * ticked. A ticked row stays where it is, showing its tick, until the person
 * stops ticking; then everything ticked glides down together. Moving each row
 * the moment it was ticked would hide the tick and slide the next row out from
 * under the finger.
 *
 *   const dl = useDoneLast(listRef);
 *   const shown = useMemo(() => dl.sort(tasks, (t) => t.id, (t) => t.is_done), [tasks, dl.sort]);
 *   onClick={() => { dl.ticked(t.id, t.is_done); onToggle(t); }}
 *   rows carry data-flip={t.id} inside listRef
 */
export function useDoneLast(listRef: RefObject<HTMLElement>) {
  const flip = useFlip(listRef);
  // id → whether the row is still *shown* among the done ones.
  const [held, setHeld] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const shownDone = useCallback((id: string, done: boolean) => held.get(id) ?? done, [held]);

  /** Call as a row is ticked or unticked, with its done state *before* the change. */
  const ticked = useCallback(
    (id: string, wasDone: boolean) => {
      setHeld((prev) => {
        const next = new Map(prev);
        const shownIn = prev.get(id) ?? wasDone;
        if (shownIn === !wasDone) next.delete(id); // ticked straight back: it never moved
        else next.set(id, shownIn);
        return next;
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        flip();
        setHeld(new Map());
      }, SETTLE_MS);
    },
    [flip],
  );

  /** Let one row move now rather than wait (it was asked for by name, say). */
  const release = useCallback(
    (id: string) => {
      flip();
      setHeld((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    [flip],
  );

  /** `list` with its done rows after the rest, each part in its own order. */
  const sort = useCallback(
    <T,>(list: T[], key: (t: T) => string, done: (t: T) => boolean): T[] => {
      const open: T[] = [];
      const closed: T[] = [];
      for (const t of list) (shownDone(key(t), done(t)) ? closed : open).push(t);
      return open.length && closed.length ? [...open, ...closed] : list;
    },
    [shownDone],
  );

  return { flip, ticked, release, shownDone, sort };
}
