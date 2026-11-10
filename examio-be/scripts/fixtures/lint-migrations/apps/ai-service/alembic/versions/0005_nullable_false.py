import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.alter_column("documents", "lang", existing_type=sa.Text(), nullable=False, schema="ai")
