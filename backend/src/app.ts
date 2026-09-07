import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error.middleware';
import { validateApiKey } from './config/openai';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import topicRoutes from './routes/topic.routes';
import chatRoutes from './routes/chat.routes';
import surveyRoutes from './routes/survey.routes';
import guardrailRoutes from './routes/guardrail.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();

// Validate required environment variables on startup
const requiredEnvVars = ['DATABASE_URL', 'OPENAI_API_KEY', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nPlease set these variables in your .env file or environment.');
  process.exit(1);
}

console.log('✅ All required environment variables are set');

// Validate OpenAI API key on startup (non-blocking, silent in production)
if (process.env.NODE_ENV === 'development') {
  validateApiKey().then(isValid => {
    if (!isValid) {
      console.error('⚠️  Warning: OpenAI API key validation failed. Chat functionality may not work.');
      console.error('   Please check your OPENAI_API_KEY in Render environment variables.');
    } else {
      console.log('✅ OpenAI API key validated successfully');
    }
  }).catch(() => {
    // Non-blocking - continue startup even if validation fails
    console.log('⚠️  Could not validate OpenAI API key (may be network issue)');
  });
}

const app: Express = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/guardrails', guardrailRoutes);
app.use('/api/admin', adminRoutes);

// Error handling (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
