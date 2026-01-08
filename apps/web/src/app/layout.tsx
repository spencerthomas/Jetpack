import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jetpack - Multi-Agent Swarm Development',
  description: 'Kanban board for multi-agent task coordination',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
