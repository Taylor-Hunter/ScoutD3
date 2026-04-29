import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  CogIcon,
  BellIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  ScaleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

const VISIBLE_ACTIVITY_TYPES = new Set([
  'view_team',
  'view_team_stats',
  'view_team_analytics',
  'view_team_trends',
  'compare_teams',
  'generate_report',
  'download_team_stats_pdf',
  'download_report_pdf',
]);

const Settings: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [notifyReportComplete, setNotifyReportComplete] = useState(true);
  const [notifyDataUpdates, setNotifyDataUpdates] = useState(true);
  const [notifySystemAlerts, setNotifySystemAlerts] = useState(false);
  const [defaultSport, setDefaultSport] = useState('Basketball');
  const [reportFormat, setReportFormat] = useState('Detailed (Recommended)');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dataSharing, setDataSharing] = useState('Private');
  const [apiAccess, setApiAccess] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activity, setActivity] = React.useState<any[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const visibleActivity = activity.filter((event) => VISIBLE_ACTIVITY_TYPES.has(event.event_type));

  const formatActivity = (event: any) => {
    const meta = event.metadata || {};
    const teamName: string | undefined = meta.team_name;
    const opponentName: string | undefined = meta.comparison_team_name || meta.opponent_name;
    const reportTitle: string | undefined = meta.title;
    const teamId: string | undefined = event.team_id || meta.team_id;
    const opponentId: string | undefined = event.comparison_team_id || meta.comparison_team_id || meta.opponent_id;
    const reportId: string | undefined = meta.report_id || meta.id;

    // Derive a navigable frontend route based on the event type. Stored
    // `event.route` values often point at backend API endpoints (e.g.
    // /teams/2283/statistics) which don't exist in the frontend router, so
    // we build the destination from team/report ids instead.
    let linkTo: string | null = null;
    let linkLabel = 'Open';

    let icon = <EyeIcon className="h-5 w-5 text-indigo-500" />;
    let title = event.event_type.replaceAll('_', ' ');
    let subtitle: string | null = null;

    switch (event.event_type) {
      case 'view_team':
        icon = <EyeIcon className="h-5 w-5 text-indigo-500" />;
        title = teamName ? `Viewed ${teamName}` : 'Viewed team';
        linkLabel = 'Open team';
        if (teamId) linkTo = `/teams/${teamId}`;
        break;
      case 'view_team_stats':
        icon = <ChartBarIcon className="h-5 w-5 text-purple-500" />;
        title = teamName ? `Viewed ${teamName} statistics` : 'Viewed team statistics';
        linkLabel = 'Open team';
        if (teamId) linkTo = `/teams/${teamId}`;
        break;
      case 'view_team_analytics':
        icon = <ChartBarIcon className="h-5 w-5 text-blue-500" />;
        title = teamName ? `Viewed ${teamName} analytics` : 'Viewed team analytics';
        linkLabel = 'Open analytics';
        if (teamId) linkTo = `/analytics?team=${teamId}`;
        break;
      case 'view_team_trends':
        icon = <ChartBarIcon className="h-5 w-5 text-emerald-500" />;
        title = teamName ? `Viewed ${teamName} trends` : 'Viewed team trends';
        linkLabel = 'Open analytics';
        if (teamId) linkTo = `/analytics?team=${teamId}`;
        break;
      case 'compare_teams':
        icon = <ScaleIcon className="h-5 w-5 text-orange-500" />;
        title = teamName && opponentName
          ? `Compared ${teamName} vs ${opponentName}`
          : 'Compared teams';
        linkLabel = 'Open comparison';
        if (teamId && opponentId) {
          linkTo = `/analytics?team=${teamId}&comparison=${opponentId}`;
        } else if (teamId) {
          linkTo = `/analytics?team=${teamId}`;
        }
        break;
      case 'generate_report':
        icon = <DocumentTextIcon className="h-5 w-5 text-green-600" />;
        title = reportTitle || (teamName && opponentName ? `${teamName} vs ${opponentName} Scouting Report` : 'Generated scouting report');
        linkLabel = 'Open report';
        if (reportId) {
          linkTo = `/reports/${reportId}`;
        } else if (teamId && opponentId) {
          linkTo = `/scout/${teamId}/${opponentId}`;
        }
        break;
      case 'download_team_stats_pdf':
        icon = <ArrowDownTrayIcon className="h-5 w-5 text-slate-500" />;
        title = teamName ? `Downloaded ${teamName} stats PDF` : 'Downloaded team stats PDF';
        linkLabel = 'Open team';
        if (teamId) linkTo = `/teams/${teamId}`;
        break;
      case 'download_report_pdf':
        icon = <ArrowDownTrayIcon className="h-5 w-5 text-slate-500" />;
        title = reportTitle ? `Downloaded ${reportTitle} (PDF)` : 'Downloaded report PDF';
        linkLabel = 'Open report';
        if (reportId) linkTo = `/reports/${reportId}`;
        break;
      default:
        break;
    }

    if (teamName && opponentName && event.event_type !== 'compare_teams' && event.event_type !== 'generate_report') {
      subtitle = `${teamName} vs ${opponentName}`;
    }

    return { icon, title, subtitle, linkTo, linkLabel };
  };

  const handleSave = () => {
    // Save settings (in a real app this would call an API)
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  React.useEffect(() => {
    if (!isAuthenticated) {
      setActivity([]);
      return;
    }

    const loadActivity = async () => {
      setActivityLoading(true);
      try {
        const response = await api.auth.getActivity(20);
        setActivity(response.data.events || []);
      } catch {
        setActivity([]);
      } finally {
        setActivityLoading(false);
      }
    };

    void loadActivity();
  }, [isAuthenticated]);

  return (
    <>
      <Helmet>
        <title>Settings - ScoutD3</title>
        <meta name="description" content="Configure your ScoutD3 preferences and settings." />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="md:flex md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Settings
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Manage your account settings and preferences
              </p>
            </div>
          </div>

          {!isLoading && !isAuthenticated && (
            <div className="mt-8 rounded-lg border border-yellow-200 bg-yellow-50 p-6">
              <h3 className="text-lg font-medium text-yellow-900">Sign in to save your activity</h3>
              <p className="mt-2 text-sm text-yellow-800">
                Account history, login tracking, analytics views, and report activity are only saved when you are signed in with a unique username.
              </p>
              <div className="mt-4">
                <Link
                  to="/login"
                  state={{ from: '/settings' }}
                  className="inline-flex items-center rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
                >
                  Sign In Or Create Account
                </Link>
              </div>
            </div>
          )}

          {/* Settings sections */}
          <div className="mt-8 space-y-6">
            {/* Profile Settings */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <UserCircleIcon className="h-5 w-5 text-gray-500 mr-2" />
                  Profile Settings
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <div className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                    {user?.username || 'Not signed in'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Account Status</label>
                  <div className="block w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                    {user ? 'Authenticated and activity logging enabled' : 'Guest browsing only'}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="font-medium text-gray-900">Created:</span>{' '}
                    {user?.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">Last Login:</span>{' '}
                    {user?.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'N/A'}
                  </div>
                </div>
                {user && (
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <ClockIcon className="h-5 w-5 text-gray-500 mr-2" />
                  Recent Team Activity
                </h3>
              </div>
              <div className="px-6 py-4">
                {!user && <p className="text-sm text-gray-500">Sign in to see saved team views, analytics comparisons, and report history.</p>}
                {user && activityLoading && <p className="text-sm text-gray-500">Loading recent activity...</p>}
                {user && !activityLoading && visibleActivity.length === 0 && (
                  <p className="text-sm text-gray-500">No tracked team or analytics activity yet. View teams, open analytics, or generate reports and they will appear here.</p>
                )}
                {user && visibleActivity.length > 0 && (
                  <div className="space-y-3">
                    {visibleActivity.map((event) => {
                      const info = formatActivity(event);
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
                        >
                          <div className="mt-0.5 flex-shrink-0">{info.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">{info.title}</p>
                              <p className="text-xs text-gray-500 whitespace-nowrap">
                                {event.created_at ? new Date(event.created_at).toLocaleString() : ''}
                              </p>
                            </div>
                            {info.subtitle && (
                              <p className="mt-0.5 text-xs text-gray-600">{info.subtitle}</p>
                            )}
                          </div>
                          {info.linkTo && (
                            <Link
                              to={info.linkTo}
                              className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                            >
                              {info.linkLabel}
                              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Notification Settings */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <BellIcon className="h-5 w-5 text-gray-500 mr-2" />
                  Notification Settings
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center">
                  <input
                    id="report-complete"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={notifyReportComplete}
                    onChange={(e) => setNotifyReportComplete(e.target.checked)}
                  />
                  <label htmlFor="report-complete" className="ml-3 text-sm text-gray-700">
                    Notify when scouting reports are completed
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id="data-updates"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={notifyDataUpdates}
                    onChange={(e) => setNotifyDataUpdates(e.target.checked)}
                  />
                  <label htmlFor="data-updates" className="ml-3 text-sm text-gray-700">
                    Notify when team data is updated
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id="system-alerts"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={notifySystemAlerts}
                    onChange={(e) => setNotifySystemAlerts(e.target.checked)}
                  />
                  <label htmlFor="system-alerts" className="ml-3 text-sm text-gray-700">
                    Receive system maintenance alerts
                  </label>
                </div>
              </div>
            </div>

            {/* Application Settings */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <CogIcon className="h-5 w-5 text-gray-500 mr-2" />
                  Application Settings
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Default Sport
                  </label>
                  <select
                    value={defaultSport}
                    onChange={(e) => setDefaultSport(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option>Basketball</option>
                    <option>Soccer</option>
                    <option>Baseball</option>
                    <option>Softball</option>
                    <option>Volleyball</option>
                    <option>Lacrosse</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Report Format
                  </label>
                  <select
                    value={reportFormat}
                    onChange={(e) => setReportFormat(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option>Detailed (Recommended)</option>
                    <option>Summary</option>
                    <option>Custom</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    id="auto-refresh"
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  <label htmlFor="auto-refresh" className="ml-3 text-sm text-gray-700">
                    Automatically refresh team data
                  </label>
                </div>
              </div>
            </div>

            {/* Privacy & Security */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <ShieldCheckIcon className="h-5 w-5 text-gray-500 mr-2" />
                  Privacy & Security
                </h3>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Data Sharing</h4>
                    <p className="text-sm text-gray-500">Control how your data is shared with other users</p>
                  </div>
                  <select
                    value={dataSharing}
                    onChange={(e) => setDataSharing(e.target.value)}
                    className="ml-4 block px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option>Private</option>
                    <option>Team Only</option>
                    <option>Conference</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">API Access</h4>
                    <p className="text-sm text-gray-500">Enable API access for third-party integrations</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={apiAccess}
                    onChange={(e) => setApiAccess(e.target.checked)}
                  />
                </div>
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center justify-end space-x-4">
              {saved && (
                <div className="flex items-center text-green-600">
                  <CheckCircleIcon className="h-5 w-5 mr-1" />
                  <span className="text-sm font-medium">Settings saved!</span>
                </div>
              )}
              <button
                onClick={handleSave}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Settings;