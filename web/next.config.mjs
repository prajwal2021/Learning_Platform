const API_URL = process.env.API_URL || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // small self-contained server for the Docker image
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // do not ship readable source to the browser
  // The browser only ever talks to this server; /api/* is forwarded to FastAPI by src/app/api/[...path]/route.ts
  // (a proxy with cached DNS and kept-alive connections), so the session cookie is same-origin.
  env: { API_URL },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // SAMEORIGIN, not DENY: the Core Build workbooks are pages of this site shown in a frame on this site
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://appleid.apple.com" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
