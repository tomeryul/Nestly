import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

/**
 * Long-press drag-to-reorder for vertical lists.
 *
 * Usage:
 *   const dr = useDragReorder(items, (ids) => persistOrder(ids));
 *   dr.order.map(id => itemsById[id]) // render in this order
 *   <div ref={dr.setItemRef(id)} {...dr.handleProps(id)} style={dr.itemStyle(id)} />
 *
 * The handle gets `touch-action: pan-y`, so the list still scrolls normally;
 * a stationary long-press (≈200ms) begins a drag instead.
 */
export function useDragReorder<T extends { id: string }>(items: T[], onCommit: (orderedIds: string[]) => void) {
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const orderRef = useRef(order);
  orderRef.current = order;
  const draggingRef = useRef<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());

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

  const reorderTo = useCallback((id: string, y: number) => {
    const cur = [...orderRef.current];
    const from = cur.indexOf(id);
    if (from < 0) return;
    let to = cur.length;
    for (let i = 0; i < cur.length; i++) {
      const el = refs.current.get(cur[i]);
      if (!el) continue;
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
    orderRef.current = cur;
    setOrder(cur);
  }, []);

  const handleProps = useCallback(
    (id: string) => {
      const onPointerDown = (e: ReactPointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const startY = e.clientY;
        let activated = false;

        const activate = () => {
          activated = true;
          draggingRef.current = id;
          setDraggingId(id);
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
        };
        const timer = window.setTimeout(activate, 200);

        const move = (ev: PointerEvent) => {
          if (!activated) {
            if (Math.abs(ev.clientY - startY) > 9) {
              window.clearTimeout(timer);
              cleanup();
            }
            return;
          }
          ev.preventDefault();
          reorderTo(id, ev.clientY);
        };
        const up = () => {
          window.clearTimeout(timer);
          cleanup();
          if (activated) {
            draggingRef.current = null;
            setDraggingId(null);
            onCommit(orderRef.current);
          }
        };
        const cleanup = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
        };
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      };
      return { onPointerDown, style: { touchAction: "pan-y" } as CSSProperties };
    },
    [onCommit, reorderTo]
  );

  const itemStyle = useCallback(
    (id: string): CSSProperties =>
      draggingId === id
        ? { transform: "scale(1.02)", boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,.18))", position: "relative", zIndex: 5, cursor: "grabbing" }
        : {},
    [draggingId]
  );

  return { order, draggingId, setItemRef, handleProps, itemStyle };
}
