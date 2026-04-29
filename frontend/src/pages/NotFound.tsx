import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  HomeIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const NotFound: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>Page Not Found - ScoutD3</title>
        <meta name="description" content="The page you're looking for could not be found." />
      </Helmet>

      <div className="min-h-screen bg-white px-4 py-16 sm:px-6 sm:py-24 md:grid md:place-items-center lg:px-8">
        <div className="max-w-max mx-auto">
          <main className="sm:flex">
            <div className="flex-shrink-0 flex items-center justify-center">
              <ExclamationTriangleIcon className="h-12 w-12 text-indigo-600" />
            </div>
            <div className="sm:ml-6">
              <div className="sm:border-l sm:border-gray-200 sm:pl-6">
                <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
                  404
                </h1>
                <p className="mt-1 text-base text-gray-500">
                  Page not found
                </p>
              </div>
              <div className="mt-10 flex space-x-3 sm:border-l sm:border-transparent sm:pl-6">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <HomeIcon className="mr-2 h-4 w-4" />
                  Go to Dashboard
                </Link>
                <Link
                  to="/teams"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
                  Browse Teams
                </Link>
              </div>
            </div>
          </main>
          
          {/* Additional help text */}
          <div className="mt-12 text-center sm:text-left sm:ml-18">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Looking for something specific?
            </h2>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>
                <Link to="/teams" className="text-indigo-600 hover:text-indigo-500">
                  Browse teams and generate scouting reports
                </Link>
              </li>
              <li>
                <Link to="/analytics" className="text-indigo-600 hover:text-indigo-500">
                  View advanced team analytics and insights
                </Link>
              </li>
              <li>
                <Link to="/reports" className="text-indigo-600 hover:text-indigo-500">
                  Access your generated scouting reports
                </Link>
              </li>
              <li>
                <Link to="/data" className="text-indigo-600 hover:text-indigo-500">
                  Manage data ingestion and updates
                </Link>
              </li>
              <li>
                <Link to="/help" className="text-indigo-600 hover:text-indigo-500">
                  Get help and support
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound;