import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  // Native module used to render scanned PDF pages for transcription.
  serverExternalPackages: ['@napi-rs/canvas'],
};

export default nextConfig;
