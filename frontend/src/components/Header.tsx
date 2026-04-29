import React from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {}

const Header: React.FC<HeaderProps> = () => {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Link to="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">
                ScoutD3
              </Link>
            </div>
          </div>
          <div className="ml-4 flex items-center space-x-4">
            <div className="text-sm text-gray-500">NCAA Division III Scouting</div>
            {isAuthenticated && user ? (
              <>
                <Link to="/settings" className="text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors">
                  {user.username}
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-300 hover:text-gray-900"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;