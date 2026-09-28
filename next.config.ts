import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright'],
  outputFileTracingIncludes: { '/*': ['./fixtures/**/*.json'] },
  devIndicators: false,
};

export default nextConfig;
