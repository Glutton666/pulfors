---
name: import type erases runtime values — React Compiler {} crash
description: Function accidentally placed in `import type {}` becomes undefined at runtime; React Compiler wraps the error as an empty object {}.
---

## The rule

Never put runtime values (functions, classes, constants) inside an `import type { }` block.

**Why:** TypeScript erases all `import type` declarations at compile time. If a function is listed under `import type { }`, it becomes `undefined` at runtime. When React Compiler (transform.reactCompiler=true) optimizes the component and encounters a call to `undefined()`, it throws an internal invariant — serialized as `{}` by the ErrorBoundary — instead of a normal TypeError with a readable message.

**How to apply:** Any time you add a new import from a module that already has an `import type { }` block, check whether your new export is a value (function/const/class) or a pure type (interface/type alias). Values go into a regular `import { }` line; types go into `import type { }`. The error is especially deceptive because TypeScript may not warn (the symbol can exist as both a type and a value in the source), and the runtime crash shows `[error-tracking] {}` with no message — not "is not a function".
