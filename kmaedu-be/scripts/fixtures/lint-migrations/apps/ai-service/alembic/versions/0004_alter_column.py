import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.alter_column(
        "documents",
        "size",
        existing_type=sa.Integer(),
        type_=sa.BigInteger(),
        schema="ai",
    )
