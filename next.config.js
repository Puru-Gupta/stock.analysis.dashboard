/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prefer Node runtime for NSE/Yahoo market data agents
  serverExternalPackages: ["stock-nse-india", "yahoo-finance2"],
};

module.exports = nextConfig;
