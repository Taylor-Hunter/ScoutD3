import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  Squares2X2Icon,
  UsersIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CloudArrowUpIcon,
  CogIcon,
  QuestionMarkCircleIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  current: boolean;
}

interface NavigationProps {}

const Navigation: React.FC<NavigationProps> = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-close the mobile drawer when the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navigation: NavigationItem[] = [
    { name: 'Home', href: '/', icon: HomeIcon, current: location.pathname === '/' },
    { name: 'Dashboard', href: '/dashboard', icon: Squares2X2Icon, current: location.pathname === '/dashboard' },
    { name: 'Data Ingestion', href: '/data', icon: CloudArrowUpIcon, current: location.pathname === '/data' },
    { name: 'Teams', href: '/teams', icon: UsersIcon, current: location.pathname.startsWith('/teams') },
    { name: 'Analytics', href: '/analytics', icon: ChartBarIcon, current: location.pathname === '/analytics' },
    { name: 'Reports', href: '/reports', icon: DocumentTextIcon, current: location.pathname.startsWith('/reports') },
    { name: 'Settings', href: '/settings', icon: CogIcon, current: location.pathname === '/settings' },
    { name: 'Help', href: '/help', icon: QuestionMarkCircleIcon, current: location.pathname === '/help' },
  ];

  return (
    <nav className="bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Mobile bar */}
        <div className="flex h-14 items-center justify-between md:hidden">
          <span className="text-sm font-semibold text-white">Menu</span>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-300 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            aria-controls="mobile-nav"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? (
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Desktop / tablet bar */}
        <div className="hidden md:flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex items-baseline space-x-2 lg:space-x-4">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    item.current
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  } flex items-center rounded-md px-2 lg:px-3 py-2 text-sm font-medium`}
                  aria-current={item.current ? 'page' : undefined}
                >
                  <item.icon className="mr-1.5 h-5 w-5" aria-hidden="true" />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        className={`md:hidden border-t border-gray-800 ${mobileOpen ? 'block' : 'hidden'}`}
      >
        <div className="space-y-1 px-2 pb-3 pt-2">
          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={`${
                item.current
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              } flex items-center rounded-md px-3 py-2 text-base font-medium`}
              aria-current={item.current ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon className="mr-2 h-5 w-5" aria-hidden="true" />
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;