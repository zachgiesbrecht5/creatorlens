/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@creatorlens/engine"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};
export default nextConfig;
