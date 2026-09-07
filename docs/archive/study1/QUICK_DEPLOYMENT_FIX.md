# Quick Fix: Netlify Authentication Issue

## The Problem
After deploying to Netlify, users can't sign up or login because the frontend is trying to connect to `localhost:3000` which doesn't work in production.

## The Solution (2 Steps)

### Step 1: Set Environment Variable in Netlify

1. Go to your Netlify dashboard
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add variable**
5. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** Your Render backend URL (e.g., `https://your-backend.onrender.com`)
   - **Scopes:** Check all boxes
6. Click **Save**
7. **Redeploy** your site (Deploys → Trigger deploy → Clear cache and deploy)

### Step 2: Deploy Backend to Render (If Not Done)

If your backend isn't deployed yet:

1. **Go to Render:** https://dashboard.render.com
2. **New** → **Web Service**
3. **Connect GitHub** → Select your repo
4. **Settings:**
   - **Name:** `persona-glimmer-backend` (or any name)
   - **Root Directory:** `backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. **Environment Variables:**
   ```
   DATABASE_URL=postgresql://paid_db_9iwk_user:MQyXT14DYC3qe1uqjoKzvYob3pUITGlP@dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com:5432/paid_db_9iwk?sslmode=require
   OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE
   JWT_SECRET=7d9a63242bf1fcfe6e2511d7c151c8e561c81bd019c8b820c8ffceb45f400400
   NODE_ENV=production
   PORT=3000
   FRONTEND_URL=https://your-netlify-site.netlify.app
   ```
6. **After deployment:**
   - Open Render Shell
   - Run: `npm run migrate`
   - Run: `npm run seed`
7. **Copy your Render URL** (e.g., `https://xxx.onrender.com`)
8. **Use this URL** as `VITE_API_URL` in Netlify (Step 1)

---

## That's It!

After setting `VITE_API_URL` in Netlify and redeploying, authentication should work!

**Test it:**
1. Open your Netlify site
2. Open browser console (F12)
3. Check Network tab - API calls should go to your Render URL
4. Try signing up - should work now!

---

## Need Help?

If it still doesn't work:
1. Check browser console for errors
2. Check Render backend logs
3. Verify `VITE_API_URL` is set correctly
4. Verify backend is running on Render
