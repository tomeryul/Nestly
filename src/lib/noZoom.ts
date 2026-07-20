// Disable user zoom on touch devices (esp. iOS Safari, which ignores
// `user-scalable=no` in a browser tab):
//  - double-tap zoom → CSS `touch-action: manipulation` (see index.css); this
//    intentionally does NOT block rapid taps on buttons.
//  - focus zoom       → CSS 16px inputs + viewport meta.
//  - pinch zoom       → the gesture / multi-touch handlers below.
export function installNoZoom() {
  const prevent = (e: Event) => e.preventDefault();

  // iOS Safari pinch gestures
  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("gesturechange", prevent, { passive: false });
  document.addEventListener("gestureend", prevent, { passive: false });

  // Two-finger pinch (non-Safari touch engines)
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
