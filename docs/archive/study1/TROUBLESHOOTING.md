# Troubleshooting Guide

## "Failed to Fetch" / Authentication Failed

### Common Causes

1. **Backend Server Not Running**
   - Check: `http://localhost:3000/health`
   - Solution: Start backend with `cd backend && npm run dev`

2. **CORS Issues**
   - Check: Browser console for CORS errors
   - Solution: Verify `FRONTEND_URL` in backend `.env` matches your frontend URL

3. **Network Connection**
   - Check: Can you access `http://localhost:3000/health` in browser?
   - Solution: Ensure backend is accessible

4. **API URL Mismatch**
   - Check: Frontend is using correct API URL
   - Default: `http://localhost:3000`
   - Can be set via `VITE_API_URL` environment variable

### Debugging Steps

1. **Check Backend Status**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok",...}`

2. **Check Browser Console**
   - Open DevTools (F12)
   - Check Console tab for errors
   - Check Network tab for failed requests

3. **Test API Directly**
   ```bash
   # Test registration
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```

4. **Check Backend Logs**
   - Look at terminal where backend is running
   - Check for error messages

### Quick Fixes

1. **Restart Backend**
   ```bash
   cd backend
   npm run dev
   ```

2. **Check Environment Variables**
   - Verify `.env` file exists in `backend/` directory
   - Check `DATABASE_URL` is correct
   - Check `FRONTEND_URL` matches frontend port

3. **Clear Browser Cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

4. **Check Port Conflicts**
   - Ensure port 3000 is not used by another application
   - Change PORT in `.env` if needed

### Error Messages

- **"Failed to fetch"**: Network/CORS issue
- **"Authentication failed"**: Invalid credentials or server error
- **500 Internal Server Error**: Backend error (check logs)
- **401 Unauthorized**: Invalid token or credentials
