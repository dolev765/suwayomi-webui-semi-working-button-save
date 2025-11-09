# MySQL Installation and Setup Guide

## Step 1: Install MySQL Server

### Windows
1. Download MySQL Installer from: https://dev.mysql.com/downloads/installer/
2. Run the installer and choose "Developer Default" or "Server only"
3. During installation:
   - Set root password (remember this!)
   - Keep default port: 3306
   - Start MySQL Server as a Windows Service

### Alternative: Docker (Recommended)
```bash
docker run --name mysql-tags \
  -e MYSQL_ROOT_PASSWORD=yourpassword \
  -e MYSQL_DATABASE=tag_database \
  -p 3306:3306 \
  -d mysql:8.0
```

## Step 2: Create Database

Open MySQL command line or MySQL Workbench and run:

```sql
CREATE DATABASE tag_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Or via command line:
```bash
mysql -u root -p -e "CREATE DATABASE tag_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

## Step 3: Generate MySQL SQL File

From the project root directory:
```bash
npm run generate-tag-sql-mysql
```

This creates `tag-database-mysql.sql` in the project root.

## Step 4: Import Data

Import the SQL file into your database:

```bash
mysql -u root -p tag_database < tag-database-mysql.sql
```

Or via MySQL Workbench:
1. Open MySQL Workbench
2. Connect to your server
3. Select `tag_database` schema
4. File → Run SQL Script
5. Select `tag-database-mysql.sql`
6. Execute

## Step 5: Configure Backend Server

1. Navigate to server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your MySQL connection details:
   ```
   MYSQL_CONNECTION_STRING=mysql://root:yourpassword@localhost:3306/tag_database
   ```

   **Your connection string format:**
   ```
   mysql://username:password@host:port/database
   ```

   Example:
   ```
   mysql://root:mypassword@localhost:3306/tag_database
   ```

## Step 6: Start Backend Server

```bash
npm start
# or
yarn start
```

Server will run on `http://localhost:3002` by default.

## Step 7: Verify Connection

1. Check health endpoint:
   ```
   http://localhost:3002/health
   ```

2. Check database stats:
   ```
   http://localhost:3002/api/tags/stats
   ```

3. Test search:
   ```
   http://localhost:3002/api/tags/search?query=girl
   ```

## Troubleshooting

### Connection Refused
- Make sure MySQL server is running
- Check if port 3306 is correct
- Verify firewall settings

### Access Denied
- Check username and password
- Verify user has access to `tag_database`
- Try: `GRANT ALL PRIVILEGES ON tag_database.* TO 'root'@'localhost';`

### Database Not Found
- Make sure you created the database (Step 2)
- Verify database name matches in `.env`

### Import Errors
- Make sure database is empty before importing
- Check file encoding (should be UTF-8)
- Verify SQL file was generated correctly

## Your Connection String

After setup, your connection string will be:
```
mysql://root:YOUR_PASSWORD@localhost:3306/tag_database
```

Replace `YOUR_PASSWORD` with the password you set during MySQL installation.


