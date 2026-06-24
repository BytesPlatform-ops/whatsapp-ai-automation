**Implement this task safely** in the Pixie backend. We work in `backend/` on the **shared
`my-future-work` branch** with another developer.

## Task
$ARGUMENTS

## Rules
1. **First inspect related files** (the schema, the orchestrator path, the model layer, tests).
2. **Make a short plan** before editing.
3. **Make minimal changes** — touch as few files as possible.
4. **Preserve existing behavior** (API contracts, the `Site` JSON shape, business logic).
5. **Run available validation commands** — `pytest -q`, `python -m py_compile <file>`,
   `node --check bridge/render_site.js`.
6. **Use specialist agents where useful** (backend-api, ai-prompt-engineer, database-prisma,
   qa-tester, code-reviewer).
7. Since we **share a branch**, **prefer creating new files** and **warn before touching files
   the other developer owns** (check `git status` first).
8. Do not change schema, delete files, commit, push, or install packages without approval.

## End with
- **Summary**
- **Files changed**
- **Tests** (commands run + result)
- **Risks**
