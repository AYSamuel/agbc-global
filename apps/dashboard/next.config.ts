import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @agbc/shared ships TypeScript source (tokens, contracts); Next must transpile it.
  transpilePackages: ['@agbc/shared'],
};

export default nextConfig;
