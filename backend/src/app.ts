import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { getRequiredEnvVars } from './config/study';
import { errorHandler } from './middleware/error.middleware';

// Routes
import sessionRoutes from './routes/session.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();

// Validate required environment variables on startup
// (DATABASE_URL, ADMIN_API_KEY, and OPENAI_API_KEY unless MOCK_OPENAI=true)
const missingVars = getRequiredEnvVars().filter((name) => !process.env[name]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:');
  missingVars.forEach((name) => console.error(`   - ${name}`));
  console.error('\nPlease set these variables in your .env file or environment.');
  process.exit(1);
}

const app: Express = express();

// Trust proxy - required for running behind reverse proxies like Render, Netlify, etc.
// This allows express-rate-limit to correctly identify users via X-Forwarded-For header
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, health checks) —
      // CORS is a browser mechanism and does not gate non-browser clients anyway
      if (!origin) return callback(null, true);

      // Parse the origin so all checks run against the actual hostname,
      // never against a substring of the raw origin string
      let originUrl: URL;
      try {
        originUrl = new URL(origin);
      } catch {
        return callback(new Error('Not allowed by CORS'));
      }

      // In development, allow any localhost port
      if (process.env.NODE_ENV !== 'production') {
        if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
          return callback(null, true);
        }
      }

      // Exact match against FRONTEND_URL (normalized: no trailing slash)
      const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
      if (frontendUrl && origin === frontendUrl) {
        return callback(null, true);
      }

      // Netlify deploys: exact hostname-suffix check over HTTPS.
      // hostname.endsWith('.netlify.app') cannot be spoofed the way
      // origin.includes('.netlify.app') could (e.g. x.netlify.app.evil.com)
      if (originUrl.protocol === 'https:' && originUrl.hostname.endsWith('.netlify.app')) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key'],
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes (v2). Everything else — including the removed v1 endpoints — is a 404.
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { message: `Cannot ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' },
  });
});

// Error handling (must be last)
app.use(errorHandler);

export default app;
