import React from 'react';

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  children: React.ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const navItems = [
    { key: 'config', label: '配置管理' },
    { key: 'benchmark', label: '性能测试' },
    { key: 'rolechat', label: '角色问答' },
  ];

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <h2 className="logo">latte-models</h2>
        {navItems.map(item => (
          <button
            key={item.key}
            className={`nav-btn ${currentPage === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
