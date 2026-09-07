import dotenv from 'dotenv';

dotenv.config();

const mock = process.env.MOCK_OPENAI === 'true';

console.log('=== Environment Variables Check ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');
console.log('ADMIN_API_KEY:', process.env.ADMIN_API_KEY ? 'Set' : 'Missing');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set' : mock ? 'Missing (ok: MOCK_OPENAI=true)' : 'Missing');
console.log('MOCK_OPENAI:', mock ? 'true' : 'false');
console.log('ASSIGNMENT_MODE:', process.env.ASSIGNMENT_MODE || 'random');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || '3000');
console.log('====================================');

const missing = ['DATABASE_URL', 'ADMIN_API_KEY', ...(mock ? [] : ['OPENAI_API_KEY'])].filter(
  (name) => !process.env[name]
);

if (missing.length > 0) {
  console.error(`\nERROR: missing required variables: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('\nAll required environment variables are set.');
