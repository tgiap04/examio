"""expand: add a nullable column and an index."""
import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.add_column("documents", sa.Column("lang", sa.Text(), nullable=True), schema="ai")
    op.add_column("documents", sa.Column("tier", sa.Text(), nullable=False, server_default="free"), schema="ai")
    op.create_index("ix_documents_lang", "documents", ["lang"], schema="ai")


def downgrade() -> None:
    op.drop_index("ix_documents_lang", table_name="documents", schema="ai")
    op.drop_constraint("documents_lang_key", "documents", schema="ai")
