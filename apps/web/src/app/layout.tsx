import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jetpack Cloud',
  description: 'Decentralized multi-agent swarm dashboard',
};

function Sidebar() {
  const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/tasks', label: 'Tasks', icon: '📋' },
    { href: '/agents', label: 'Agents', icon: '🤖' },
  ];

  return (
    <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <h1 className="text-xl font-bold text-cyan-400">Jetpack Cloud</h1>
        <p className="text-xs text-zinc-500 mt-1">Multi-Agent Swarm</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600">
        v0.1.0
      </div>
    </aside>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </body>
    </html>
  );
}
