import { Nav } from "./components/Nav";

export const metadata = { title: "Meu Assessor" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0f1115", color: "#e8e8e8", margin: 0 }}>
        <Nav />
        {children}
      </body>
    </html>
  );
}
