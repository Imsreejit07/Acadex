'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  ClipboardList,
  Calculator,
  BarChart3,
  BookOpen,
  FileText,
  GraduationCap,
  Bell,
  Menu,
  X,
  ChevronRight,
  Settings,
  LogOut,
  ListTodo,
  CalendarDays,
  Sun,
  Moon
} from 'lucide-react';

import { useAttendanceStore } from '@/features/attendance/services/attendance-store';

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/events',     label: 'Academic Events',  icon: ListTodo        },
  { href: '/semester',   label: 'Semester Manager', icon: CalendarDays    },
  { href: '/history',    label: 'Lecture History',  icon: ClipboardList   },
  { href: '/calculator', label: 'Calculator',       icon: Calculator      },
  { href: '/analytics',  label: 'Analytics',        icon: BarChart3       },
  { href: '/subjects',   label: 'Subjects',         icon: BookOpen        },
  { href: '/analyze',    label: 'PDF AI Import',    icon: FileText        },
  { href: '/settings',   label: 'Settings',         icon: Settings        },
];

function Sidebar({
  open,
  onClose,
  activeLabel,
}: {
  open: boolean;
  onClose: () => void;
  activeLabel: string;
}) {
  const pathname = usePathname();
  const { onboarding } = useAttendanceStore();
  const semesterName = onboarding.semesterName || 'Semester';
  const userName = onboarding.userName || 'Student';
  const initials = userName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 z-30 flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ backgroundColor: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}
      >
        {/* Logo */}
        <div
          className="px-5 h-16 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-secondary border border-border"
            >
              <GraduationCap size={15} className="text-foreground" />
            </div>
            <span className="font-bold text-foreground text-sm tracking-wide">Acadex</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-muted-foreground hover:text-foreground p-1 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Semester chip */}
        <div
          className="mx-4 mt-4 px-3 py-2.5 rounded-xl shrink-0 bg-secondary border border-border"
        >
          <p className="text-xs font-bold text-foreground">{semesterName}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-foreground)' }}>
            {onboarding.academicYear || 'Academic Year'}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  active
                    ? 'bg-secondary text-foreground border-border font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary border-transparent'
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div
          className="px-4 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--sidebar-border)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-foreground shrink-0 border border-border"
                style={{ background: 'linear-gradient(135deg, var(--secondary), var(--border))' }}
              >
                {initials || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{semesterName}</p>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('onboarding_data');
                window.location.href = '/login';
              }}
              title="Log Out"
              className="p-2 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-secondary transition-colors shrink-0"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (systemDark ? 'dark' : 'light');
    setTheme(initial);
    if (initial === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const activeLabel =
    NAV_ITEMS.find((item) => {
      if (item.href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
      return pathname.startsWith(item.href);
    })?.label ?? 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} activeLabel={activeLabel} />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        {/* Top header */}
        <header
          className="h-16 flex items-center justify-between px-6 shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary transition-colors"
            >
              <Menu size={19} />
            </button>
            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Acadex</span>
              <ChevronRight size={13} className="text-muted-foreground/60" />
              <span className="text-foreground font-semibold">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground bg-secondary hover:bg-muted-foreground/10 transition-colors border border-border"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={15} className="text-amber-500" /> : <Moon size={15} className="text-indigo-600" />}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}