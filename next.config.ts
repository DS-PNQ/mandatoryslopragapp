import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  // Native module used to render scanned PDF pages for transcription.
  serverExternalPackages: ['@napi-rs/canvas'],
  // The Rust text core is read from disk at run time (lib/native/core.ts), so
  // serverless bundles must include it explicitly.
  outputFileTracingIncludes: {'/api/**': ['./lib/native/lemmaslop_core.wasm']},
};

export default nextConfig;
