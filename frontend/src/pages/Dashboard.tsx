import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import {
  UsersIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CloudArrowUpIcon,
  TrophyIcon,
  PlayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';
import { useAppSettings, refetchIntervalFor } from '../hooks/useAppSettings';

// API functions  
const fetchStats = async () => {
  const response = await api.get('/stats');
  return response.data;
};

const fetchTeams = async () => {
  const response = await api.get('/teams');
  return response.data;
};

const Dashboard: React.FC = () => {
  const { settings: appSettings } = useAppSettings();

  // Fetch real data from backend
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats
  });

  const { data: teamsData, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams
  });

  const { data: scrapeStatusResponse } = useQuery({
    queryKey: ['dashboard-scrape-status'],
    queryFn: () => api.system.getScrapeStatus(),
    staleTime: 10000,
    refetchInterval: refetchIntervalFor(10000, appSettings.autoRefresh),
    retry: 1,
  });

  const hasImportedData = (stats?.total_teams || 0) > 0;
  const isScraping = Boolean(scrapeStatusResponse?.data?.is_scraping);
  const progressPercent = Number(scrapeStatusResponse?.data?.progress_percent ?? 0);
  const scrapePhase = String(scrapeStatusResponse?.data?.phase || 'Preparing NCAA load');
  const runLabel = String(scrapeStatusResponse?.data?.run_label || '');

  const loadMode = runLabel === 'first_access_auto'
    ? 'Initial automatic load'
    : runLabel === 'manual_refresh' || runLabel === 'manual_full' || runLabel === 'manual_sample'
      ? 'Manual refresh'
      : 'Data load';

  const quickActions = [
    {
      name: hasImportedData ? 'Manage Data Sync' : 'Monitor Initial Data Load',
      description: hasImportedData
        ? 'Check refresh status or trigger a manual NCAA data refresh'
        : 'ScoutD3 will load NCAA data automatically on first access',
      icon: CloudArrowUpIcon,
      href: '/data',
      color: 'bg-orange-500 hover:bg-orange-600',
    },
    {
      name: 'Generate Scouting Report',
      description: 'Create a new opponent analysis report',
      icon: DocumentTextIcon,
      href: '/teams',
      color: 'bg-blue-500 hover:bg-blue-600',
    },
    {
      name: 'Browse Teams',
      description: 'Explore NCAA Division III teams',
      icon: UsersIcon,
      href: '/teams',
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      name: 'View Analytics',
      description: 'Advanced team and game analytics',
      icon: ChartBarIcon,
      href: '/analytics',
      color: 'bg-purple-500 hover:bg-purple-600',
    },
  ];

  return (
    <>
      <Helmet>
        <title>Dashboard - ScoutD3</title>
        <meta name="description" content="ScoutD3 dashboard with team analytics and scouting tools." />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="md:flex md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Scouting Dashboard
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {hasImportedData
                  ? 'Welcome to your NCAA Division III scouting command center'
                  : 'ScoutD3 runs one automatic first-access load. Use Data Ingestion for manual refreshes'}
              </p>
            </div>
            <div className="mt-4 flex md:ml-4 md:mt-0">
              <Link
                to={hasImportedData ? '/teams' : '/data'}
                className="dashboard-primary-cta inline-flex items-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                <PlayIcon className="mr-1.5 h-5 w-5" />
                {hasImportedData ? 'Start Scouting' : 'Check Data Load Status'}
              </Link>
            </div>
          </div>

          {/* Stats overview */}
          <div className="mt-8">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <UsersIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Teams</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">
                          {statsLoading ? '...' : stats?.total_teams || 0}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <TrophyIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Games</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">
                          {statsLoading ? '...' : stats?.total_games || 0}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ChartBarIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Sports Covered</dt>
                      <dd className="flex items-baseline">
                        <div className="text-2xl font-semibold text-gray-900">
                          {statsLoading ? '...' : stats?.sports_covered || 0}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <DocumentTextIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">System Status</dt>
                      <dd className="flex items-baseline">
                        <div className="text-lg font-semibold text-green-600">
                          {statsLoading ? '...' : stats?.system_status || 'Unknown'}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Link
                  key={action.name}
                  to={action.href}
                  className={`quick-action-card relative group ${action.color} rounded-lg p-6 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 transition-all duration-200`}
                >
                  <div>
                    <span className="quick-action-icon-badge rounded-lg inline-flex p-3 bg-white bg-opacity-10 text-white">
                      <action.icon className="h-6 w-6" />
                    </span>
                  </div>
                  <div className="mt-8">
                    <h3 className="quick-action-title text-lg font-medium text-white">
                      <span className="absolute inset-0" />
                      {action.name}
                    </h3>
                    <p className="quick-action-description mt-2 text-sm text-white text-opacity-90">
                      {action.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* System status */}
          <div className="mt-8">
            <div className="rounded-lg bg-yellow-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <CloudArrowUpIcon className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Data Collection Status
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      {isScraping
                        ? `${loadMode} is in progress (${progressPercent}%).`
                        : hasImportedData
                          ? `System operational with ${stats?.total_teams || 0} teams loaded.`
                          : 'No NCAA data is loaded yet. ScoutD3 starts a one-time load on first access; open Data Ingestion to monitor or run manual loads.'}
                    </p>
                    {isScraping && (
                      <>
                        <p className="mt-1 inline-flex items-center gap-1">
                          <ClockIcon className="h-4 w-4" />
                          Current phase: {scrapePhase}
                        </p>
                        <div className="mt-2 h-2 w-full rounded-full bg-yellow-200">
                          <div
                            className="h-2 rounded-full bg-yellow-500 transition-all duration-300"
                            style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  {(!hasImportedData || isScraping) && (
                    <div className="mt-4">
                      <Link
                        to="/data"
                        className="text-sm font-medium text-yellow-800 underline hover:text-yellow-700"
                      >
                        Open Detailed Load Status →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent activity - placeholder for now */}
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Available Teams</h3>
                  <Link 
                    to="/teams"
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                  >
                    View all teams →
                  </Link>
                </div>
                
                {teamsLoading ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    <p className="mt-2 text-sm text-gray-500">Loading teams...</p>
                  </div>
                ) : teamsData?.teams?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {teamsData.teams.slice(0, 4).map((team: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 bg-indigo-600 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-white">{team.name.charAt(0)}</span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{team.name}</div>
                            <div className="text-sm text-gray-500">{team.conference} • {team.sport}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <UsersIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">No teams available yet.</p>
                    <Link 
                      to="/data" 
                      className="mt-2 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Run Data Ingestion →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Getting Started */}
          <div className="mt-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Getting Started</h3>
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul role="list" className="divide-y divide-gray-200">
                <li>
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-700">1</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          Initial NCAA Data Load
                        </div>
                        <div className="text-sm text-gray-500">
                          ScoutD3 runs this once on first access and saves the latest successful dataset
                        </div>
                      </div>
                    </div>
                    <Link 
                      to="/data"
                      className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
                    >
                      View Status
                    </Link>
                  </div>
                </li>
                <li>
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-700">2</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          Browse Teams and Opponents  
                        </div>
                        <div className="text-sm text-gray-500">
                          Explore teams and select opponents for analysis
                        </div>
                      </div>
                    </div>
                    <Link 
                      to="/teams"
                      className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
                    >
                      Browse Teams
                    </Link>
                  </div>
                </li>
                <li>
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-indigo-700">3</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          Generate Scouting Reports
                        </div>
                        <div className="text-sm text-gray-500">
                          Create professional opponent analysis reports
                        </div>
                      </div>
                    </div>
                    <Link 
                      to="/reports"
                      className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
                    >
                      View Reports
                    </Link>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;