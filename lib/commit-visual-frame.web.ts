// react-dom is already an app dependency; keep the web-only boundary typed
// without adding its otherwise unused declaration package to native builds.
const { flushSync } = require("react-dom") as { flushSync: (commit: () => void) => void };

/** Commit during this rAF, not a concurrent React task after this frame's paint. */
export function commitVisualFrame(commit: () => void) {
  flushSync(commit);
}