# Database

OSE uses Prisma as the database access layer.

## SQLite for Development

Default local configuration:

```env
DATABASE_URL="file:./dev.db"
```

Initialize:

```bash
npm run db:migrate
npm run db:seed
```

SQLite is simple and works well for local development, demos, and the desktop app.

## PostgreSQL for Production

Recommended production configuration:

```env
DATABASE_URL="postgresql://ose:strong-password@localhost:5432/ose"
```

Apply migrations:

```bash
npx prisma migrate deploy
```

PostgreSQL is recommended for multi-user deployments, backups, monitoring, and horizontal scaling.

## Prisma Commands

```bash
npx prisma generate
npm run db:migrate
npx prisma migrate deploy
npm run db:seed
npx prisma studio
```

## Backups

SQLite:

```bash
sqlite3 ose.db ".backup ose-$(date +%F).db"
```

PostgreSQL:

```bash
pg_dump "$DATABASE_URL" > ose-$(date +%F).sql
```

## Migrations

Migration files live in `src/prisma/migrations`. Do not edit applied migrations after they have been released. Create a new migration for schema changes.
