# Deployment Fix: Netlify + Render Setup

## Problem
After deploying to Netlify, users can't sign up or login because the frontend is trying to connect to `localhost:3000` which doesn't exist in production.

## Solution

### Step 1: Deploy Backend to Render

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Create New Web Service:**
   - Connect your GitHub repository: `eldersamolu/persona-glimmer-front`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** `Node`

3. **Set Environment Variables in Render:**
   ```
   DATABASE_URL=postgresql://paid_db_9iwk_user:MQyXT14DYC3qe1uqjoKzvYob3pUITGlP@dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com:5432/paid_db_9iwk?sslmode=require
   OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE
   JWT_SECRET=7d9a63242bf1fcfe6e2511d7c151c8e561c81bd019c8b820c8ffceb45f400400
   NODE_ENV=production
   PORT=3000
   FRONTEND_URL=https://your-netlify-site.netlify.app
   ADMIN_API_KEY=your-secure-admin-key-here
   ```

4. **After Backend Deploys:**
   - Note your Render backend URL (e.g., `https://your-app.onrender.com`)
   - Open Render Shell and run:
     ```bash
     npm run migrate
     npm run seed
     ```

---

### Step 2: Configure Netlify Environment Variable

1. **Go to Netlify Dashboard:**
   - Select your site
   - **Site settings** → **Environment variables**
   - Click **Add variable**

2. **Add Variable:**
   - **Key:** `VITE_API_URL`
   - **Value:** Your Render backend URL (e.g., `https://your-app.onrender.com`)
   - **Scopes:** Check all (Production, Preview, Deploy previews)

3. **Redeploy:**
   - Go to **Deploys** tab
   - Click **Trigger deploy** → **Clear cache and deploy site**

---

### Step 3: Update Backend CORS (Already Done)

The backend CORS has been updated to automatically allow Netlify domains. Just make sure:
- `FRONTEND_URL` is set in Render to your Netlify URL
- Backend is redeployed after setting `FRONTEND_URL`

---

## Quick Checklist

### Render (Backend)
- [ ] Web service created
- [ ] Root directory: `backend`
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm start`
- [ ] All environment variables set
- [ ] Migrations run (`npm run migrate`)
- [ ] Seeds run (`npm run seed`)
- [ ] Backend URL noted (e.g., `https://xxx.onrender.com`)

### Netlify (Frontend)
- [ ] Environment variable `VITE_API_URL` set to Render backend URL
- [ ] Site redeployed after setting variable

---

## Testing

1. **Open your Netlify site**
2. **Open browser console (F12)**
3. **Check Network tab:**
   - API calls should go to your Render URL (not localhost)
4. **Try signing up:**
   - Should work now!

---

## Common Issues

### "Failed to connect to server"
- ✅ Check `VITE_API_URL` is set in Netlify
- ✅ Verify backend is running on Render
- ✅ Check backend logs in Render dashboard

### "CORS error"
- ✅ Verify `FRONTEND_URL` is set in Render to your Netlify URL
- ✅ Backend CORS now automatically allows `.netlify.app` domains
- ✅ Redeploy backend after setting `FRONTEND_URL`

### "Authentication failed"
- ✅ Check backend database connection
- ✅ Verify all environment variables are set in Render
- ✅ Check backend logs for errors

---

## Your Backend URL Format

After deploying to Render, your backend URL will be:
```
https://your-service-name.onrender.com
```

Set this as `VITE_API_URL` in Netlify.

---

## Your Netlify URL Format

Your Netlify site URL will be:
```
https://your-site-name.netlify.app
```

Set this as `FRONTEND_URL` in Render.

---

**After completing these steps, authentication should work on your Netlify site!**
