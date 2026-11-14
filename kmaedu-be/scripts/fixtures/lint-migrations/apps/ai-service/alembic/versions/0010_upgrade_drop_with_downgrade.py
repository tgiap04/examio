from alembic import op


def upgrade() -> None:
    op.drop_table("old_documents")


def downgrade() -> None:
    op.execute('CREATE TABLE "old_documents" ("id" TEXT PRIMARY KEY)')
