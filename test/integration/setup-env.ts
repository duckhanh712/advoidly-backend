import { Logger } from '@nestjs/common';

// Integration tests talk to the real infrastructure from docker-compose.yml, configured by `.env`.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env: rely on variables already exported in the shell (e.g. in CI).
}
Logger.overrideLogger(false);
