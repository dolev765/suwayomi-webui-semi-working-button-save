# MySQL Integration Setup Summary

## ✅ What Has Been Created

### Backend Server (`server/` directory)
1. **`index.ts`** - Express server entry point
2. **`config/database.ts`** - MySQL connection configuration
3. **`routes/tags.ts`** - API endpoints for tag operations
4. **`package.json`** - Server dependencies
5. **`tsconfig.json`** - TypeScript configuration
6. **`INSTALL.md`** - Detailed installation guide
7. **`setup-mysql.ps1`** - Windows PowerShell setup helper

### Frontend API Service
1. **`src/features/mode-one/services/tagDatabaseAPI.ts`** - API-based tag database service

## 🔧 Installation Steps

### 1. Install MySQL Server

**Windows:**
- Download from: https://dev.mysql.com/downloads/installer/
- Or use Docker: `docker run --name mysql-tags -e MYSQL_ROOT_PASSWORD=yourpassword -e MYSQL_DATABASE=tag_database -p 3306:3306 -d mysql:8.0`

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt-get install mysql-server

# macOS
brew install mysql
```

### 2. Create Database

```sql
CREATE DATABASE tag_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Generate MySQL SQL File

From project root:
```bash
npm run generate-tag-sql-mysql
```

This creates `tag-database-mysql.sql` in the project root.

### 4. Import Data

```bash
mysql -u root -p tag_database < tag-database-mysql.sql
```

### 5. Configure Backend

1. Navigate to server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file:
   ```bash
   # Copy example
   cp .env.example .env
   ```

4. Edit `.env` with your connection string:
   ```
   MYSQL_CONNECTION_STRING=mysql://root:yourpassword@localhost:3306/tag_database
   ```

### 6. Start Backend Server

```bash
npm start
```

Server runs on `http://localhost:3002` by default.

## 🔗 Your Connection String Format

```
mysql://username:password@host:port/database
```

**Example:**
```
mysql://root:mypassword@localhost:3306/tag_database
```

## 📝 Environment Variables

Create `server/.env` with:

```env
# Connection String (recommended)
MYSQL_CONNECTION_STRING=mysql://root:password@localhost:3306/tag_database

# OR Individual Parameters
# MYSQL_HOST=localhost
# MYSQL_PORT=3306
# MYSQL_USER=root
# MYSQL_PASSWORD=yourpassword
# MYSQL_DATABASE=tag_database

# Server Port
PORT=3002
```

## 🧪 Testing

1. **Health Check:**
   ```
   http://localhost:3002/health
   ```

2. **Database Stats:**
   ```
   http://localhost:3002/api/tags/stats
   ```

3. **Search Tags:**
   ```
   http://localhost:3002/api/tags/search?query=girl
   ```

## 🔄 Switching to API Mode

To use the MySQL API instead of SQLite:

1. Update imports in your components:
   ```typescript
   // Change from:
   import * as tagDatabaseModule from './tagDatabaseSQL';
   
   // To:
   import * as tagDatabaseModule from './tagDatabaseAPI';
   ```

2. Set API URL in `.env` (frontend):
   ```
   VITE_TAG_API_URL=http://localhost:3002/api/tags
   ```

## 📚 API Endpoints

- `GET /api/tags/search?query=...&category=male&limit=50` - Search tags
- `GET /api/tags/tag/:canonical` - Get tag by canonical name
- `GET /api/tags/recommended/:canonical?limit=10&offset=0` - Get recommended tags
- `GET /api/tags/category/:category` - Get all tags by category
- `GET /api/tags/resolve/:alias` - Resolve alias to canonical
- `GET /api/tags/stats` - Get database statistics
- `GET /api/tags/ready` - Check if database is ready

## 🐛 Troubleshooting

### Connection Refused
- Verify MySQL server is running
- Check port 3306 is correct
- Verify firewall settings

### Access Denied
- Check username and password
- Grant permissions: `GRANT ALL PRIVILEGES ON tag_database.* TO 'root'@'localhost';`

### Database Not Found
- Create database: `CREATE DATABASE tag_database;`
- Verify database name in connection string

## 📖 More Information

- See `server/INSTALL.md` for detailed installation guide
- See `server/README.md` for API documentation


