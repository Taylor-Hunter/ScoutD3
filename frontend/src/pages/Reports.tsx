import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DocumentTextIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  UserGroupIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';

interface Report {
  id: string;
  title: string;
  team_name: string;
  opponent_name: string;
  sport: string;
  season: string;
  generated_at: string;
  status: 'completed' | 'processing' | 'failed';
  summary?: {
    key_insights_count: number;
    strategic_recommendations_count: number;
    confidence_score: number;
  };
  overall_statistics?: {
    team?: {
      name?: string;
      record?: string;
      stats?: Record<string, unknown>;
    };
    opponent?: {
      name?: string;
      record?: string;
      stats?: Record<string, unknown>;
    };
  };
}

const getPrimaryStatKeys = (sport: string): string[] => {
  const normalized = (sport || '').toLowerCase();
  if (normalized.includes('soccer')) {
    return ['ppg', 'gaa'];
  }
  if (normalized.includes('volleyball')) {
    return ['assists_per_set', 'blocks_per_set'];
  }
  if (normalized.includes('baseball') || normalized.includes('softball')) {
    return ['batting_avg', 'era'];
  }
  return ['ppg', 'opp_ppg'];
};

const statLabel = (key: string): string => {
  const labels: Record<string, string> = {
    ppg: 'PPG',
    opp_ppg: 'Opp PPG',
    gaa: 'GAA',
    assists_per_set: 'AST/Set',
    blocks_per_set: 'BLK/Set',
    batting_avg: 'Batting Avg',
    era: 'ERA',
  };
  return labels[key] || key;
};

const statValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return String(value);
  }
  if (key === 'batting_avg') {
    return num.toFixed(3);
  }
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
};

const buildStatSummary = (sport: string, stats?: Record<string, unknown>): string => {
  const keys = getPrimaryStatKeys(sport);
  return keys
    .map((key) => `${statLabel(key)}: ${statValue(key, stats?.[key])}`)
    .join(' | ');
};

const Reports: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const queryClient = useQueryClient();

  // Fetch reports
  const { data: reportsResponse, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.reports.getAll(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Delete report mutation
  const deleteReport = useMutation(
    (reportId: string) => api.reports.delete(reportId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['reports'] });
      },
    }
  );

  const reports: Report[] = reportsResponse?.data?.reports || [];

  // Filter reports
  const filteredReports = reports.filter((report: Report) => {
    const matchesSearch = !searchQuery || 
      report.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.team_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.opponent_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSport = !selectedSport || report.sport === selectedSport;
    const matchesStatus = !selectedStatus || report.status === selectedStatus;

    return matchesSearch && matchesSport && matchesStatus;
  });

  const sports = ['basketball', 'soccer', 'baseball', 'softball', 'volleyball', 'lacrosse'];
  const statuses = ['completed', 'processing', 'failed'];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const downloadPdf = async (reportId: string, title: string) => {
    try {
      const response = await api.reports.getPdf(reportId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  return (
    <>
      <Helmet>
        <title>Scouting Reports - ScoutD3</title>
        <meta name="description" content="Browse and manage your NCAA Division III scouting reports." />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="md:flex md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Scouting Reports
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Professional opponent analysis reports for strategic preparation once NCAA data has loaded
              </p>
            </div>
            <div className="mt-4 md:ml-4 md:mt-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Generate New Report From</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  to="/teams"
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Teams Tab
                </Link>
                <Link
                  to="/analytics"
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  Analytics Tab
                </Link>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Search */}
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search Reports
                  </label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute inset-y-0 left-0 pl-3 h-5 w-5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Search by title, teams, or sport..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Sport Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sport
                  </label>
                  <select
                    className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={selectedSport}
                    onChange={(e) => setSelectedSport(e.target.value)}
                  >
                    <option value="">All Sports</option>
                    {sports.map(sport => (
                      <option key={sport} value={sport}>
                        {sport.charAt(0).toUpperCase() + sport.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                  >
                    <option value="">All Status</option>
                    {statuses.map(status => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Clear filters */}
              {(searchQuery || selectedSport || selectedStatus) && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedSport('');
                      setSelectedStatus('');
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Reports Summary */}
          <div className="mt-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <DocumentTextIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Total Reports</dt>
                        <dd className="text-lg font-medium text-gray-900">{filteredReports.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <UserGroupIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Completed</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {filteredReports.filter(r => r.status === 'completed').length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <CalendarIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">This Week</dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {filteredReports.filter(r => {
                            const reportDate = new Date(r.generated_at);
                            const weekAgo = new Date();
                            weekAgo.setDate(weekAgo.getDate() - 7);
                            return reportDate > weekAgo;
                          }).length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reports List */}
          {isLoading ? (
            <div className="mt-8 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-white shadow rounded-lg p-6">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-300 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-300 rounded w-2/3"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredReports.length > 0 ? (
            <div className="mt-8 space-y-4">
              {filteredReports.map((report) => (
                <div key={report.id} className="bg-white shadow rounded-lg">
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <h3 className="text-lg font-medium text-gray-900">
                            {report.title}
                          </h3>
                          <span className={`ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(report.status)}`}>
                            {report.status === 'completed' ? 'Completed' : report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                          </span>
                        </div>
                        
                        <div className="mt-2 flex items-center text-sm text-gray-500 space-x-6">
                          <div className="flex items-center">
                            <UserGroupIcon className="h-4 w-4 mr-1" />
                            {report.team_name} vs {report.opponent_name}
                          </div>
                          <div className="flex items-center">
                            <TrophyIcon className="h-4 w-4 mr-1" />
                            {report.sport.charAt(0).toUpperCase() + report.sport.slice(1)}
                          </div>
                          <div className="flex items-center">
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            {new Date(report.generated_at).toLocaleDateString()}
                          </div>
                        </div>

                        {report.summary && (
                          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Key Insights:</span>{' '}
                              <span className="font-medium text-gray-900">{report.summary.key_insights_count}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Recommendations:</span>{' '}
                              <span className="font-medium text-gray-900">{report.summary.strategic_recommendations_count}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Confidence:</span>{' '}
                              <span className="font-medium text-gray-900">{Math.round(report.summary.confidence_score * 100)}%</span>
                            </div>
                          </div>
                        )}

                        {report.overall_statistics && (
                          <div className="mt-4 rounded-md border border-indigo-100 bg-indigo-50 p-3 text-xs text-gray-700">
                            <p className="font-semibold text-indigo-800">Overall Team Stats</p>
                            {report.overall_statistics.team && (
                              <p className="mt-1">
                                <span className="font-medium">{report.overall_statistics.team.name || report.team_name}</span>
                                {' '}({report.overall_statistics.team.record || 'N/A'}){' '}
                                - {buildStatSummary(report.sport, report.overall_statistics.team.stats)}
                              </p>
                            )}
                            {report.overall_statistics.opponent && (
                              <p className="mt-1">
                                <span className="font-medium">{report.overall_statistics.opponent.name || report.opponent_name}</span>
                                {' '}({report.overall_statistics.opponent.record || 'N/A'}){' '}
                                - {buildStatSummary(report.sport, report.overall_statistics.opponent.stats)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-3 ml-6">
                        {report.status === 'completed' && (
                          <>
                            <Link
                              to={`/reports/${report.id}`}
                              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <EyeIcon className="h-4 w-4 mr-1" />
                              View
                            </Link>
                            <button
                              onClick={() => downloadPdf(report.id, report.title)}
                              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                              PDF
                            </button>
                          </>
                        )}
                        
                        {report.status === 'processing' && (
                          <div className="flex items-center text-sm text-yellow-600">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
                            Processing...
                          </div>
                        )}

                        <button
                          onClick={() => deleteReport.mutate(report.id)}
                          disabled={deleteReport.isLoading}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No reports found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {reports.length === 0 
                  ? "You haven't generated any scouting reports yet. If teams are still empty, wait for the initial load to finish or use Data Ingestion to run a manual refresh."
                  : "No reports match your current filters."
                }
              </p>
              <div className="mt-6">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Choose Where To Generate</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <Link
                    to="/teams"
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    Teams Tab
                  </Link>
                  <Link
                    to="/analytics"
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    Analytics Tab
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Help Section */}
          <div className="mt-12">
            <div className="bg-blue-50 rounded-lg p-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <DocumentTextIcon className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    About Scouting Reports
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>
                      ScoutD3 generates comprehensive opponent analysis reports that include:
                    </p>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      <li>Team identity and playing style analysis</li>
                      <li>Key strengths and areas to target</li>
                      <li>Strategic recommendations for game preparation</li>
                      <li>Statistical comparisons and matchup insights</li>
                      <li>Recent performance trends and form analysis</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Reports;