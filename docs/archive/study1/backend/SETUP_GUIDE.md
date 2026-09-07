# Environment Setup Guide

## Step 1: Configure Environment Variables

Edit the `.env` file in the `backend` directory with your actual values:

### Required Variables:

1. **DATABASE_URL**
   - Format: `postgresql://username:password@host:port/database`
   - Example: `postgresql://postgres:mypassword@localhost:5432/research_chat_platform`
   - You'll need to create the database first (see Step 2)

2. **OPENAI_API_KEY**
   - Get your API key from: https://platform.openai.com/api-keys
   - Format: `sk-...` (starts with `sk-`)

3. **JWT_SECRET**
   - Generate a random secret string
   - You can use: `openssl rand -hex 32` or any random string generator
   - Example: `my-super-secret-jwt-key-12345`

4. **FRONTEND_URL**
   - Your frontend URL (default: `http://localhost:5173`)
   - Change if your frontend runs on a different port

5. **PORT** (optional)
   - Default: `3000`
   - Change if port 3000 is already in use

6. **NODE_ENV** (optional)
   - Set to `development` for local development
   - Set to `production` for production deployment

## Step 2: Set Up PostgreSQL Database

### Option A: Local PostgreSQL

1. **Install PostgreSQL** (if not installed):
   - Windows: Download from https://www.postgresql.org/download/windows/
   - Or use PostgreSQL installer

2. **Start PostgreSQL service**:
   - Windows: Check Services app, start "postgresql-x64-XX" service
   - Or use: `pg_ctl start` from PostgreSQL bin directory

3. **Create database**:
   ```sql
   -- Connect to PostgreSQL (using psql or pgAdmin)
   CREATE DATABASE research_chat_platform;
   ```

4. **Update DATABASE_URL in .env**:
   ```
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/research_chat_platform
   ```

### Option B: Cloud PostgreSQL (Supabase, Render, etc.)

1. Create a PostgreSQL database on your cloud provider
2. Get the connection string
3. Update `DATABASE_URL` in `.env` with the connection string

## Step 3: Get OpenAI API Key

1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API Keys: https://platform.openai.com/api-keys
4. Create a new secret key
5. Copy the key (starts with `sk-`)
6. Update `OPENAI_API_KEY` in `.env`

**Note:** Make sure you have credits in your OpenAI account.

## Step 4: Generate JWT Secret

Run this command to generate a secure random secret:

```bash
# Windows PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Or use an online generator: https://randomkeygen.com/
```

Update `JWT_SECRET` in `.env` with the generated value.

## Step 5: Verify Setup

After configuring all variables, test the setup:

```bash
cd backend
npm run dev
```

If everything is configured correctly, you should see:
```
Server is running on port 3000
Environment: development
Connected to PostgreSQL database
```

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running
- Check username, password, and database name in DATABASE_URL
- Ensure database `research_chat_platform` exists

### OpenAI API Error
- Verify API key is correct (starts with `sk-`)
- Check account has credits
- Verify API key hasn't been revoked

### Port Already in Use
- Change PORT in .env to a different port (e.g., 3001)
- Or stop the process using port 3000

## Next Steps

Once environment is configured:
1. Run migrations: `npm run migrate`
2. Seed data: `npm run seed`
3. Start server: `npm run dev`
