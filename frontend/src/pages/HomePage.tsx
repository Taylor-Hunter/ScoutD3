import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { 
  ChartBarIcon, 
  DocumentTextIcon, 
  UsersIcon, 
  CloudArrowUpIcon,
  AcademicCapIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';

const HomePage: React.FC = () => {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await api.get('/stats');
      return response.data;
    },
  });
  const features = [
    {
      name: 'Multi-Sport Analytics',
      description: 'Support for basketball, soccer, baseball, softball, volleyball, lacrosse, and more.',
      icon: ChartBarIcon,
      href: '/analytics',
    },
    {
      name: 'Intelligent Scouting Reports',
      description: 'AI-powered opponent analysis with actionable strategic insights.',
      icon: DocumentTextIcon,
      href: '/reports',
    },
    {
      name: 'Team Management',
      description: 'Comprehensive team profiles and performance tracking.',
      icon: UsersIcon,
      href: '/teams',
    },
    {
      name: 'Automated Data Collection',
      description: 'Real-time ingestion from NCAA Division III sources.',
      icon: CloudArrowUpIcon,
      href: '/data',
    },
  ];

  const sports = [
    "Men's Basketball", "Women's Basketball", 'Baseball', 'Softball', 
    "Men's Soccer", "Women's Soccer", "Women's Volleyball"
  ];

  return (
    <>
      <Helmet>
        <title>ScoutD3 - NCAA Division III Multi-Sport Scouting System</title>
        <meta name="description" content="Professional opponent scouting and analytics platform for NCAA Division III athletics." />
      </Helmet>

      <div className="homepage-shell min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        {/* Hero Section */}
        <div className="homepage-hero homepage-hero-section relative overflow-hidden">
          <div className="pb-80 pt-16 sm:pb-40 sm:pt-24 lg:pb-48 lg:pt-40">
            <div className="relative mx-auto max-w-7xl px-4 sm:static sm:px-6 lg:px-8">
              <div className="sm:max-w-lg">
                <h1 className="homepage-hero-title text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                  <span className="text-indigo-600">Scout</span>D3
                </h1>
                <p className="homepage-hero-subtitle mt-4 text-xl text-gray-500">
                  NCAA Division III Multi-Sport Opponent Scouting System
                </p>
                <p className="homepage-hero-copy mt-6 text-lg text-gray-600">
                  Transform publicly available athletics data into actionable strategic insights. 
                  Generate professional scouting reports that give your team the competitive edge.
                </p>
                <p className="homepage-hero-note mt-4 max-w-xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                  ScoutD3 runs a one-time automatic NCAA load when first accessed. After that, use Data Ingestion whenever you want updated stats.
                </p>
              </div>
              
              <div className="mt-10">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <AcademicCapIcon className="mr-2 h-5 w-5" />
                    Open Dashboard
                  </Link>
                  <Link
                    to="/data"
                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-8 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <CloudArrowUpIcon className="mr-2 h-5 w-5" />
                    Monitor Data Sync
                  </Link>
                </div>
              </div>

              {/* Stats Section */}
              <div className="homepage-stats mt-16 grid grid-cols-1 gap-y-6 sm:grid-cols-3 sm:gap-x-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">{stats?.total_teams?.toLocaleString() || '...'}</div>
                  <div className="text-sm text-gray-500">Teams Tracked</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">{stats?.sports_covered || '...'}</div>
                  <div className="text-sm text-gray-500">Sports Covered</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">{stats?.total_games?.toLocaleString() || '...'}</div>
                  <div className="text-sm text-gray-500">Games Tracked</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="homepage-features-section bg-white py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="lg:text-center">
              <h2 className="text-base font-semibold uppercase tracking-wide text-indigo-600">Features</h2>
              <p className="mt-2 text-3xl font-bold leading-8 tracking-tight text-gray-900 sm:text-4xl">
                Everything you need for strategic preparation
              </p>
              <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
                ScoutD3 automatically collects, analyzes, and transforms Division III athletics data 
                into comprehensive opponent intelligence. Initial data loads automatically on first access, and all later updates are manual from Data Ingestion.
              </p>
            </div>

            <div className="mt-10">
              <div className="space-y-10 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10 md:space-y-0">
                {features.map((feature) => (
                  <div key={feature.name} className="relative">
                    <div className="absolute flex h-12 w-12 items-center justify-center rounded-md bg-indigo-500 text-white">
                      <feature.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="ml-16">
                      <h3 className="text-lg font-medium leading-6 text-gray-900">
                        <Link to={feature.href} className="hover:text-indigo-600">
                          {feature.name}
                        </Link>
                      </h3>
                      <p className="mt-2 text-base text-gray-500">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sports Section */}
        <div className="homepage-sports-section bg-indigo-50 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <TrophyIcon className="mx-auto h-12 w-12 text-indigo-600" />
              <h2 className="mt-4 text-3xl font-bold text-gray-900">Supported Sports</h2>
              <p className="mt-4 text-lg text-gray-600">
                Comprehensive analytics across all major NCAA Division III sports
              </p>
              
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                {sports.map((sport) => (
                  <span
                    key={sport}
                    className="inline-flex items-center rounded-full bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-800"
                  >
                    {sport}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="homepage-cta-section bg-indigo-700">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:pt-20 sm:pb-24 lg:px-8 lg:pt-24">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              <span className="block">Ready to gain the strategic advantage?</span>
            </h2>
            <p className="mt-4 text-xl text-indigo-200">
              ScoutD3 gives you control over updates: one automatic initial load, then manual refreshes whenever you want fresh data.
            </p>
            <div className="mt-8">
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-white px-8 py-3 text-base font-medium text-indigo-600 hover:bg-indigo-50"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="homepage-footer-section bg-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-base text-gray-500">
                ScoutD3 - Master's Project by Taylor Hunter
              </p>
              <p className="mt-1 text-sm text-gray-400">
                NCAA Division III Multi-Sport Opponent Scouting Report Generation System
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default HomePage;