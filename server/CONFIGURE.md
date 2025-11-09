# Server Configuration Guide

## Quick Setup

1. **Edit `server/.env` file** and update the MySQL connection string:

```env
MYSQL_CONNECTION_STRING=mysql://root:YOUR_PASSWORD@localhost:3306/tag_database
```

Replace `YOUR_PASSWORD` with your actual MySQL root password.

## Connection String Format

```
mysql://username:password@host:port/database
```

### Examples:

**Default local setup:**
```
mysql://root:mypassword@localhost:3306/tag_database
```

**Custom user:**
```
mysql://taguser:tagpass@localhost:3306/tag_database
```

**Remote server:**
```
mysql://user:pass@192.168.1.100:3306/tag_database
```

## Alternative: Individual Parameters

If you prefer not to use a connection string, you can use individual environment variables:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DATABASE=tag_database
```

## Before Starting Server

Make sure you have:

1. ✅ **MySQL Server installed and running**
2. ✅ **Database created:**
   ```sql
   CREATE DATABASE tag_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
3. ✅ **SQL file imported:**
   ```bash
   mysql -u root -p tag_database < ../tag-database-mysql.sql
   ```

## Testing Connection

After configuring, test the connection:

```bash
cd server
npm start
```

You should see:
```
✅ Connected to MySQL database: tag_database@localhost:3306
🚀 MySQL Tag Database Server running on http://localhost:3002
```

## Troubleshooting

### "Access denied"
- Check your MySQL password is correct
- Verify user has permissions:
  ```sql
  GRANT ALL PRIVILEGES ON tag_database.* TO 'root'@'localhost';
  FLUSH PRIVILEGES;
  ```

### "Database not found"
- Create the database first
- Verify database name matches in connection string

### "Connection refused"
- Make sure MySQL server is running
- Check if port 3306 is correct
- Verify firewall settings


