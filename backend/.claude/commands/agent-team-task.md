Act as a **lead engineer managing a specialist Claude Code agent team** for the Pixie backend
(Python/FastAPI). We work in `backend/` on the **shared `my-future-work` branch**.

## Task
$ARGUMENTS

## Process
1. **Inspect the codebase** and understand the task (read the relevant files first).
2. Use **lead-engineer** to create a safe, step-by-step plan with file ownership mapped out.
3. Delegate **frontend** work to **frontend-ui** if needed (UI mostly lives at repo root).
4. Delegate **backend** work to **backend-api** if needed (routes, services, Pydantic, errors).
5. Delegate **database** work to **database-prisma** if needed (Supabase/PostgreSQL).
6. Delegate **AI/prompt** work to **ai-prompt-engineer** if needed (prompts, model routing, `Site` JSON).
7. Delegate **product/requirements** review to **product-analyst** if needed.
8. Use **qa-tester** for regression checks (`pytest -q`, `python -m py_compile`, `node --check`).
9. Use **code-reviewer** for the final review.

## Hard rules
- **Do not let multiple agents edit the same file at the same time** (we share a branch).
  Check `git status` first; warn about dirty files owned by the other developer.
- **Do not change schema, delete files, commit, push, or install packages without approval.**
- Do not expose secrets from `.env`.

## Final output
- **Summary**
- **Files changed**
- **Commands run**
- **Tests performed**
- **Risks**
- **Next recommended step**
