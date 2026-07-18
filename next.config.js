/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed static export to allow dynamic App Router routes such as Clerk sign-in
  trailingSlash: false, // Explicitly set to false to prevent redirect loops
  images: {
    unoptimized: true
  },
  eslint: {
    ignoreDuringBuilds: true, // Ignore ESLint errors during build
  },
  typescript: {
    ignoreBuildErrors: true, // Ignore TypeScript errors during build
  },
  // Fix Next.js 15 configuration
  outputFileTracingExcludes: {
    '*': ['./clerk.broken/**/*']
  },
  serverExternalPackages: ['@supabase/supabase-js'],
  // Ensure proper build for Vercel
  // swcMinify: true, // Removed as it's default in Next.js 15
  // Fix client reference manifest issues
  transpilePackages: [],
  // Fix xterm self reference issue
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    
    config.resolve.alias = {
      ...config.resolve.alias,
      'xterm': 'xterm/lib/xterm.js',
    };

    // Define self for xterm compatibility
    if (isServer) {
      config.plugins = [
        ...config.plugins,
        new webpack.DefinePlugin({
          'self': 'globalThis',
        }),
      ];
    }

    return config;
  },
};

export default nextConfig;
