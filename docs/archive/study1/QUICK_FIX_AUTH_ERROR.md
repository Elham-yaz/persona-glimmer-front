# Quick Fix for Authentication Errors

## The Problem
You're getting "server error" on both login and signup. This is most likely because:

1. **Database tables don't exist** - Migrations haven't been run
2. **Agents table is empty** - Seeds haven't been run

## The Solution

Run these commands in order:

```bash
cd backend
npm run migrate
npm run seed
```

## What I Fixed

1. **Better Error Messages** - Now shows clear messages if tables don't exist
2. **Error Handling** - Catches database errors and provides helpful messages
3. **Diagnostic Script** - Added `npm run test-db` to check database state

## Test Database Connection

To check if your database is set up correctly:

```bash
cd backend
npm run test-db
```

This will tell you:
- ✓ If database connection works
- ✓ If users table exists
- ✓ If agents table exists
- ✓ How many agents are in the database

## Expected Output

After running migrations and seeds, you should see:
- All tables created
- 9 agents seeded
- 20 topics seeded
- Login and signup should work

## If Still Getting Errors

1. Check backend console for detailed error messages
2. Verify `DATABASE_URL` in `.env` is correct
3. Make sure database is accessible
4. Run `npm run test-db` to diagnose

The improved error handling will now show you exactly what's missing!
