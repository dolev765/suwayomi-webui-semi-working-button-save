# MySQL Tag Database Server

Backend server for the tag database system using MySQL instead of client-side SQLite.

## Installation

1. **Install MySQL Server**
   - Windows: Download from [MySQL Downloads](https://dev.mysql.com/downloads/mysql/)
   - Or use MySQL via Docker: `docker run --name mysql-tags -e MYSQL_ROOT_PASSWORD=yourpassword -e MYSQL_DATABASE=tag_database -p 3306:3306 -d mysql:8.0`

2. **Install Dependencies**
   ```bash
   cd server
   npm install
   # or
   yarn install
   ```

3. **Configure Database**
   - Copy `.env.example` to `.env`
   - Update the connection string or individual parameters:
     ```
     MYSQL_CONNECTION_STRING=mysql://root:yourpassword@localhost:3306/tag_database
     ```

4. **Create Database and Import Data**
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE tag_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   
   # Generate MySQL SQL file (from project root)
   npm run generate-tag-sql-mysql
   
   # Import SQL file
   mysql -u root -p tag_database < tag-database-mysql.sql
   ```

5. **Start Server**
   ```bash
   npm start
   # or
   yarn start
   ```

## Connection String Format

Your MySQL connection string should be:
```
mysql://username:password@host:port/database
```

Example:
```
mysql://root:mypassword@localhost:3306/tag_database
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/tags/search?query=...&category=male&limit=50` - Search tags
- `GET /api/tags/tag/:canonical` - Get tag by canonical name
- `GET /api/tags/recommended/:canonical?limit=10&offset=0` - Get recommended tags
- `GET /api/tags/category/:category` - Get all tags by category (male/female)
- `GET /api/tags/resolve/:alias` - Resolve alias to canonical
- `GET /api/tags/stats` - Get database statistics
- `GET /api/tags/ready` - Check if database is ready

## Development

The server runs on port 3002 by default. Update `PORT` in `.env` to change it.


