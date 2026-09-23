const path = require('node:path');
const dotenv = require('dotenv');

// The project keeps a single .env at the repo root (documented in
// .env.example there) so both `server` and `web` share one source of
// truth. Next.js only auto-loads .env files from its own package
// directory, so we load the root one explicitly and forward the
// NEXT_PUBLIC_* values it needs at build/dev time.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  },
};

module.exports = nextConfig;
