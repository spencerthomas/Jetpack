/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@jetpack/orchestrator', '@jetpack/shared', '@jetpack/mcp-mail-adapter'],
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
