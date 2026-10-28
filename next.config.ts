import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Do not put private chat responses in a shared CDN cache. Only static
  // immutable assets and public images use caching; Supabase REST uses no-store.
  async headers(){
    return [{
      source:"/(.*)",
      headers:[
        {key:"X-Content-Type-Options",value:"nosniff"},
        {key:"X-Frame-Options",value:"DENY"},
        {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
        {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(), payment=()"},
        {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"}
      ]
    }];
  }
};

export default nextConfig;
