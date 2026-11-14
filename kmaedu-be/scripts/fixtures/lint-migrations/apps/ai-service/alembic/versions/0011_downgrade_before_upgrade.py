from alembic import op


def downgrade() -> None:
    op.execute('CREATE TABLE "old_documents" ("id" TEXT PRIMARY KEY)')


def upgrade() -> None:
    op.execute("DROP TABLE old_documents")
