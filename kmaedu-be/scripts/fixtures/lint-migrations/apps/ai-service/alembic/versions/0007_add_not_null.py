import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.add_column("documents", sa.Column("tier", sa.Text(), nullable=False), schema="ai")
