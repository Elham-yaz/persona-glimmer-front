import app from './app';
import { closePool } from './config/database';
import { validateApiKey } from './config/openai';
import { getAssignmentMode, isMockOpenAI } from './config/study';

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Assignment mode: ${getAssignmentMode()}`);
  if (isMockOpenAI()) {
    console.log('MOCK_OPENAI=true — agent replies are mocked, no OpenAI calls will be made');
  }
});

// Validate the OpenAI key on startup (non-blocking, development only)
if (process.env.NODE_ENV === 'development' && !isMockOpenAI()) {
  validateApiKey()
    .then((isValid) => {
      if (isValid) {
        console.log('OpenAI API key validated successfully');
      } else {
        console.error('Warning: OpenAI API key validation failed. Chat functionality may not work.');
      }
    })
    .catch(() => {
      console.log('Could not validate OpenAI API key (may be a network issue)');
    });
}

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    closePool()
      .catch((error) => console.error('Error closing database pool:', error.message))
      .finally(() => process.exit(0));
  });
  // Force exit if connections do not drain in time
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
