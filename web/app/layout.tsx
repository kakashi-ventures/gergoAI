import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gergo · console della postazione",
  description: "Allenare il braccio a voce, nella sua postazione.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
