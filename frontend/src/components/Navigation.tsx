import React from 'react';
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
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex items-baseline space-x-4">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    item.current
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  } flex items-center rounded-md px-3 py-2 text-sm font-medium`}
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
    </nav>
  );
};

export default Navigation;