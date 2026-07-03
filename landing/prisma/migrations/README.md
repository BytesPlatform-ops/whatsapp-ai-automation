# Prisma migrations — Pixie Lab

⚠️ **NEVER run `prisma db push` against this database.** The Supabase DB already
contains Supabase-managed tables and the legacy Pixie app tables (`users`,
`payments`, `conversations`, `waitlist_responses`, …) that are **not** in
`schema.prisma`. `db push` tries to make the whole schema match and will try to
**DROP those tables** (data loss).

## Safe workflow for changing Pixie-Lab (Prisma-owned) tables

1. Edit `prisma/schema.prisma`.
2. Generate a **create/alter-only** SQL diff (never touches non-Prisma tables):

   ```bash
   npx prisma migrate diff \
     --from-empty \
     --to-schema-datamodel prisma/schema.prisma \
     --script > prisma/migrations/<n>_<name>/migration.sql
   ```

   (For incremental changes use `--from-schema-datasource prisma/schema.prisma`
   as the `--from` to diff against the live DB instead of `--from-empty`.)
3. Review the SQL — confirm **zero `DROP`** statements for tables you don't own.
4. Apply it:

   ```bash
   npx prisma db execute --file prisma/migrations/<n>_<name>/migration.sql --schema prisma/schema.prisma
   ```
5. `npx prisma generate` and commit the migration SQL.

`0001_pixie_lab_init` created: profiles, user_sessions, workspaces,
workspace_members, workspace_invitations, billing_customers, subscriptions,
billing_events, notification_preferences (+ role/status enums).
