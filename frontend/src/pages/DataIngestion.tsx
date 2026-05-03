import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CloudArrowUpIcon,
  PlayIcon,
  ChartBarIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';
import { useAppSettings, refetchIntervalFor } from '../hooks/useAppSettings';

const DataIngestion: React.FC = () => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { settings: appSettings } = useAppSettings();

  // Fetch system summary
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['ingestion-summary'],
    queryFn: () => api.ingestion.comprehensive.getSummary(),
    refetchInterval: refetchIntervalFor(5000, appSettings.autoRefresh),
  });

  // Fetch discovery preview
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ['discovery-preview'],
    queryFn: () => api.ingestion.comprehensive.getDiscoveryPreview()
  });

  // Poll job status while there's an active job (display handled by top-of-page banner).
  useQuery({
    queryKey: ['job-status', activeJobId],
    queryFn: () => activeJobId ? api.ingestion.comprehensive.getStatus(activeJobId) : null,
    enabled: !!activeJobId,
    refetchInterval: refetchIntervalFor(2000, appSettings.autoRefresh),
  });

  // Start full ingestion mutation
  const startFullIngestion = useMutation({
    mutationFn: () => api.ingestion.comprehensive.startFull(),
    onSuccess: (response) => {
      // The response should contain job_id if available
      if (response.data.job_id) {
        setActiveJobId(response.data.job_id);
      }
      refetchSummary();
    },
    onError: (error) => {
      console.error('Failed to start full ingestion:', error);
    },
  });

  // Start sample ingestion mutation
  const startSampleIngestion = useMutation({
    mutationFn: (numColleges: number) => api.ingestion.comprehensive.startSample(numColleges),
    onSuccess: (response) => {
      if (response.data.job_id) {
        setActiveJobId(response.data.job_id);
      }
      refetchSummary();
    },
    onError: (error) => {
      console.error('Failed to start sample ingestion:', error);
    },
  });

  const systemStats = summary?.data?.database_status;
  const isSystemReady = summary?.data?.system_ready;
  const startupMessage = summary?.data?.startup_message;
  const startupPlan = summary?.data?.startup_plan;
  const loadProgress = summary?.data?.load_progress;
  const hasBackgroundLoad = Boolean(loadProgress?.is_scraping);

  return (
    <>
      <Helmet>
        <title>Data Ingestion - ScoutD3</title>
        <meta name="description" content="NCAA Division III data collection and manual refresh controls." />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="md:flex md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Data Ingestion
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Monitor initial load status and run manual NCAA data refreshes when needed
              </p>
            </div>
          </div>

          {/* System Status */}
          <div className="mt-6">
            <div className={`rounded-lg p-4 ${isSystemReady ? 'bg-green-50' : 'bg-yellow-50'}`}>
              <div className="flex">
                <div className="flex-shrink-0">
                  {isSystemReady ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-400" />
                  ) : (
                    <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
                  )}
                </div>
                <div className="ml-3">
                  <h3 className={`text-sm font-medium ${isSystemReady ? 'text-green-800' : 'text-yellow-800'}`}>
                    System Status: {isSystemReady ? 'Ready' : 'Setup Required'}
                  </h3>
                  <div className={`mt-2 text-sm ${isSystemReady ? 'text-green-700' : 'text-yellow-700'}`}>
                    <p>
                      {isSystemReady
                        ? `Database contains ${systemStats?.total_teams || 0} teams and ${systemStats?.total_games || 0} games.`
                        : 'No data has been loaded yet. ScoutD3 will run a one-time automatic load when first accessed.'
                      }
                    </p>
                    {startupMessage && (
                      <p className="mt-2 font-medium">{startupMessage}</p>
                    )}
                    {startupPlan && (
                      <p className="mt-1 text-xs opacity-90">
                        Initial load: {startupPlan.initial} | Updates: {startupPlan.updates}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Load progress */}
          {hasBackgroundLoad && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-2 flex items-center justify-between text-sm text-blue-900">
                <span className="font-medium">
                  {loadProgress?.run_label === 'first_access_auto' ? 'Initial automatic load in progress' :
                    loadProgress?.run_label === 'manual_refresh' || loadProgress?.run_label === 'manual_full' || loadProgress?.run_label === 'manual_sample' ? 'Manual data load in progress' :
                      'Data load in progress'}
                </span>
                <span>{loadProgress?.progress_percent ?? 0}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-blue-100">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, loadProgress?.progress_percent ?? 0))}%` }}
                ></div>
              </div>
              <p className="mt-2 text-sm text-blue-800">
                Current phase: {loadProgress?.phase || 'starting'}
              </p>
            </div>
          )}

          {/* Database Statistics */}
          {isSystemReady && (
            <div className="mt-6">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <ChartBarIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Teams Loaded</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {systemStats?.total_teams?.toLocaleString() || 0}
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
                        <DocumentIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Sports Loaded</dt>
                          <dd className="text-lg font-medium text-gray-900">
                            {systemStats?.total_sports || 0}
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
                        <ClockIcon className="h-6 w-6 text-gray-400" />
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Data Freshness</dt>
                          <dd className="text-sm font-medium text-gray-900">
                            {summary?.data?.data_freshness || 'Unknown'}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Discovery Preview */}
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Discovery Preview
                </h3>
                {previewLoading ? (
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-300 rounded w-1/4 mb-2"></div>
                    <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      <strong>{preview?.data?.total_colleges_found || 0}</strong> NCAA Division III colleges discovered from multiple sources
                    </p>
                    <p className="text-sm text-gray-600">
                      Estimated <strong>{preview?.data?.estimated_total_teams || 0}</strong> teams across all sports
                    </p>
                    <div className="text-sm text-gray-500">
                      Sources: {preview?.data?.discovery_sources?.join(', ') || 'NCAA websites, Conference sites, Wikipedia'}
                    </div>
                    
                    {preview?.data?.sample_colleges && preview.data.sample_colleges.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Sample Colleges:</h4>
                        <div className="space-y-1">
                          {Object.values(
                            preview.data.sample_colleges.reduce((acc: Record<string, { name: string; conference: string; sports: string[] }>, college: any) => {
                              if (!acc[college.name]) {
                                acc[college.name] = { name: college.name, conference: college.conference, sports: [] };
                              }
                              if (college.sport && !acc[college.name].sports.includes(college.sport)) {
                                acc[college.name].sports.push(college.sport);
                              }
                              return acc;
                            }, {})
                          ).slice(0, 5).map((college: any, index: number) => (
                            <div key={index} className="text-xs text-gray-600 flex justify-between">
                              <span>
                                {college.name}
                                {college.sports.length > 0 && (
                                  <span className="text-gray-400 ml-1">— {college.sports.join(', ')}</span>
                                )}
                              </span>
                              <span className="text-gray-400">{college.conference}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {preview?.data?.note && (
                      <div className="mt-3 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                        {preview.data.note}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ingestion Controls */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Sample Ingestion */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <CloudArrowUpIcon className="h-5 w-5 mr-2 text-blue-500" />
                  Sample Data Collection
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Quick import of Men's Basketball data only (1 sport).
                  Good for testing the system before a full collection.
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => startSampleIngestion.mutate(10)}
                    disabled={startSampleIngestion.isLoading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {startSampleIngestion.isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Starting...
                      </>
                    ) : (
                      <>
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Start Sample (Basketball Only)
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Duration: ~2-3 minutes • ~450 teams • 1 sport
                </div>
              </div>
            </div>

            {/* Full Ingestion */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <CloudArrowUpIcon className="h-5 w-5 mr-2 text-green-500" />
                  Complete Data Collection
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Import data from all NCAA Division III colleges across all 7 sports.
                  Includes school info, stats, and rankings.
                </p>
                <div className="mt-4">
                  <button
                    onClick={() => startFullIngestion.mutate()}
                    disabled={startFullIngestion.isLoading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {startFullIngestion.isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Starting...
                      </>
                    ) : (
                      <>
                        <PlayIcon className="h-4 w-4 mr-2" />
                        Start Full Collection
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Duration: ~15-20 minutes • ~450 colleges • 7 sports • ~2,800 teams
                </div>
              </div>
            </div>
          </div>

          {/* Job Status panel removed; the top-of-page banner shows manual data load progress. */}

          {/* Help Section */}
          <div className="mt-8">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <DocumentIcon className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    How Data Collection Works
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Scrapes live team statistics from the official NCAA website (ncaa.com)</li>
                      <li>Collects win/loss records, scoring stats, and sport-specific metrics</li>
                      <li>Gathers school info: conference, location, and nickname</li>
                      <li>Downloads current D3 rankings for all sports</li>
                      <li>Populates the database for scouting report generation</li>
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

export default DataIngestion;