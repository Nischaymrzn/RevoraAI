import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { SidebarProvider, useSidebar } from '../context/SidebarContext';
import { cn } from '../lib/utils';

function LayoutInner({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <Sidebar />
      <Navbar />
      <main
        className={cn(
          'pt-16 min-h-screen flex flex-col transition-[margin-left] duration-200 ease-in-out',
          collapsed ? 'ml-[72px]' : 'ml-[300px]'
        )}
      >
        {children}
      </main>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
