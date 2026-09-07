# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database running
- OpenAI API key

## Setup Steps

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp env.example .env
```

Edit `.env` and set:
- `DATABASE_URL` - Your PostgreSQL connection string
- `OPENAI_API_KEY` - Your OpenAI API key
- `JWT_SECRET` - A random secret string for JWT tokens
- `FRONTEND_URL` - Your frontend URL (e.g., `http://localhost:5173`)

### 3. Create Database

Connect to PostgreSQL and create the database:

```sql
CREATE DATABASE research_chat_platform;
```

### 4. Run Migrations

This creates all the database tables:

```bash
npm run migrate
```

### 5. Seed Data

This populates agents, topics (placeholder), and guardrails:

```bash
npm run seed
```

**Important:** The topics seed file contains placeholder data. Edit `src/seeds/topics.seed.ts` with your actual 20 research topics before running the seed, or update them directly in the database.

### 6. Start Server

```bash
npm run dev
```

The server should start on `http://localhost:3000`

## Testing the API

### Health Check

```bash
curl http://localhost:3000/health
```

### Register a User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Save the token from the response for authenticated requests.

### Get User State

```bash
curl http://localhost:3000/api/user/state \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Next Steps

1. **Update Topics:** Replace placeholder topic data in `src/seeds/topics.seed.ts` with your actual 20 research topics
2. **Test Chat Flow:** Register a user, complete the literacy survey, and test chat interactions
3. **Configure OpenAI:** Ensure your OpenAI API key has sufficient credits
4. **Frontend Integration:** Connect your frontend to the API endpoints

## Troubleshooting

### Database Connection Error

- Verify PostgreSQL is running
- Check `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- Ensure database exists

### Migration Errors

- Make sure database is created first
- Check user has CREATE TABLE permissions
- Verify all migrations are in `src/migrations/` directory

### OpenAI API Errors

- Verify API key is correct
- Check account has credits
- Monitor rate limits

## Production Deployment

See the main README.md for Render deployment instructions.
