from alembic import op


def upgrade() -> None:
    op.drop_column("documents", "lang", schema="ai")
