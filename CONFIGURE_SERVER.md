# Configure MySQL Server

## Quick Setup

The server needs a `.env` file with your MySQL connection details.

### Option 1: Run Interactive Setup

```bash
cd server
yarn setup
```

This will ask you for your MySQL credentials and create the `.env` file automatically.

### Option 2: Create .env Manually

1. Create `server/.env` file with this content:

```env
MYSQL_CONNECTION_STRING=mysql://root:YOUR_PASSWORD@localhost:3306/tag_database
PORT=3002
```

2. **Replace `YOUR_PASSWORD`** with your actual MySQL root password.

### Connection String Format

```
mysql://username:password@host:port/database
```

**Examples:**
- Default: `mysql://root:mypassword@localhost:3306/tag_database`
- Custom user: `mysql://taguser:tagpass@localhost:3306/tag_database`

## Before Starting Server

Make sure you have:

1. ✅ **MySQL Server installed and running**
2. ✅ **Database created:**
   ```sql
   CREATE DATABASE tag_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. ✅ **SQL file imported:**
   ```bash
   mysql -u root -p tag_database < tag-database-mysql.sql
   ```

## Test Configuration

After configuring, test it:

```bash
cd server
yarn start
```

You should see:
```
✅ Connected to MySQL database: tag_database@localhost:3306
🚀 MySQL Tag Database Server running on http://localhost:3002
```

## Troubleshooting

- **"Access denied"** - Check your MySQL password
- **"Database not found"** - Create the database first
- **"Connection refused"** - Make sure MySQL server is running


