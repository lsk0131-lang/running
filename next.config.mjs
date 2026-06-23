/** @type {import('next').NextConfig} */
const nextConfig = {
  // libSQL 클라이언트는 네이티브 모듈을 포함할 수 있어 번들링에서 제외합니다.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
