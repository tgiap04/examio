from alembic import op


def upgrade() -> None:
    op.execute("drop table ai.old_documents")
