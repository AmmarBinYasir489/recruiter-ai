/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  ...(process.env.PORTAL_BUILD_CHECK === "1" ? { distDir: ".next-build-check" } : {}),
  ...(process.env.NODE_ENV !== "production" && process.env.PORTAL_QA === "1" ? { distDir: ".next-qa" } : {}),
  // Keep output tracing inside this app when a parent directory also contains
  // a lockfile (common on local Windows development machines).
  outputFileTracingRoot: process.cwd(),
  async headers() {
    const productionHeaders = process.env.NODE_ENV === "production"
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
      : [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          ...productionHeaders,
        ],
      },
    ];
  },
};

export default nextConfig;
