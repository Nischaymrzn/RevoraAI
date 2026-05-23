import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderOpen, TrendingUp,
  LogOut, ChevronLeft, ChevronRight, Brain, GraduationCap,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSidebar } from '../context/SidebarContext';
import { cn } from '../lib/utils';

const navSections = [
  {
    label: 'Study',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/materials', icon: FolderOpen, label: 'Materials' },
      { to: '/study', icon: Brain, label: 'Knowledge AI' },
      { to: '/tutor', icon: GraduationCap, label: 'AI Tutor' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/progress', icon: TrendingUp, label: 'My Progress' },
    ],
  },
];

function Tooltip({ label }: { label: string }) {
  return (
    <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center bg-gray-900 text-white text-[12px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap z-50 shadow-lg pointer-events-none">
      {label}
      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </div>
  );
}

function NavItem({
  to, icon: Icon, label, collapsed,
}: {
  to: string; icon: any; label: string; collapsed: boolean;
}) {
  return (
    <div className="relative group">
      <NavLink
        to={to}
        className={({ isActive }) =>
          cn(
            'flex items-center rounded-lg font-medium transition-all duration-150 mb-0.5',
            collapsed
              ? 'justify-center w-full p-2.5'
              : 'gap-3.5 px-3 py-2.5',
            isActive
              ? 'bg-white/[0.09] text-white'
              : 'text-[#8A8F9B] hover:bg-white/[0.05] hover:text-gray-200'
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              size={20}
              strokeWidth={1.8}
              className={cn('flex-shrink-0 transition-colors', isActive ? 'text-white' : '')}
            />
            {!collapsed && (
              <span className="text-[15.5px]">{label}</span>
            )}
          </>
        )}
      </NavLink>
      {collapsed && <Tooltip label={label} />}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { collapsed, toggle } = useSidebar();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <aside
      className={cn(
        'min-h-screen bg-[#0f0f17] flex flex-col fixed left-0 top-0 z-40 transition-all duration-200 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-[300px]'
      )}
    >
      {/* Logo row */}
      <div
        className={cn(
          'h-16 flex items-center border-b border-white/[0.06] flex-shrink-0',
          collapsed ? 'justify-center' : 'px-5 justify-between'
        )}
      >
        {/* Logo mark + wordmark */}
        <div className="flex items-center gap-2.5 overflow-hidden">
          {/* Icon mark — white box on dark bg (mirrors auth page dark box on white bg) */}
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
            <GraduationCap size={17} className="text-[#0f0f17]" strokeWidth={1.8} />
          </div>

          {!collapsed && (
            <span className="font-bold text-white text-[17px] tracking-tight whitespace-nowrap">
              revora<span className="text-[#6DEB74]">.ai</span>
            </span>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={toggle}
            title="Collapse sidebar"
            className="w-7 h-7 flex items-center justify-center rounded-md text-white/30 hover:text-white/80 hover:bg-white/[0.07] transition-colors flex-shrink-0"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Expand button (collapsed only) */}
      {collapsed && (
        <div className="relative group flex justify-center pt-3 pb-1">
          <button
            onClick={toggle}
            title="Expand sidebar"
            className="w-8 h-8 flex items-center justify-center rounded-md text-white/30 hover:text-white/80 hover:bg-white/[0.07] transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <Tooltip label="Expand" />
        </div>
      )}

      {/* Nav links */}
      <nav className={cn('flex-1 py-4 overflow-y-auto', collapsed ? 'px-2' : 'px-3')}>
        <div className="space-y-6">
          {navSections.map((section) => (
            <div key={section.label}>
              {!collapsed ? (
                <p className="text-[10.5px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">
                  {section.label}
                </p>
              ) : (
                <div className="border-t border-white/[0.05] mb-3" />
              )}
              <div>
                {section.items.map((item) => (
                  <NavItem key={item.to} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Bottom — sign out + user */}
      <div className={cn('border-t border-white/[0.06]', collapsed ? 'px-2 py-3' : 'px-3 py-3')}>
        {/* Sign out */}
        <div className="relative group">
          <button
            onClick={handleLogout}
            className={cn(
              'w-full flex items-center rounded-lg text-[#8A8F9B] hover:bg-white/[0.05] hover:text-red-400 transition-all duration-150 mb-1.5',
              collapsed ? 'justify-center p-2.5' : 'gap-3.5 px-3 py-2.5'
            )}
          >
            <LogOut size={20} strokeWidth={1.8} className="flex-shrink-0" />
            {!collapsed && <span className="text-[14.5px] font-medium">Sign out</span>}
          </button>
          {collapsed && <Tooltip label="Sign out" />}
        </div>

        {/* User profile */}
        <div
          className={cn(
            'flex items-center rounded-lg hover:bg-white/[0.04] transition-colors cursor-default',
            collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'
          )}
        >
          <div className="w-8 h-8 bg-white/[0.1] rounded-full flex items-center justify-center text-gray-300 text-[12px] font-bold flex-shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-gray-100 truncate">{user?.name}</p>
              <p className="text-[11.5px] text-gray-500 truncate">{user?.email}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
