# Quick Fix for "Failed to Fetch" Error

## Issue
"Authentication failed, failed to fetch" when trying to login

## Solution

### Step 1: Restart Backend Server
The CORS configuration was just updated. You need to restart the backend:

1. Stop the current backend server (Ctrl+C in the terminal)
2. Restart it:
   ```bash
   cd backend
   npm run dev
   ```

### Step 2: Verify Backend is Running
Open in browser: http://localhost:3000/health
Should see: `{"status":"ok","timestamp":"..."}`

### Step 3: Check Frontend URL
Make sure your frontend is running on `http://localhost:5173`
If using a different port, update `FRONTEND_URL` in `backend/.env`

### Step 4: Clear Browser Cache
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or clear browser cache

### Step 5: Check Browser Console
1. Open DevTools (F12)
2. Go to Console tab
3. Look for CORS or network errors
4. Go to Network tab
5. Try login again and check the failed request

## Common Issues

### Backend Not Running
- **Symptom**: "Failed to connect to server"
- **Fix**: Start backend with `cd backend && npm run dev`

### CORS Error
- **Symptom**: CORS policy error in console
- **Fix**: Restart backend after CORS update

### Wrong Port
- **Symptom**: Connection refused
- **Fix**: Check backend is on port 3000, frontend on 5173

### Database Connection
- **Symptom**: 500 error from backend
- **Fix**: Check database connection in backend logs

## Test After Fix

1. Open frontend: http://localhost:5173
2. Try to register a new user
3. If registration works, login should work too
