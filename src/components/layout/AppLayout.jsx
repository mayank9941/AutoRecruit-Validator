import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="app-main">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="app-content animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
