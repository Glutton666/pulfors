---
name: GitHub workflow editing restriction
description: Replit 환경에서만 .github/workflows 파일을 수정하지 않는다 — Replit의 GitHub 연결에 workflow 권한이 없기 때문.
---

**Replit 환경에서는** `.github/workflows` 파일을 만들거나 수정하지 않는다. 사용자의 로컬 PC(Windows)에서는 이 제한이 적용되지 않는다.

**Why:** Replit이 GitHub에 push할 때 쓰는 OAuth 앱에는 `workflow` 권한이 없다. 워크플로 파일이 포함된 커밋은 push 전체가 거절되어(`refusing to allow an OAuth App to create or update workflow ... without workflow scope`), 2026-11-15에 커밋을 하나로 합쳐 파일을 빼고 올려야 했다. 이 제한 자체가 커밋 크기를 보장하지는 않는다. 큰 커밋을 피하려면 작업 단위마다 push한다.

**How to apply:** Replit 작업에서는 워크플로 변경을 제외하고 기존 파일을 보존한다. 워크플로 변경이 필요하면 사용자에게 알려 로컬 PC에서 커밋·push하도록 한다. 로컬 PC 세션은 워크플로 파일을 정상적으로 수정할 수 있다.
