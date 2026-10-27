from alembic import op


def upgrade() -> None:
    op.rename_table("documents", "docs", schema="ai")
