/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@jetpack-agent/orchestrator', '@jetpack-agent/shared', '@jetpack-agent/mcp-mail-adapter'],
  serverExternalPackages: ['better-sqlite3'],
};

module.exports = nextConfig;
