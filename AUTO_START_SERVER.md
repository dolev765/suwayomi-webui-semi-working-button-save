# Auto-Start Server Setup ✅

The MySQL backend server now automatically starts when you run `yarn dev`!

## What Changed

1. **Updated `dev` script** - Now runs both frontend and backend concurrently
2. **Added `concurrently`** - Tool to run multiple commands in parallel with colored output
3. **Added `predev` hook** - Automatically installs server dependencies if missing
4. **Server watch mode** - Backend auto-restarts on file changes

## Usage

Simply run:
```bash
yarn dev
```

This will start:
- **Frontend** (Vite) on `http://localhost:3001` (or your configured port)
- **Backend** (MySQL API) on `http://localhost:3002`

Both servers run in parallel with colored output:
- Frontend logs in **cyan**
- Backend logs in **magenta**

## Scripts Available

- `yarn dev` - Start both frontend and backend
- `yarn dev:frontend` - Start only frontend
- `yarn dev:server` - Start only backend (with watch mode)

## First Time Setup

On first run, the `predev` script will:
1. Check if server dependencies are installed
2. Automatically install them if missing
3. Then start both servers

## Requirements

Before running `yarn dev`, make sure:

1. ✅ MySQL server is installed and running
2. ✅ Database is created: `CREATE DATABASE tag_database;`
3. ✅ SQL file is imported: `mysql -u root -p tag_database < tag-database-mysql.sql`
4. ✅ `server/.env` is configured with your connection string:
   ```
   MYSQL_CONNECTION_STRING=mysql://root:password@localhost:3306/tag_database
   ```

## Troubleshooting

### Server fails to start
- Check if MySQL is running
- Verify `server/.env` exists and has correct connection string
- Check server logs in the terminal (magenta output)

### Dependencies not installing
- Run manually: `cd server && yarn install`
- Check that you have Node.js and Yarn installed

### Port conflicts
- Frontend default: 3001 (change in `vite.config.ts`)
- Backend default: 3002 (change in `server/.env` as `PORT=3002`)

## Output Example

When you run `yarn dev`, you'll see:

```
[frontend] VITE v7.1.2  ready in 500 ms
[frontend] ➜  Local:   http://localhost:3001/
[backend] 🚀 MySQL Tag Database Server running on http://localhost:3002
[backend] 💾 Connection: mysql://root:***@localhost:3306/tag_database
```

Both servers will continue running until you press `Ctrl+C`.


