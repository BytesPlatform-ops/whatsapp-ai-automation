**Review all current git changes** using the **code-reviewer** and **qa-tester** agents.

Start from `git status` / `git diff` to find what changed in `backend/` (and related files).

Check for:
- **Bugs**
- **Regressions**
- **Security issues** (secret leakage, injection, unsafe deserialization)
- **Broken types** (Pydantic / the `Site` JSON contract)
- **Build risks** (Docker, imports, `requirements.txt`)
- **Performance issues** (needless model calls, blocking I/O in async paths)
- **Bad UI/UX**
- **Missing validation**
- **Database risks** (Supabase/PostgreSQL queries, integrity, migrations)
- **(For AI files) broken prompt output contracts** (the `Site` JSON shape, model-tier routing,
  usage/cost metering)

Rules:
- **Do not edit files unless I explicitly ask.**
- Return findings **by severity (Critical / High / Medium / Low)** with **exact file paths**
  and a recommended fix for each.
