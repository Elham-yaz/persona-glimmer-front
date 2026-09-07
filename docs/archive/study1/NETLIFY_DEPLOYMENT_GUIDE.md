# Netlify Deployment Guide

## Issue: Users Can't Sign Up or Login

When the frontend is deployed to Netlify, it's trying to connect to `http://localhost:3000` which doesn't work. The backend needs to be deployed and the frontend needs to know where it is.

---

## Solution: Configure Environment Variables

### Step 1: Deploy Backend to Render

1. **Go to Render Dashboard:** https://dashboard.render.com
2. **Create New Web Service:**
   - Connect your GitHub repository
   - Select the `backend` folder as the root directory
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: `Node`

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

4. **After Deployment:**
   - Note your Render backend URL (e.g., `https://your-backend.onrender.com`)
   - Run migrations: Go to Render shell and run `npm run migrate`
   - Run seeds: `npm run seed`

---

### Step 2: Configure Netlify Environment Variables

1. **Go to Netlify Dashboard:**
   - Select your site
   - Go to **Site settings** → **Environment variables**

2. **Add Environment Variable:**
   - **Key:** `VITE_API_URL`
   - **Value:** Your Render backend URL (e.g., `https://your-backend.onrender.com`)
   - **Scopes:** Production, Preview, Deploy previews (check all)

3. **Redeploy:**
   - After adding the variable, trigger a new deployment
   - Or push a new commit to trigger auto-deploy

---

### Step 3: Update Backend CORS

The backend needs to allow requests from your Netlify domain.

**Update `backend/src/app.ts` CORS configuration:**

```typescript
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      // In production, allow Netlify domain
      if (process.env.NODE_ENV === 'production') {
        const allowedOrigins = [
          process.env.FRONTEND_URL,
          'https://your-netlify-site.netlify.app', // Add your actual Netlify URL
        ].filter(Boolean);
        
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      }
      
      // In development, allow any localhost port
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
```

---

## Quick Fix Steps

### 1. Get Your Netlify Site URL
- Check your Netlify dashboard for your site URL
- Example: `https://your-site-name.netlify.app`

### 2. Set Netlify Environment Variable
```
VITE_API_URL=https://your-backend-url.onrender.com
```

### 3. Update Backend CORS (if not already done)
- Add your Netlify URL to allowed origins
- Redeploy backend

### 4. Redeploy Frontend
- After setting the environment variable, redeploy on Netlify

---

## Testing

After deployment, test:
1. Open your Netlify site
2. Open browser console (F12)
3. Check for API calls - they should go to your Render backend URL, not localhost
4. Try signing up - should work now!

---

## Troubleshooting

### "Failed to connect to server"
- Check `VITE_API_URL` is set correctly in Netlify
- Verify backend is running on Render
- Check backend logs in Render dashboard

### "CORS error"
- Verify Netlify URL is in backend CORS allowed origins
- Check `FRONTEND_URL` environment variable in Render

### "Authentication failed"
- Check backend database connection
- Verify JWT_SECRET is set in Render
- Check backend logs for errors

---

## Environment Variables Checklist

### Netlify (Frontend)
- [ ] `VITE_API_URL` = Your Render backend URL

### Render (Backend)
- [ ] `DATABASE_URL` = Your Render database URL
- [ ] `OPENAI_API_KEY` = Your OpenAI API key
- [ ] `JWT_SECRET` = Your JWT secret
- [ ] `NODE_ENV` = `production`
- [ ] `FRONTEND_URL` = Your Netlify site URL
- [ ] `ADMIN_API_KEY` = Your admin API key (optional)

---

## Next Steps After Deployment

1. **Test Authentication:**
   - Sign up a new user
   - Login with existing user
   - Test password reset

2. **Test Chat:**
   - Send messages
   - Verify agent responses
   - Check interaction counting

3. **Test Surveys:**
   - Complete AI literacy survey
   - Complete post-topic survey
   - Verify topic progression

4. **Monitor:**
   - Check Render logs for errors
   - Monitor database connections
   - Watch for rate limiting

---

## Important Notes

- **Never commit `.env` files** - They're in `.gitignore`
- **Backend must be deployed first** - Frontend needs backend URL
- **CORS must be configured** - Backend must allow Netlify domain
- **Database migrations** - Run after backend deployment
- **Database seeds** - Run after migrations
