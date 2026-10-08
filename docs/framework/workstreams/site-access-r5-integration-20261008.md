# Site Access R5 Integration (2026-10-08)

Base: 37f84193cb7024af6de9ded16db5b70a999f6c61; original PR: #7; original branch head: 935dcb2a28560c0dc429e3b30aeb807297dfabf7.

R5/ R4.1 / D1 merged without overwriting existing controls, source-only draft import, task state, ScriptEditor or page-dependencies. The optional one-time HTTP/HTTPS grant is available under Developer > Advanced > Site Access. Cookie and notification permissions require explicit separate selections. Chrome remains permission source of truth. All requests originate from actual trusted clicks; no permission bypass.

Preserved PR #7 scripts, modular controller, tests and permission ADR. Uses one transient integration branch and PR. No second repository, no new dependency. Production compilation and isolated UI/permission regressions must pass before merge. Real Chrome/CFT fresh-profile/restart/revocation and formal F3 remain NATIVE_NOT_TESTED.
