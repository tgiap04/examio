#!/usr/bin/env bash
# Fixture tests for lint-migrations.sh: expand migrations pass, destructive ones fail,
# the migration:contract label (MIGRATION_CONTRACT=1) lets a destructive one through.
#   bash scripts/lint-migrations.test.sh
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
script="$here/lint-migrations.sh"
export LINT_ROOT="$here/fixtures/lint-migrations"
sql="apps/auth-service/prisma/migrations"
py="apps/ai-service/alembic/versions"
fail=0

# check <name> <expected exit> <file> [VAR=value ...]
check() {
    local name="$1" want="$2" file="$3" rc
    shift 3
    env "$@" CHANGED_FILES="$file" bash "$script" base head >/dev/null 2>&1
    rc=$?
    if [ "$rc" -eq "$want" ]; then
        echo "ok   - $name"
    else
        echo "FAIL - $name (exit $rc, wanted $want)"
        fail=1
    fi
}

check "expand SQL (add column/index, DROP INDEX|DEFAULT|NOT NULL|CONSTRAINT) passes" 0 "$sql/20260101000001_expand/migration.sql"
check "DROP COLUMN fails" 1 "$sql/20260101000002_drop_column/migration.sql"
check "DROP COLUMN fails case-insensitively (lowercase)" 1 "$sql/20260101000003_drop_column_lowercase/migration.sql"
check "DROP COLUMN + MIGRATION_CONTRACT=1 passes" 0 "$sql/20260101000002_drop_column/migration.sql" MIGRATION_CONTRACT=1
check "DROP TABLE fails" 1 "$sql/20260101000004_drop_table/migration.sql"
check "RENAME fails" 1 "$sql/20260101000005_rename/migration.sql"
check "ALTER COLUMN SET DATA TYPE fails" 1 "$sql/20260101000006_alter_type/migration.sql"
check "ALTER COLUMN TYPE fails" 1 "$sql/20260101000007_alter_column_type/migration.sql"
check "SET NOT NULL fails" 1 "$sql/20260101000008_set_not_null/migration.sql"
check "ADD COLUMN NOT NULL without DEFAULT fails" 1 "$sql/20260101000009_add_not_null/migration.sql"
check "second ADD COLUMN clause NOT NULL without DEFAULT fails" 1 "$sql/20260101000010_add_not_null_second_clause/migration.sql"
check "DROP TYPE fails" 1 "$sql/20260101000011_drop_enum_type/migration.sql"
check "ALTER TYPE fails" 1 "$sql/20260101000012_alter_enum/migration.sql"
check "alembic expand (nullable add_column, server_default, drop_index/drop_constraint) passes" 0 "$py/0002_expand.py"
check "alembic op.drop_column fails" 1 "$py/0003_drop_column.py"
check "alembic op.drop_column + MIGRATION_CONTRACT=1 passes" 0 "$py/0003_drop_column.py" MIGRATION_CONTRACT=1
check "alembic alter_column type_= fails" 1 "$py/0004_alter_column.py"
check "alembic alter_column nullable=False fails" 1 "$py/0005_nullable_false.py"
check "alembic op.rename_table fails" 1 "$py/0006_rename.py"
check "alembic add_column nullable=False without server_default fails" 1 "$py/0007_add_not_null.py"
check "alembic raw SQL drop table (lowercase) fails" 1 "$py/0008_drop_table_raw_sql.py"
check "alembic drops inside downgrade() (rollback only) pass" 0 "$py/0009_downgrade_drops_new_table.py"
check "alembic drop in upgrade() still fails when a downgrade() follows" 1 "$py/0010_upgrade_drop_with_downgrade.py"
check "alembic drop in upgrade() fails when downgrade() comes first" 1 "$py/0011_downgrade_before_upgrade.py"
check "files that are not migrations are ignored" 0 $'apps/auth-service/src/a.ts\ndocs/x.md'
check "no changed files passes" 0 ''
check "a missing file is an error, not a pass" 2 "$sql/20990101000000_missing/migration.sql"

# The violation report names file, line and rule.
out="$(CHANGED_FILES="$sql/20260101000002_drop_column/migration.sql" bash "$script" base head 2>&1 >/dev/null)"
case "$out" in
    *"20260101000002_drop_column/migration.sql:1: DROP TABLE/COLUMN/TYPE/SCHEMA"*) echo "ok   - report names file, line and rule" ;;
    *) echo "FAIL - report: $out"; fail=1 ;;
esac

# Real git mode: an unresolvable base must not pass silently.
env -u CHANGED_FILES bash "$script" "not-a-rev-$$" HEAD >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 2 ]; then echo "ok   - unresolvable base exits 2"; else echo "FAIL - unresolvable base exit $rc"; fail=1; fi
env -u CHANGED_FILES LINT_ROOT="$here/.." bash "$script" HEAD HEAD >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then echo "ok   - git diff HEAD HEAD passes"; else echo "FAIL - git diff HEAD HEAD exit $rc"; fail=1; fi

[ "$fail" -eq 0 ] && echo "all lint-migrations tests passed"
exit "$fail"
