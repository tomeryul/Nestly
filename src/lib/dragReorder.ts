import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { haptic } from "./motion";

/**
 * Drag-to-reorder for vertical lists.
 *
 * Usage:
 *   const dr = useDragReorder(items, (ids) => persistOrder(ids));
 *   dr.order.map(id => itemsById[id]) // render in this order
 *   <div ref={dr.setItemRef(id)} {...dr.handleProps(id)} style={dr.itemStyle(id)} />
 *
 * Two things make this read as picking a row up rather than watching a list
 * shuffle: the dragged row tracks the finger one-to-one, including while the
 * rows underneath it reflow, and the rows it displaces slide to their new
 * places instead of teleporting.
 */
export function useDragReorder<T extends { id: string }>(items: T[], onCommit: (orderedIds: string[]) => void) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const orderRef = useRef(order);
  orderRef.current = order;
  const draggingRef = useRef<string | null>(null);
  const didMoveRef = useRef(false);
  const refs = useRef(new Map<string, HTMLElement>());
  /** Finger position and the row's position when it was picked up. */
  const grab = useRef<{ startY: number; startTop: number; y: number } | null>(null);
  /** FLIP: where every row sat just before the order changed. */
  const firstTops = useRef(new Map<string, number>());
  const gentle = useRef(false);
  /** The pending FLIP frame, so a release can cancel it before it undoes cleanup. */
  const flipFrame = useRef(0);

  // Keep local order synced with incoming items, but never while dragging.
  useEffect(() => {
    if (draggingRef.current) return;
    const next = items.map((i) => i.id);
    setOrder((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
  }, [items]);

  const setItemRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) refs.current.set(id, el);
      else refs.current.delete(id);
    },
    []
  );

  /**
   * Pin the dragged row under the finger. Its slot moves as the list reorders
   * around it, so the offset is measured against where layout puts it *now*
   * rather than accumulated — that is what keeps it from drifting.
   */
  const track = useCallback(() => {
    const id = draggingRef.current;
    const g = grab.current;
    if (!id || !g) return;
    const el = refs.current.get(id);
    if (!el) return;
    el.style.transform = "";
    const layoutTop = el.getBoundingClientRect().top;
    const dy = g.startTop + (g.y - g.startY) - layoutTop;
    el.style.transform = `translateY(${dy}px) scale(1.02)`;
    el.dataset.lifted = "true";
  }, []);

  const reorderTo = useCallback((id: string, y: number) => {
    const cur = [...orderRef.current];
    const from = cur.indexOf(id);
    if (from < 0) return;
    let to = cur.length;
    for (let i = 0; i < cur.length; i++) {
      const el = refs.current.get(cur[i]);
      if (!el || cur[i] === id) continue; // the dragged row is under the finger, not in the queue
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        to = i;
        break;
      }
    }
    cur.splice(from, 1);
    const adj = to > from ? to - 1 : to;
    if (adj === from) return;
    cur.splice(adj, 0, id);
    // Remember where everyone was, so the layout effect can slide them from here.
    firstTops.current.clear();
    for (const [key, el] of refs.current) {
      if (key === id) continue;
      firstTops.current.set(key, el.getBoundingClientRect().top);
    }
    orderRef.current = cur;
    didMoveRef.current = true;
    setOrder(cur);
  }, []);

  // Runs after the reordered list has been laid out but before it is painted,
  // which is the only moment the "from" and "to" positions both exist.
  useLayoutEffect(() => {
    const id = draggingRef.current;
    if (!id) return;
    const first = firstTops.current;
    if (first.size && !gentle.current) {
      const moved: HTMLElement[] = [];
      for (const [key, el] of refs.current) {
        const prev = first.get(key);
        if (key === id || prev == null) continue;
        const delta = prev - el.getBoundingClientRect().top;
        if (!delta) continue;
        el.style.transition = "none";
        el.style.transform = `translateY(${delta}px)`;
        moved.push(el);
      }
      if (flipFrame.current) cancelAnimationFrame(flipFrame.current);
      flipFrame.current = requestAnimationFrame(() => {
        flipFrame.current = 0;
        for (const el of moved) {
          el.style.transition = "transform 200ms var(--ease-in-out)"; // movement on screen
          el.style.transform = "";
        }
      });
    }
    first.clear();
    track();
  }, [order, track]);

  const handleProps = useCallback(
    (id: string) => {
      // The handle uses touch-action:none so the browser never turns the drag
      // into a page-scroll; we own the whole gesture from pointerdown.
      const onPointerDown = (e: ReactPointerEvent) => {
        // A second finger arriving mid-drag would make the row jump.
        if (draggingRef.current) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const el = refs.current.get(id);
        if (!el) return;
        e.preventDefault();
        const target = e.currentTarget as HTMLElement;
        try {
          target.setPointerCapture(e.pointerId);
        } catch {
          /* older browsers */
        }
        draggingRef.current = id;
        didMoveRef.current = false;
        gentle.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        grab.current = { startY: e.clientY, startTop: el.getBoundingClientRect().top, y: e.clientY };
        setDraggingId(id);
        haptic(10);
        track();

        let frame = 0;
        const move = (ev: PointerEvent) => {
          ev.preventDefault();
          if (!grab.current) return;
          grab.current.y = ev.clientY;
          if (frame) return; // one read/write pass per frame, never per event
          frame = requestAnimationFrame(() => {
            frame = 0;
            const g = grab.current;
            if (!g) return;
            track();
            reorderTo(id, g.y);
          });
        };
        const finish = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", finish);
          if (frame) cancelAnimationFrame(frame);
          // A FLIP frame still queued here would re-apply inline styles right
          // after the cleanup below wiped them, and the next drag would read a
          // stale rect and lag the finger.
          if (flipFrame.current) {
            cancelAnimationFrame(flipFrame.current);
            flipFrame.current = 0;
          }
          draggingRef.current = null;
          grab.current = null;
          firstTops.current.clear();
          // Drop the row into its slot rather than leaving it under the finger.
          for (const node of refs.current.values()) {
            node.style.transition = "";
            node.style.transform = "";
            delete node.dataset.lifted;
          }
          setDraggingId(null);
          if (didMoveRef.current) onCommit(orderRef.current);
        };
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
      };
      return { onPointerDown, style: { touchAction: "none" } as CSSProperties };
    },
    [onCommit, reorderTo, track]
  );

  // The transform belongs to the gesture and is written directly to the node;
  // everything else about the lifted state is ordinary React.
  const itemStyle = useCallback(
    (id: string): CSSProperties =>
      draggingId === id
        ? { boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18))", borderRadius: "var(--radius)", position: "relative", zIndex: 5, cursor: "grabbing" }
        : {},
    [draggingId]
  );

  return { order, draggingId, setItemRef, handleProps, itemStyle };
}
