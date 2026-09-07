# Render Deployment Quick Checklist

## Before You Start
- [ ] Code is pushed to GitHub
- [ ] You have a Render account (sign up at https://render.com)

---

## Step 1: Create Web Service (5 minutes)

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect GitHub repo: `eldersamolu/persona-glimmer-front`
4. Fill in settings:

```
Name: persona-glimmer-backend
Root Directory: backend ⚠️ IMPORTANT!
Build Command: npm install && npm run build
Start Command: npm start
```

---

## Step 2: Set Environment Variables (2 minutes)

Add these in Render dashboard → Environment tab:

```
DATABASE_URL=postgresql://paid_db_9iwk_user:MQyXT14DYC3qe1uqjoKzvYob3pUITGlP@dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com:5432/paid_db_9iwk?sslmode=require

OPENAI_API_KEY=sk-proj-YOUR_OPENAI_API_KEY_HERE

JWT_SECRET=7d9a63242bf1fcfe6e2511d7c151c8e561c81bd019c8b820c8ffceb45f400400

NODE_ENV=production

PORT=3000

FRONTEND_URL=https://your-netlify-site.netlify.app
(Replace with your actual Netlify URL!)

ADMIN_API_KEY=your-secure-key-here
(Optional - use a strong random string)
```

---

## Step 3: Deploy (5-10 minutes)

1. Click **"Create Web Service"**
2. Wait for build to complete
3. Copy your backend URL (e.g., `https://xxx.onrender.com`)

---

## Step 4: Run Database Setup (2 minutes)

1. Open **Render Shell** (in your service dashboard)
2. Run:
   ```bash
   npm run migrate
   npm run seed
   ```

---

## Step 5: Update Netlify (1 minute)

1. Go to Netlify dashboard
2. **Site settings** → **Environment variables**
3. Set `VITE_API_URL` = Your Render backend URL
4. Redeploy site

---

## Done! ✅

Test your site:
- Visit your Netlify URL
- Try signing up
- Should work now!

---

## Quick Troubleshooting

**Build fails?**
- Check Root Directory is `backend`
- Check build logs for errors

**Service won't start?**
- Check all environment variables are set
- Check service logs

**Database errors?**
- Verify DATABASE_URL is correct
- Check database is running in Render

**Need help?**
- See full guide: `RENDER_DEPLOYMENT_GUIDE.md`
- Check Render service logs
