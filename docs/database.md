# Database

OSE uses Prisma as the database access layer.

## SQLite for Development

Default local configuration:

```env
DATABASE_URL="file:./dev.db"
```

Initialize:

```bash
npx prisma migrate dev
npx prisma db seed
```

SQLite is simple and works well for local development, demos, and the desktop app.

## PostgreSQL Support (Roadmap)

OSE currently ships with SQLite as the only supported database. The Prisma schema and all migrations are SQLite-specific. Setting a `postgresql://` `DATABASE_URL` will fail against the current schema and migrations.

PostgreSQL production deployment support is on the roadmap and is not ready yet. Do not set a `postgresql://` connection string until this support is implemented.

## Prisma Commands

```bash
npx prisma generate
npx prisma migrate dev
npx prisma migrate deploy
npx prisma db seed
npx prisma studio
```

## Backups

SQLite:

```bash
sqlite3 ose.db ".backup ose-$(date +%F).db"
```

## Migrations

Migration files live in `src/prisma/migrations`. Do not edit applied migrations after they have been released. Create a new migration for schema changes.
