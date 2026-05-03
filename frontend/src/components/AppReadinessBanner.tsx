import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CloudArrowUpIcon, ArrowRightIcon, ClockIcon } from '@heroicons/react/24/outline';

import { api } from '../services/api';
import { useAppSettings, refetchIntervalFor } from '../hooks/useAppSettings';

const AppReadinessBanner: React.FC = () => {
  const location = useLocation();
  const { settings: appSettings } = useAppSettings();

  const { data: statsResponse } = useQuery({
    queryKey: ['system-stats'],
    queryFn: () => api.system.getStats(),
    staleTime: 30000,
    retry: 1,
  });

  const { data: scrapeStatusResponse } = useQuery({
    queryKey: ['scrape-status-banner'],
    queryFn: () => api.system.getScrapeStatus(),
    staleTime: 10000,
    refetchInterval: refetchIntervalFor(10000, appSettings.autoRefresh),
    retry: 1,
  });

  const totalTeams = Number(statsResponse?.data?.total_teams ?? 0);
  const isScraping = Boolean(scrapeStatusResponse?.data?.is_scraping);
  const progressPercent = Number(scrapeStatusResponse?.data?.progress_percent ?? 0);
  const scrapePhase = String(scrapeStatusResponse?.data?.phase || 'Loading NCAA data');
  const runLabel = String(scrapeStatusResponse?.data?.run_label || '');

  if (totalTeams > 0 && !isScraping) {
    return null;
  }

  const onDataPage = location.pathname === '/data';
  const isFirstLoad = totalTeams === 0;

  let title = 'Initial NCAA data load pending';
  let message = 'ScoutD3 starts a one-time NCAA scrape when the app is first accessed. After that, use Data Ingestion for manual refreshes.';
  let Icon = CloudArrowUpIcon;

  if (isScraping && isFirstLoad) {
    if (runLabel === 'first_access_auto') {
      title = 'Initial automatic load in progress';
      message = `Loading NCAA data from first access (${progressPercent}%). Phase: ${scrapePhase}.`;
    } else {
      title = 'Data load in progress';
      message = `ScoutD3 is currently scraping NCAA data (${progressPercent}%). Phase: ${scrapePhase}.`;
    }
    Icon = ClockIcon;
  } else if (isScraping) {
    title = 'Manual refresh in progress';
    message = `ScoutD3 is running a user-triggered NCAA refresh (${progressPercent}%). Existing data stays available while stats load.`;
    Icon = ClockIcon;
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50">
      <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-amber-900">{title}</p>
            <p className="text-sm text-amber-800">{message}</p>
          </div>
        </div>
        {onDataPage ? (
          <span className="shrink-0 text-sm font-medium text-amber-900">
            Use this page to monitor progress or trigger manual refreshes.
          </span>
        ) : (
          <Link
            to="/data"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-900 underline decoration-amber-500 underline-offset-4 hover:text-amber-700"
          >
            Open Data Ingestion
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
};

export default AppReadinessBanner;