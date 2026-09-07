# Environment Setup Checklist

## ✅ Completed Steps

- [x] Backend project structure created
- [x] Dependencies installed (`npm install`)
- [x] `.env` file created from template

## 🔧 Next Steps - Configure Your Environment

### 1. Edit `.env` File

Open `backend/.env` and update these values:

```env
# Database - Update with your PostgreSQL connection details
DATABASE_URL=postgresql://username:password@localhost:5432/research_chat_platform

# OpenAI - Get from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-actual-api-key-here

# JWT Secret - Generate a random string (see below)
JWT_SECRET=your-random-secret-here

# Frontend URL - Usually http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Server Port - Default 3000
PORT=3000

# Environment - development or production
NODE_ENV=development
```

### 2. Set Up PostgreSQL Database

**If PostgreSQL is NOT installed:**

**Option A: Install PostgreSQL locally**
- Download: https://www.postgresql.org/download/windows/
- Install with default settings
- Remember the password you set for the `postgres` user

**Option B: Use cloud database (easier for quick start)**
- Supabase (free tier): https://supabase.com/
- Render PostgreSQL: https://render.com/docs/databases
- Get connection string from provider

**If PostgreSQL IS installed:**

1. Start PostgreSQL service (if not running)
2. Open psql or pgAdmin
3. Create database:
   ```sql
   CREATE DATABASE research_chat_platform;
   ```
4. Update `DATABASE_URL` in `.env`:
   ```
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/research_chat_platform
   ```

### 3. Get OpenAI API Key

1. Go to: https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)
5. Paste into `OPENAI_API_KEY` in `.env`

**Important:** Make sure your OpenAI account has credits!

### 4. Generate JWT Secret

You can use any of these methods:

**Method 1: PowerShell (Windows)**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

**Method 2: Online Generator**
- Visit: https://randomkeygen.com/
- Use "CodeIgniter Encryption Keys" - copy one

**Method 3: Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `JWT_SECRET` in `.env`

### 5. Verify Configuration

After updating `.env`, test the connection:

```bash
cd backend
npm run dev
```

**Expected output:**
```
Server is running on port 3000
Environment: development
Connected to PostgreSQL database
```

If you see errors, check:
- Database connection string is correct
- PostgreSQL is running
- Database exists
- OpenAI API key is valid

### 6. Run Database Migrations

Once environment is configured:

```bash
npm run migrate
```

This creates all database tables.

### 7. Seed Initial Data

```bash
npm run seed
```

This populates:
- 9 agents
- 20 placeholder topics (you'll need to update these)
- Global guardrails

## Quick Reference

**All commands run from `backend` directory:**

```bash
# Install dependencies (already done)
npm install

# Run migrations (creates tables)
npm run migrate

# Seed data (populates initial data)
npm run seed

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Need Help?

- See `SETUP_GUIDE.md` for detailed instructions
- See `README.md` for project overview
- Check error messages - they usually indicate what's missing
