import sqlalchemy as sa
from alembic import op

TABLES = ("graph",)


def upgrade() -> None:
    op.create_table("graph", sa.Column("id", sa.Text(), primary_key=True))
    op.execute('CREATE TABLE "graph_link" ("id" TEXT PRIMARY KEY)')


def downgrade() -> None:
    # rolling back drops only what upgrade() created
    op.drop_table("graph")
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS "{table}"')
    op.execute("DROP TABLE graph_link")
