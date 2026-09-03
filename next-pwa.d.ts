declare module "next-pwa" {
  import type { NextConfig } from "next";
  interface PWAConfig {
    dest?: string;
    disable?: boolean;
    register?: boolean;
    skipWaiting?: boolean;
    scope?: string;
    sw?: string;
  }
  function withPWAInit(config?: PWAConfig): (nextConfig: NextConfig) => NextConfig;
  export default withPWAInit;
}
