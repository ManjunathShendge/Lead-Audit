import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright-core'],
  outputFileTracingIncludes: { '/*': ['./fixtures/**/*.json'] },
  devIndicators: false,
};

export default nextConfig;
