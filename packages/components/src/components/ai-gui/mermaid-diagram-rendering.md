# Mermaid diagram rendering

Streamdown renders the diagram; `markdown-renderer.tsx` decides what a diagram in
a message may do, and `mermaid-diagram-viewer.tsx` owns the full-screen surface.
Binding rules live in [AGENTS.md](AGENTS.md); this file holds the invariants and
why they read the way they do. Coverage:
`tests/markdown-mermaid-fullscreen.test.tsx`.

## A diagram in a message is a still preview

- It NEVER captures or cancels a scroll. Streamdown wraps every diagram in a
  pan/zoom canvas that listens for `wheel` non-passively and calls
  `preventDefault()` on each one, so a page scroll passing under a diagram became
  a zoom. `controls.mermaid.panZoom: false` only hides that canvas's buttons — the
  listener stays — so `markdown-renderer.tsx` takes the gesture in the capture
  phase above the canvas and hands it back to the page.
- The interceptor must not call `preventDefault()`; the browser's own scrolling is
  the behaviour being restored. It re-dispatches an uncancelable copy from the
  markdown root, because `stopPropagation()` alone would also hide the gesture
  from the conversation's wheel listeners further up — releasing stick-to-bottom
  (`use-sticky-scroll.ts`) and abandoning an outline jump (`view.tsx`).
- The same canvas claims touch and the cursor through inline styles.
  `MARKDOWN_BASE_CLASSNAME` overrides all three with `!important`: an automatic
  `touch-action`, so a finger resting on a diagram still scrolls the conversation;
  no transform, so a stray drag cannot leave the preview displaced inside its own
  frame; and a `zoom-in` cursor for the click that opens the viewer.
- Streamdown owns the markup, so the click target and its `role`/`tabindex` are
  applied by a `MutationObserver` — a diagram appears only after the lazily
  imported runtime resolves, long after the component commits. The block's own
  copy/download controls stay reachable without hover.

## The viewer is the only canvas

- It replaces Streamdown's own full-screen overlay (`controls.mermaid.fullscreen`
  stays off), whose only exit sat at a raw `top-4 right-4` — inside a phone's
  status-bar inset — while its content layer covered the backdrop and swallowed
  every tap, leaving a touch user no way out.
- Controls are at least 44px and padded by the `--safe-area-*` variables, never at
  a fixed viewport offset. There is always more than one exit: the close button, a
  click off the diagram, and Escape. Stacking comes from `--z-image-viewer`, so a
  diagram opened inside a dialog lands above that dialog.
- A diagram that does not fit opens at NATURAL size and is panned. Scaling an
  agent's sequence diagram down to a phone screen turns readable labels into a
  grey texture; only a diagram that already fits is scaled up.
- A trackpad pinch arrives as a ctrl-modified `wheel`, which Chromium would spend
  on zooming the whole window, so the viewer takes that default and zooms the
  diagram around the pointer instead. The anchored point is restored by scrolling
  the surface, measured from the diagram's own box: the surface centres a diagram
  that fits, and that offset is not proportional to the zoom.
- Plain wheel and touch panning stay with the surface's own scrolling. A pan
  driven from pointer deltas cannot reproduce touch momentum or rubber-banding, so
  only a held mouse or pen button pans by hand, and a release that moved the
  diagram does not read as the click off the diagram that closes the viewer.
- Two-finger pinch on a touch screen is deliberately absent: implementing it means
  taking `touch-action` from the browser and reimplementing inertial panning.
  Touch zooms with the control bar's buttons instead.
