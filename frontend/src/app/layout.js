import "./globals.css";

export const metadata = {
  title: "RMM Dashboard",
  description: "Remote Monitoring & Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
