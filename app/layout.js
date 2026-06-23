import "./globals.css";

export const metadata = {
  title: "러닝 대시보드",
  description: "애플워치 러닝 데이터 대시보드",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
