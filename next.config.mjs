/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3는 네이티브 모듈이라 번들링에서 제외해야 합니다.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
