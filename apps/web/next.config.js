/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    '@libsql/client',
    'libsql',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native modules
      config.externals = config.externals || [];
      config.externals.push({
        'better-sqlite3': 'commonjs better-sqlite3',
        '@libsql/client': 'commonjs @libsql/client',
        'libsql': 'commonjs libsql',
      });
    }
    return config;
  },
};

module.exports = nextConfig;
