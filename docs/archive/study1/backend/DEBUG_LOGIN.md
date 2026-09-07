# Debugging Login Issues

## Common Issues and Solutions

### 1. "Authentication failed" Error

**Possible Causes:**
- Database connection issue
- Agents table not seeded
- User doesn't exist
- Password mismatch

**Debug Steps:**
1. Check backend console logs for detailed error messages
2. Verify database connection: `GET /health`
3. Check if agents are seeded: Run `npm run seed` in backend directory
4. Verify user exists in database
5. Check password hashing/verification

### 2. "Server error" (500)

**Possible Causes:**
- Database query failure
- Missing agent in database
- Database connection timeout
- Missing environment variables

**Debug Steps:**
1. Check backend console for full error stack
2. Verify all environment variables are set
3. Check database connection string
4. Ensure migrations have been run
5. Ensure seeds have been run

### 3. Agent Not Found Error

**Solution:**
```bash
cd backend
npm run seed
```

This will seed the 9 agents required for the system.

### 4. Database Connection Issues

**Check:**
- `DATABASE_URL` is set correctly in `.env`
- Database is accessible
- SSL configuration for Render databases

### 5. Missing Migrations

**Solution:**
```bash
cd backend
npm run migrate
```

This will create all required tables.

---

## Quick Fix Checklist

1. ✅ Run migrations: `cd backend && npm run migrate`
2. ✅ Run seeds: `cd backend && npm run seed`
3. ✅ Check `.env` file has all required variables
4. ✅ Verify backend server is running
5. ✅ Check backend console for error details
6. ✅ Test database connection

---

## Testing Login

1. First, ensure backend is running: `cd backend && npm run dev`
2. Check health endpoint: `GET http://localhost:3000/health`
3. Try registering a new user first
4. Then try logging in with that user

---

## Error Logs Location

Check the backend console output for detailed error messages. The improved error logging will show:
- Error name
- Error message
- Error stack (in development)
- Database error codes (if applicable)
