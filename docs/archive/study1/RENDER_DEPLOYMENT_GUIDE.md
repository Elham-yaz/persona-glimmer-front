# Render Backend Deployment Guide

## Step-by-Step Instructions

### Step 1: Prepare Your Repository

Make sure your code is pushed to GitHub:
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

---

### Step 2: Create Web Service on Render

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Sign in or create an account

2. **Create New Web Service:**
   - Click **"New +"** button (top right)
   - Select **"Web Service"**

3. **Connect Repository:**
   - Click **"Connect account"** if not already connected
   - Select **GitHub** and authorize Render
   - Find and select your repository: `eldersamolu/persona-glimmer-front`
   - Click **"Connect"**

---

### Step 3: Configure Service Settings

Fill in the following settings:

#### Basic Settings:
- **Name:** `persona-glimmer-backend` (or any name you prefer)
- **Region:** Choose closest to your users (e.g., `Oregon (US West)`)
- **Branch:** `main` (or your default branch)
- **Root Directory:** `backend` ⚠️ **IMPORTANT: Set this to `backend`**
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

#### Advanced Settings (Optional):
- **Auto-Deploy:** `Yes` (deploys automatically on git push)
- **Health Check Path:** `/health`

---

### Step 4: Set Environment Variables

Click **"Environment"** tab and add these variables:

#### Required Variables:

```
DATABASE_URL=postgresql://paid_db_9iwk_user:MQyXT14DYC3qe1uqjoKzvYob3pUITGlP@dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com:5432/paid_db_9iwk?sslmode=require
```

```
OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE
```

```
JWT_SECRET=7d9a63242bf1fcfe6e2511d7c151c8e561c81bd019c8b820c8ffceb45f400400
```

```
NODE_ENV=production
```

```
PORT=3000
```

#### Frontend URL (Replace with your actual Netlify URL):

```
FRONTEND_URL=https://your-netlify-site.netlify.app
```

**⚠️ Replace `your-netlify-site.netlify.app` with your actual Netlify domain!**

#### Optional (Admin API):

```
ADMIN_API_KEY=your-secure-admin-key-here
```

**⚠️ Use a strong random string for production!**

---

### Step 5: Deploy

1. Click **"Create Web Service"** at the bottom
2. Render will start building your service
3. Watch the build logs - it should:
   - Install dependencies
   - Run `npm run build` (compile TypeScript)
   - Start the server with `npm start`

---

### Step 6: Run Database Migrations

After the service is deployed:

1. **Open Render Shell:**
   - Go to your service dashboard
   - Click **"Shell"** tab (in the left sidebar)
   - This opens a terminal

2. **Run Migrations:**
   ```bash
   npm run migrate
   ```
   This creates all database tables.

3. **Run Seeds:**
   ```bash
   npm run seed
   ```
   This populates agents, topics, and guardrails.

---

### Step 7: Get Your Backend URL

1. After deployment, Render will provide a URL like:
   ```
   https://persona-glimmer-backend.onrender.com
   ```
   (or whatever name you chose)

2. **Copy this URL** - you'll need it for Netlify!

3. **Test the health endpoint:**
   ```
   https://your-backend-url.onrender.com/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

---

### Step 8: Update Netlify Environment Variable

1. Go to your Netlify dashboard
2. Select your site
3. **Site settings** → **Environment variables**
4. Add or update:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://your-backend-url.onrender.com` (from Step 7)
5. **Redeploy** your Netlify site

---

## Troubleshooting

### Build Fails

**Error: "Cannot find module"**
- Check that `Root Directory` is set to `backend`
- Verify all dependencies are in `package.json`

**Error: "TypeScript compilation failed"**
- Check build logs for specific TypeScript errors
- Make sure `tsconfig.json` is correct

### Service Won't Start

**Error: "Missing environment variables"**
- Verify all required env vars are set in Render
- Check the service logs for specific missing variables

**Error: "Database connection failed"**
- Verify `DATABASE_URL` is correct
- Check that your Render database is running
- Ensure SSL mode is set: `?sslmode=require`

### Database Migration Issues

**Error: "Table already exists"**
- This is okay if tables were already created
- You can skip migrations if needed

**Error: "Connection timeout"**
- Render databases can be slow to wake up
- Wait a minute and try again
- Check database status in Render dashboard

---

## Render Service Settings Summary

```
Name: persona-glimmer-backend
Region: Oregon (US West) [or your preference]
Branch: main
Root Directory: backend
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm start
```

---

## Environment Variables Checklist

- [ ] `DATABASE_URL` - Your Render PostgreSQL URL
- [ ] `OPENAI_API_KEY` - Your OpenAI API key
- [ ] `JWT_SECRET` - Your JWT secret
- [ ] `NODE_ENV` - Set to `production`
- [ ] `PORT` - Set to `3000`
- [ ] `FRONTEND_URL` - Your Netlify site URL
- [ ] `ADMIN_API_KEY` - Optional, for admin endpoints

---

## After Deployment

1. ✅ Backend is running on Render
2. ✅ Database migrations completed
3. ✅ Database seeds completed
4. ✅ Health check works: `/health`
5. ✅ Backend URL copied
6. ✅ Netlify `VITE_API_URL` updated
7. ✅ Netlify site redeployed

**Your platform should now be fully functional!** 🎉

---

## Monitoring

- **Logs:** View in Render dashboard → Your service → **Logs** tab
- **Metrics:** Monitor CPU, memory, and response times
- **Alerts:** Set up email alerts for service failures

---

## Auto-Deploy

Render will automatically redeploy when you push to your `main` branch. To disable:
- Go to service settings
- Set **Auto-Deploy** to `No`

---

## Custom Domain (Optional)

1. Go to service settings
2. Click **"Custom Domains"**
3. Add your domain
4. Follow DNS configuration instructions

---

## Need Help?

- **Render Docs:** https://render.com/docs
- **Render Support:** support@render.com
- **Check service logs** for detailed error messages
