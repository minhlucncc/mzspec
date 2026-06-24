# mzspec migrations

`update.sh` re-vendors the latest mzspec into a project and then runs the
migrations needed to move that project from the version it had installed
(`.claude/.mzspec-version`) up to the current `VERSION`.

## Contract

- One script per release that needs a transform: `migrations/<version>-<slug>.sh`
  (e.g. `0.2.0-zero-config-hooks.sh`). The leading token before the first `-` is
  the **target version**.
- `update.sh` runs a migration when `installed < target <= current`, in ascending
  version order (`sort -V`).
- Each script is invoked as: `bash <migration>.sh "$DEST" "$SRC"` where `$DEST` is
  the project root and `$SRC` is the mzspec checkout (for copying assets).
- **Migrations MUST be idempotent** — re-running on an already-migrated project is a
  no-op (a project may update across several versions, or re-run an update).
- Prefer non-destructive moves (`mv x x.bak`) over `rm` for anything the user might
  have hand-authored; print a one-line note for anything that needs human follow-up.

A release with no structural change needs no migration file — bumping `VERSION` and
re-vendoring is enough.
