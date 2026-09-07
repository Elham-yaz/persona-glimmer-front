# Database Connection Timeout Fix

## Problem Found
The database connection is timing out with error:
```
Connection terminated due to connection timeout
```

## Fixes Applied

1. **Increased Connection Timeout** - Changed from 2 seconds to 10 seconds
2. **Better Error Handling** - Improved error logging
3. **Graceful Error Handling** - App won't crash on connection errors

## Common Causes

1. **Database URL Incorrect**
   - Check your `DATABASE_URL` in `.env`
   - Format should be: `postgresql://user:password@host:port/database`
   - For Render: Check your Render dashboard for the correct connection string

2. **Database Not Accessible**
   - If using Render: Make sure database is running
   - Check if database allows external connections
   - Verify firewall/network settings

3. **SSL Configuration**
   - Render databases require SSL
   - Local databases usually don't need SSL

4. **Network Issues**
   - Check your internet connection
   - Try pinging the database host

## Next Steps

1. **Verify DATABASE_URL**
   - Check `.env` file in `backend/` directory
   - Make sure it's the correct connection string

2. **Test Connection Again**
   ```bash
   cd backend
   npm run test-db
   ```

3. **If Still Timing Out**
   - Check Render dashboard (if using Render)
   - Verify database is running
   - Check database connection string format
   - Try connecting with a database client (pgAdmin, DBeaver, etc.)

## For Render Databases

If you're using Render:
1. Go to your Render dashboard
2. Click on your database
3. Copy the "Internal Database URL" or "External Database URL"
4. Use that as your `DATABASE_URL`
5. Make sure SSL is enabled (it should be automatically)

## Connection String Format

```
postgresql://username:password@hostname:port/database?sslmode=require
```

Example for Render:
```
postgresql://user:pass@dpg-xxxxx-a.oregon-postgres.render.com:5432/dbname?sslmode=require
```
