/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'apihub.agnes-ai.com' },
    ],
  },
}

module.exports = nextConfig
