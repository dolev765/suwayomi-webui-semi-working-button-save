# Quick Server Configuration

## Option 1: Interactive Setup (Recommended)

Run the interactive setup script:

```bash
cd server
yarn setup
# or
npm run setup
```

This will ask you for:
- MySQL host (default: localhost)
- MySQL port (default: 3306)
- MySQL username (default: root)
- MySQL password
- Database name (default: tag_database)
- Server port (default: 3002)

## Option 2: Manual Setup

1. Create `server/.env` file:

```env
MYSQL_CONNECTION_STRING=mysql://root:yourpassword@localhost:3306/tag_database
PORT=3002
```

2. Replace `yourpassword` with your actual MySQL root password.

## Connection String Format

```
mysql://username:password@host:port/database
```

**Example:**
```
mysql://root:mypassword@localhost:3306/tag_database
```

## Before Starting

Make sure:
1. ✅ MySQL server is running
2. ✅ Database is created: `CREATE DATABASE tag_database;`
3. ✅ SQL file is imported: `mysql -u root -p tag_database < ../tag-database-mysql.sql`

## Test Configuration

```bash
cd server
yarn start
```

You should see:
```
✅ Connected to MySQL database: tag_database@localhost:3306
🚀 MySQL Tag Database Server running on http://localhost:3002
```


