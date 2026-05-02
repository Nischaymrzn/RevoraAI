import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Bell } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSidebar } from '../context/SidebarContext';
import { cn } from '../lib/utils';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/materials': 'Materials',
  '/study':     'Knowledge AI',
  '/progress':  'My Progress',
};

export default function Navbar() {
  const { user } = useAuthStore();
  const { pathname } = useLocation();
  const { collapsed } = useSidebar();
  const [search, setSearch] = useState('');

  const title = pageTitles[pathname] ?? 'Revora';
  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <header
      className={cn(
        'h-16 bg-white border-b border-border fixed top-0 right-0 z-30 flex items-center px-6 gap-4 transition-[left] duration-200 ease-in-out',
        collapsed ? 'left-[72px]' : 'left-[300px]'
      )}
    >
      {/* Page title */}
      <h2 className="text-[19px] font-semibold text-gray-800 flex-shrink-0">{title}</h2>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden sm:block">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className={cn(
            'h-9 pl-9 pr-3 w-56 rounded-lg border border-border bg-gray-50 text-[14px]',
            'text-gray-700 placeholder:text-gray-400',
            'focus:outline-none focus:ring-2 focus:ring-[#6DEB74]/30 focus:border-[#6DEB74]/50 focus:w-72 transition-all duration-200'
          )}
        />
      </div>

      {/* Notification bell */}
      <button className="relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
        <Bell size={18} />
      </button>

      {/* Profile avatar */}
      <div className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-[12px] font-bold flex-shrink-0">
          {initials}
        </div>
        <span className="hidden md:block text-[14px] font-medium text-gray-700 max-w-[110px] truncate">
          {user?.name?.split(' ')[0]}
        </span>
      </div>
    </header>
  );
}
