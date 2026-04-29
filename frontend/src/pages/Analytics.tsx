import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChartBarIcon,
  TrophyIcon,
  UsersIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';
import { Link } from 'react-router-dom';

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

const buildSearchVariants = (value: string): string[] => {
  const normalized = normalizeSearchText(value);
  const expandedTrailingState = normalized
    .replace(/\bst[.]?(?=[^a-z0-9]*$)/g, 'state')
    .replace(/\s+/g, ' ')
    .trim();

  return expandedTrailingState === normalized
    ? [normalized]
    : [normalized, expandedTrailingState];
};

const getTeamIdentityKey = (team: any): string => {
  if (!team) {
    return '';
  }

  const slug = String(team.slug || '').trim().toLowerCase();
  if (slug) {
    return slug;
  }

  const name = normalizeSearchText(String(team.name || ''));
  const sport = normalizeSearchText(String(team.sport || ''));
  return `${name}|${sport}`;
};

const sanitizeFilename = (value: string): string =>
  value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const getFilenameFromContentDisposition = (contentDisposition?: string): string | null => {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]).replace(/^"|"$/g, '');
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const bareMatch = contentDisposition.match(/filename=([^;]+)/i);
  return bareMatch?.[1] ? bareMatch[1].replace(/^"|"$/g, '').trim() : null;
};

const getBlobErrorMessage = async (err: unknown, fallback: string): Promise<string> => {
  const anyError = err as any;

  if (anyError?.code === 'ECONNABORTED') {
    return 'The PDF request timed out. Please try again in a moment.';
  }

  if (anyError?.response?.data instanceof Blob) {
    try {
      const text = (await anyError.response.data.text())?.trim();
      if (text) {
        return text;
      }
    } catch {
      return fallback;
    }
  }

  if (typeof anyError?.message === 'string' && anyError.message.trim().length > 0) {
    return anyError.message;
  }

  return fallback;
};

const getStatLabelMap = (): Record<string, string> => ({
  points_per_game: 'Points Per Game',
  opponent_ppg: 'Opponent PPG',
  rebounds_per_game: 'Rebounds Per Game',
  assists_per_game: 'Assists Per Game',
  turnovers_per_game: 'Turnovers Per Game',
  steals_per_game: 'Steals Per Game',
  blocks_per_game: 'Blocks Per Game',
  field_goal_pct: 'Field Goal %',
  three_point_pct: '3PT %',
  free_throw_pct: 'Free Throw %',
  rebound_margin: 'Rebound Margin',
  opp_field_goal_pct: 'Opponent FG %',
  goals_per_game: 'Goals Per Game',
  goals_against_avg: 'Goals Against Avg',
  assists_per_set: 'Assists Per Set',
  blocks_per_set: 'Blocks Per Set',
  batting_avg: 'Batting Average',
  era: 'ERA',
  games_played: 'Games Played',
});

const formatStatLabel = (key: string): string => {
  const statLabelMap = getStatLabelMap();
  if (statLabelMap[key]) {
    return statLabelMap[key];
  }

  const tokenMap: Record<string, string> = {
    ppg: 'PPG',
    opp: 'Opp',
    fg: 'FG',
    ft: 'FT',
    pct: '%',
    gaa: 'GAA',
    era: 'ERA',
    rpg: 'RPG',
    avg: 'Avg',
    ast: 'AST',
    blk: 'BLK',
    pt: 'PT',
  };

  return key
    .split('_')
    .map((part) => tokenMap[part.toLowerCase()] || (part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
};

const formatStatValue = (key: string, value: any): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  const isPct = key.includes('pct');
  if (isPct && typeof value === 'number') {
    const pctValue = value <= 1 ? value * 100 : value;
    return `${pctValue.toFixed(1)}%`;
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }

  return String(value);
};

interface ScoutingReportData {
  id: string;
  title: string;
  team_name: string;
  opponent_name: string;
  sport: string;
  season: string;
  generated_at: string;
  summary: {
    team_identity: string;
    key_strengths: string[];
    key_weaknesses: string[];
    strategic_recommendations: string[];
  };
  matchup_analysis: {
    predicted_outcome: string;
    confidence: number;
    key_factors: string[];
  };
  opponent_profile: {
    offensive_tendencies: string[];
    defensive_tendencies: string[];
    recent_form: string;
    home_vs_away: string;
  };
}

const Analytics: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTeamId = searchParams.get('team');
  const [comparisonTeamId, setComparisonTeamId] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState('all');
  const [teamSearchInput, setTeamSearchInput] = useState('');
  const [comparisonSearchInput, setComparisonSearchInput] = useState('');
  const [mainDropdownOpen, setMainDropdownOpen] = useState(false);
  const [comparisonDropdownOpen, setComparisonDropdownOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingTeamPdf, setDownloadingTeamPdf] = useState(false);
  const [downloadingScoutingPdf, setDownloadingScoutingPdf] = useState(false);
  const [comparisonScoutingReport, setComparisonScoutingReport] = useState<ScoutingReportData | null>(null);

  // Fetch teams for selection
  const {
    data: teamsResponse,
    isLoading: teamsLoading,
    isError: teamsError,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await api.teams.getAll();
      return response.data;
    },
    retry: 1,
  });
  
  // Fetch team analytics
  const {
    data: analyticsResponse,
    isLoading: analyticsLoading,
    isError: analyticsError,
    refetch: refetchAnalytics,
  } = useQuery(
    ['team-analytics', selectedTeamId],
    () => selectedTeamId ? api.analytics.getTeamIdentity(selectedTeamId) : null,
    { enabled: !!selectedTeamId, retry: 1 }
  );

  // Fetch team trends
  const { data: trendsResponse, isError: trendsError } = useQuery(
    ['team-trends', selectedTeamId],
    () => selectedTeamId ? api.analytics.getTeamTrends(selectedTeamId) : null,
    { enabled: !!selectedTeamId, retry: 1 }
  );

  // Fetch canonical team stats so record display matches the Team Details view.
  const { data: teamStatsResponse } = useQuery(
    ['team-stats', selectedTeamId],
    () => selectedTeamId ? api.teams.getStatistics(selectedTeamId) : null,
    { enabled: !!selectedTeamId, retry: 1 }
  );

  // Fetch comparison team's stats
  const { data: comparisonTeamStatsResponse } = useQuery(
    ['team-stats', comparisonTeamId],
    () => comparisonTeamId ? api.teams.getStatistics(comparisonTeamId) : null,
    { enabled: !!comparisonTeamId, retry: 1 }
  );

  // Fetch comparison data
  const {
    data: comparisonResponse,
    isError: comparisonError,
    refetch: refetchComparison,
  } = useQuery(
    ['team-comparison', selectedTeamId, comparisonTeamId],
    () => selectedTeamId && comparisonTeamId ? 
      api.analytics.getTeamComparison(selectedTeamId, { vs_team: comparisonTeamId }) : null,
    { enabled: !!selectedTeamId && !!comparisonTeamId, retry: 1 }
  );

  // Fetch comparison team's own analytics (identity + metrics)
  const { data: comparisonAnalyticsResponse } = useQuery(
    ['team-analytics', comparisonTeamId],
    () => comparisonTeamId ? api.analytics.getTeamIdentity(comparisonTeamId) : null,
    { enabled: !!comparisonTeamId, retry: 1 }
  );

  // Fetch comparison team's trends
  const { data: comparisonTrendsResponse } = useQuery(
    ['team-trends', comparisonTeamId],
    () => comparisonTeamId ? api.analytics.getTeamTrends(comparisonTeamId) : null,
    { enabled: !!comparisonTeamId, retry: 1 }
  );

  const teams = teamsResponse?.teams || [];
  const selectedTeam = teams.find((team: any) => String(team.id) === selectedTeamId);
  const comparisonTeam = teams.find((team: any) => String(team.id) === comparisonTeamId);
  
  // Function to clear all team selections
  const clearTeamSelection = React.useCallback(() => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('team');
    setSearchParams(newParams);
    setTeamSearchInput('');
    setComparisonSearchInput('');
    setComparisonTeamId('');
  }, [searchParams, setSearchParams]);

  const clearTeamSelectionKeepInput = React.useCallback((nextInput: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('team');
    setSearchParams(newParams);
    setComparisonSearchInput('');
    setComparisonTeamId('');
    setTeamSearchInput(nextInput);
  }, [searchParams, setSearchParams]);
  
  // When selectedTeamId becomes empty, ensure all analytics sections are hidden
  React.useEffect(() => {
    if (!selectedTeamId) {
      // Force a clean slate by clearing comparison team
      setComparisonTeamId('');
    }
  }, [selectedTeamId]);

  // Keep the main search input in sync when a team is active via URL/state.
  React.useEffect(() => {
    if (!selectedTeamId || !selectedTeam) {
      return;
    }

    const activeLabel = `${selectedTeam.name} - ${selectedTeam.sport}`;
    setTeamSearchInput((current) => (current.trim().length === 0 ? activeLabel : current));
  }, [selectedTeamId, selectedTeam]);
  
  // Click-away handler for dropdowns
  React.useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      const mainElement = document.querySelector('[data-main-dropdown]');
      const comparisonElement = document.querySelector('[data-comparison-dropdown]');
      
      if (mainElement && !mainElement.contains(event.target as Node)) {
        setMainDropdownOpen(false);
      }
      if (comparisonElement && !comparisonElement.contains(event.target as Node)) {
        setComparisonDropdownOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickAway);
    return () => document.removeEventListener('click', handleClickAway);
  }, []);
  
  // Filter teams for dropdown based on search input and sport filter
  const filteredTeams = teams.filter((team: any) => {
    const normalizedSearch = normalizeSearchText(teamSearchInput);
    const queryVariants = buildSearchVariants(normalizedSearch);
    const teamSearchableValues = [
      ...buildSearchVariants(team.name),
      ...buildSearchVariants(team.conference),
    ];

    const matchesSearch = normalizedSearch === '' ||
      queryVariants.some((queryVariant) =>
        teamSearchableValues.some((searchableValue) => searchableValue.includes(queryVariant))
      );
    
    const matchesSport = selectedSport === 'all' || team.sport === selectedSport;
    
    return matchesSearch && matchesSport;
  });

  const selectedTeamIdentityKey = getTeamIdentityKey(selectedTeam);
  const sameSportTeams = selectedTeam
    ? teams.filter((team: any) => {
      const candidateIdentity = getTeamIdentityKey(team);
      return (
        String(team.id) !== selectedTeamId
        && team.sport === selectedTeam.sport
        && candidateIdentity !== selectedTeamIdentityKey
      );
    })
    : [];

  const filteredComparisonTeams = sameSportTeams.filter((team: any) => {
    const normalizedSearch = normalizeSearchText(comparisonSearchInput);
    const queryVariants = buildSearchVariants(normalizedSearch);
    const teamSearchableValues = [
      ...buildSearchVariants(team.name),
      ...buildSearchVariants(team.conference),
    ];

    return normalizedSearch === '' ||
      queryVariants.some((queryVariant) =>
        teamSearchableValues.some((searchableValue) => searchableValue.includes(queryVariant))
      );
  });
  
  const availableSports = Array.from(new Set(teams.map((team: any) => team.sport))).sort() as string[];

  
  const selectedTeamMissing = !!selectedTeamId && !teamsLoading && teams.length > 0 && !selectedTeam;
  const analyticsPayloadError = analyticsResponse?.data?.error;
  const analyticsUnavailable = !!selectedTeamId && !analyticsLoading && (
    analyticsError ||
    !analyticsResponse?.data ||
    Boolean(analyticsPayloadError)
  );

  // Use real API data
  const apiData = analyticsResponse?.data;
  const trendsData = trendsResponse?.data;
  const comparisonApiData = comparisonResponse?.data;
  const comparisonAnalyticsData = comparisonAnalyticsResponse?.data;
  const comparisonTrendsData = comparisonTrendsResponse?.data;
  const teamStats = teamStatsResponse?.data;
  const comparisonTeamStats = comparisonTeamStatsResponse?.data;

  const generateComparisonReport = useMutation(
    (payload: { teamId: string; opponentId: string; sport: string }) => api.reports.generate(payload),
    {
      onSuccess: (response) => {
        setComparisonScoutingReport(response.data as ScoutingReportData);
      },
      onError: async (err) => {
        const message = await getBlobErrorMessage(err, 'Failed to generate scouting report. Please try again.');
        window.alert(message);
      },
    }
  );

  const toSafeInt = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  };

  const getTeamRecord = (team: any, stats: any): string => {
    if (stats?.record && typeof stats.record === 'string') {
      return stats.record;
    }

    const wins = toSafeInt(team?.wins);
    const losses = toSafeInt(team?.losses);

    const tieCandidateKeys = ['ties', 'draws', 'draw'];
    let ties = 0;
    for (const key of tieCandidateKeys) {
      if (team?.[key] !== undefined && team?.[key] !== null) {
        ties = toSafeInt(team[key]);
        break;
      }
      if (team?.stats?.[key] !== undefined && team?.stats?.[key] !== null) {
        ties = toSafeInt(team.stats[key]);
        break;
      }
    }

    return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  };

  const getTeamRecordStats = (team: any) => {
    const wins = toSafeInt(team?.wins);
    const losses = toSafeInt(team?.losses);

    const tieCandidateKeys = ['ties', 'draws', 'draw'];
    let ties = 0;
    for (const key of tieCandidateKeys) {
      if (team?.[key] !== undefined && team?.[key] !== null) {
        ties = toSafeInt(team[key]);
        break;
      }
      if (team?.stats?.[key] !== undefined && team?.stats?.[key] !== null) {
        ties = toSafeInt(team.stats[key]);
        break;
      }
    }

    const totalGames = wins + losses + ties;
    const winRate = totalGames > 0 ? (wins / totalGames) * 100 : null;

    return { wins, losses, ties, totalGames, winRate };
  };

  const selectedRecord = getTeamRecord(selectedTeam, teamStats);
  const selectedRecordStats = getTeamRecordStats(selectedTeam);

  const fallbackSeasonLabel = (() => {
    const now = new Date();
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1} Season`;
  })();
  const singleYearSeasonLabel = (() => {
    const now = new Date();
    const seasonYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${seasonYear} Season`;
  })();
  const getTeamSeasonLabel = (team: any) => {
    if (team?.season) return team.season;
    const sport = (team?.sport || '').toLowerCase();
    if (sport.includes('baseball') || sport.includes('softball') || sport.includes('volleyball') || sport.includes('soccer')) {
      return singleYearSeasonLabel;
    }
    return fallbackSeasonLabel;
  };
  const selectedSeasonLabel = getTeamSeasonLabel(selectedTeam);
  const comparisonSeasonLabel = getTeamSeasonLabel(comparisonTeam);
  const hasInvalidComparisonSelection = Boolean(
    selectedTeam && comparisonTeam && getTeamIdentityKey(selectedTeam) === getTeamIdentityKey(comparisonTeam)
  );

  useEffect(() => {
    if (!comparisonTeamId) {
      return;
    }

    const comparisonStillValid = sameSportTeams.some((team: any) => String(team.id) === comparisonTeamId);
    if (!comparisonStillValid) {
      setComparisonTeamId('');
    }
  }, [comparisonTeamId, sameSportTeams]);

  useEffect(() => {
    setComparisonScoutingReport(null);
  }, [selectedTeamId, comparisonTeamId]);

  const handleGenerateComparisonReport = () => {
    if (!selectedTeamId || !comparisonTeamId || !selectedTeam?.sport) {
      return;
    }

    if (hasInvalidComparisonSelection) {
      window.alert('Please select a different opponent team. Self-matchup reports are not allowed.');
      return;
    }

    generateComparisonReport.mutate({
      teamId: selectedTeamId,
      opponentId: comparisonTeamId,
      sport: selectedTeam.sport,
    });
  };



  const handleDownloadComparisonPdf = async () => {
    if (!selectedTeamId || !comparisonTeamId) return;
    if (hasInvalidComparisonSelection) {
      window.alert('Please select a different opponent team. Self-matchup comparisons are not allowed.');
      return;
    }
    setDownloadingPdf(true);
    try {
      const response = await api.analytics.getComparisonPdf(selectedTeamId, comparisonTeamId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers?.['content-disposition'] as string | undefined;
      const serverFilename = getFilenameFromContentDisposition(contentDisposition);
      const fallbackFilename = sanitizeFilename(
        `comparison-${selectedTeam?.name || selectedTeamId}-vs-${comparisonTeam?.name || comparisonTeamId}.pdf`
      );
      const downloadFilename = sanitizeFilename(serverFilename || fallbackFilename);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
    } catch (err) {
      const errorMessage = await getBlobErrorMessage(err, 'Failed to download comparison PDF. Please try again.');
      window.alert(errorMessage);
      console.error('Failed to download comparison PDF:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadTeamPdf = async () => {
    if (!selectedTeamId) return;
    setDownloadingTeamPdf(true);
    try {
      const response = await api.teams.getStatisticsPdf(selectedTeamId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers?.['content-disposition'] as string | undefined;
      const serverFilename = getFilenameFromContentDisposition(contentDisposition);
      const fallbackFilename = sanitizeFilename(`${selectedTeam?.name || selectedTeamId}-analytics.pdf`);
      const downloadFilename = sanitizeFilename(serverFilename || fallbackFilename);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
    } catch (err) {
      const errorMessage = await getBlobErrorMessage(err, 'Failed to download team PDF. Please try again.');
      window.alert(errorMessage);
      console.error('Failed to download team PDF:', err);
    } finally {
      setDownloadingTeamPdf(false);
    }
  };

  const handleDownloadScoutingPdf = async () => {
    if (!comparisonScoutingReport?.id) {
      return;
    }

    setDownloadingScoutingPdf(true);
    try {
      const response = await api.reports.getPdf(comparisonScoutingReport.id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers?.['content-disposition'] as string | undefined;
      const serverFilename = getFilenameFromContentDisposition(contentDisposition);
      const fallbackFilename = sanitizeFilename(
        `${comparisonScoutingReport.team_name}-vs-${comparisonScoutingReport.opponent_name}-scouting-report.pdf`
      );
      const downloadFilename = sanitizeFilename(serverFilename || fallbackFilename);

      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }, 1000);
    } catch (err) {
      const message = await getBlobErrorMessage(err, 'Failed to download scouting report PDF. Please try again.');
      window.alert(message);
    } finally {
      setDownloadingScoutingPdf(false);
    }
  };

  const getFormIcon = (form: string) => {
    switch (form) {
      case 'improving':
        return <ArrowTrendingUpIcon className="h-5 w-5 text-green-500" />;
      case 'declining':
        return <ArrowTrendingDownIcon className="h-5 w-5 text-red-500" />;
      default:
        return <MinusIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 80) return 'text-green-600';
    if (rating >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMetricMethodology = (sportName?: string) => {
    const sport = (sportName || '').toLowerCase();
    const shared = {
      overall: 'Overall Rating is a weighted score: 45% offense + 45% defense + 10% consistency.',
      consistency: 'Consistency is season win percentage converted to 0-100 (e.g., 0.70 = 70).',
      source: 'Source: NCAA season team stats from ScoutD3 data ingestion and analytics computation.',
    };

    if (sport.includes('baseball') || sport.includes('softball')) {
      return {
        ...shared,
        offense: 'Offensive Rating uses batting average, scaled to 0-100 from the baseline .250.',
        defense: 'Defensive Rating uses ERA, where lower ERA scores higher on a 0-100 scale.',
      };
    }

    if (sport.includes('soccer')) {
      return {
        ...shared,
        offense: 'Offensive Rating uses goals per game, scaled to 0-100.',
        defense: 'Defensive Rating uses goals against average (GAA), where lower GAA scores higher.',
      };
    }

    if (sport === "women's volleyball") {
      return {
        ...shared,
        offense: 'Offensive Rating uses assists per set, scaled to 0-100.',
        defense: 'Defensive Rating uses blocks per set, scaled to 0-100.',
      };
    }

    return {
      ...shared,
      offense: 'Offensive Rating uses points per game (PPG), scaled to 0-100.',
      defense: 'Defensive Rating uses opponent points per game (Opp PPG), where lower Opp PPG scores higher.',
    };
  };

  const clearSelectedTeam = () => {
    setSearchParams({});
    setComparisonTeamId('');
  };

  return (
    <>
      <Helmet>
        <title>Analytics - ScoutD3</title>
        <meta name="description" content="Advanced team analytics and performance insights for NCAA Division III athletics." />
      </Helmet>

      <div className="analytics-page py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="md:flex md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Advanced Analytics
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Deep statistical analysis and performance insights
              </p>
            </div>
          </div>

          {/* Team Selection */}
          <div className="mt-8">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Team Analysis
              </h3>
              
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Team to Analyze:
                  </label>
                  <div className="relative" data-main-dropdown>
                    <input
                      type="text"
                      className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={teamSearchInput}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        if (selectedTeamId) {
                          clearTeamSelectionKeepInput(nextValue);
                        } else {
                          setTeamSearchInput(nextValue);
                        }
                        setMainDropdownOpen(true);
                      }}
                      onFocus={(e) => {
                        if (selectedTeamId) {
                          clearTeamSelection();
                        }
                        setMainDropdownOpen(true);
                        e.currentTarget.select();
                      }}
                      placeholder="Type to search..."
                    />
                    {mainDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredTeams.length > 0 ? (
                          filteredTeams.map((team: any) => (
                            <div
                              key={team.id}
                              className="px-3 py-2 cursor-pointer hover:bg-indigo-50 border-b border-gray-100 last:border-b-0"
                              onClick={() => {
                                setSearchParams({ team: team.id });
                                setComparisonTeamId('');
                                setTeamSearchInput(`${team.name} - ${team.sport}`);
                              }}
                            >
                              <div className="text-sm font-medium text-gray-900">{team.name}</div>
                              <div className="text-xs text-gray-500">{team.sport} • {team.conference}</div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500">No teams found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Compare With:
                  </label>
                  <div className="relative" data-comparison-dropdown>
                    <input
                      type="text"
                      className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={comparisonSearchInput}
                      onChange={(e) => setComparisonSearchInput(e.target.value)}
                      onFocus={(e) => {
                        setComparisonDropdownOpen(true);
                        e.currentTarget.select();
                      }}
                      placeholder={selectedTeam ? 'Type to search...' : 'Select a team first...'}
                      disabled={!selectedTeamId || !selectedTeam}
                    />
                    {comparisonDropdownOpen && selectedTeamId && selectedTeam && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredComparisonTeams.length > 0 ? (
                          filteredComparisonTeams.map((team: any) => (
                            <div
                              key={team.id}
                              className="px-3 py-2 cursor-pointer hover:bg-indigo-50 border-b border-gray-100 last:border-b-0"
                              onClick={() => {
                                setComparisonTeamId(team.id);
                                setComparisonSearchInput(`${team.name} - ${team.sport}`);
                              }}
                            >
                              <div className="text-sm font-medium text-gray-900">{team.name}</div>
                              <div className="text-xs text-gray-500">{team.conference}</div>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-gray-500">No teams found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter by Sport:
                  </label>
                  <select
                    className="block w-full md:w-auto py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={selectedSport}
                    onChange={(e) => setSelectedSport(e.target.value)}
                  >
                    <option value="all">All Sports</option>
                    {availableSports.map((sport) => (
                      <option key={sport} value={sport}>
                        {sport}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Overview */}
          {selectedTeamId && selectedTeam && (
            <div className="mt-8">
              {comparisonTeam && comparisonTeamStats ? (
                /* Two-team side-by-side stats */
                <div className="bg-white rounded-lg border-2 border-black p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Statistics Overview
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Season context: {teamStats?.season} | {comparisonTeamStats?.season}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Team 1 stats */}
                    <div className="rounded-lg bg-blue-50 p-5 border-t-4 border-blue-500 border-2 border-black">
                      <h4 className="text-base font-bold text-blue-800 mb-4">{selectedTeam.name}</h4>
                      <p className="text-xs text-blue-600 mb-3">
                        Season {teamStats?.season} | Record {teamStats?.record}
                      </p>
                      {!teamStats?.stats ? (
                        <div className="space-y-2">
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-auto rounded border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Metric</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {Object.entries(teamStats.stats).map(([key, value]) => (
                                <tr key={key}>
                                  <td className="px-3 py-2 text-sm text-gray-700">
                                    {formatStatLabel(key)}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-right text-gray-900 font-medium">
                                    {formatStatValue(key, value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Team 2 stats */}
                    <div className="rounded-lg bg-orange-50 p-5 border-t-4 border-orange-500">
                      <h4 className="text-base font-bold text-orange-800 mb-4">{comparisonTeam.name}</h4>
                      <p className="text-xs text-orange-600 mb-3">
                        Season {comparisonTeamStats?.season} | Record {comparisonTeamStats?.record}
                      </p>
                      {!comparisonTeamStats?.stats ? (
                        <div className="space-y-2">
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-auto rounded border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Metric</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Value</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {Object.entries(comparisonTeamStats.stats).map(([key, value]) => (
                                <tr key={key}>
                                  <td className="px-3 py-2 text-sm text-gray-700">
                                    {formatStatLabel(key)}
                                  </td>
                                  <td className="px-3 py-2 text-sm text-right text-gray-900 font-medium">
                                    {formatStatValue(key, value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Single-team stats */
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-medium text-gray-900">
                      Statistics Overview
                    </h3>
                    <button
                      type="button"
                      onClick={handleDownloadTeamPdf}
                      disabled={downloadingTeamPdf}
                      className="inline-flex items-center px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                      {downloadingTeamPdf ? 'Generating...' : 'Download Team PDF'}
                    </button>
                  </div>
                  {teamStats?.season && (
                    <p className="text-sm text-gray-500 mb-4">
                      These Stats Are From: {teamStats.season}
                    </p>
                  )}
                  {!teamStats?.stats ? (
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 text-xs text-gray-500">
                        Season {teamStats.season} | Record {teamStats.record}
                      </div>
                      <div className="max-h-72 overflow-auto rounded border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Metric</th>
                              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 bg-white">
                            {Object.entries(teamStats.stats).map(([key, value]) => (
                              <tr key={key}>
                                <td className="px-3 py-2 text-sm text-gray-700">
                                  {formatStatLabel(key)}
                                </td>
                                <td className="px-3 py-2 text-sm text-right text-gray-900 font-medium">
                                  {formatStatValue(key, value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Teams loading state */}
          {teamsLoading && (
            <div className="mt-8 text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <p className="mt-4 text-lg text-gray-600">Loading available teams...</p>
            </div>
          )}

          {/* Teams error state */}
          {teamsError && !teamsLoading && (
            <div className="mt-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-red-800">Analytics could not load the team list</h3>
                    <p className="mt-2 text-sm text-red-700">
                      The Analytics page cannot work until ScoutD3 can read the current team dataset from the backend.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void refetchTeams()}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                      >
                        Retry team load
                      </button>
                      <Link
                        to="/data"
                        className="inline-flex items-center px-4 py-2 border border-red-200 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                      >
                        Open Data Ingestion
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No data loaded state */}
          {teams.length === 0 && !teamsLoading && !teamsError && (
            <div className="mt-8">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="flex">
                  <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 flex-shrink-0" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-yellow-800">No Team Data Available</h3>
                    <p className="mt-2 text-sm text-yellow-700">
                      ScoutD3 is waiting on NCAA team data. The app runs an automatic load on first access, and you can use Data Ingestion for any manual refresh.
                    </p>
                    <div className="mt-4">
                      <Link
                        to="/data"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700"
                      >
                        Go to Data Ingestion
                      </Link>
                    </div>
                    <div className="mt-4 bg-yellow-100 rounded-md p-4">
                      <h4 className="text-sm font-medium text-yellow-800 mb-2">How to get started:</h4>
                      <ol className="list-decimal list-inside text-sm text-yellow-700 space-y-1">
                        <li>ScoutD3 starts loading NCAA data automatically on first app access</li>
                        <li>Open <strong>Data Ingestion</strong> if you want to monitor progress or force a Sample or Full collection</li>
                        <li>Return here and select any team from the dropdown to view analytics</li>
                        <li>Optionally pick a second team for a head-to-head comparison</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* No team selected state (data is loaded) */}
          {teams.length > 0 && !selectedTeamId && !teamsLoading && (
            <div className="mt-8 text-center py-12">
              <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No team selected</h3>
              <p className="mt-1 text-sm text-gray-500">
                Choose a team from the dropdown above to view detailed analytics.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {teams.length.toLocaleString()} teams available — select one to see identity analysis, performance metrics, trends, and more.
              </p>
            </div>
          )}

          {/* Invalid selected team state */}
          {selectedTeamMissing && (
            <div className="mt-8">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="flex">
                  <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 flex-shrink-0" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-yellow-800">Selected team is no longer available</h3>
                    <p className="mt-2 text-sm text-yellow-700">
                      The current URL points to a team that is not in the latest dataset. This can happen after a refresh if team ids change between sync versions.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={clearSelectedTeam}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700"
                      >
                        Choose another team
                      </button>
                      <button
                        type="button"
                        onClick={() => void refetchTeams()}
                        className="inline-flex items-center px-4 py-2 border border-yellow-300 text-sm font-medium rounded-md text-yellow-800 bg-white hover:bg-yellow-50"
                      >
                        Refresh teams
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {selectedTeamId && analyticsLoading && (
            <div className="mt-8 text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <p className="mt-4 text-lg text-gray-600">Loading analytics...</p>
            </div>
          )}

          {/* Analytics error state */}
          {selectedTeamId && analyticsUnavailable && !selectedTeamMissing && (
            <div className="mt-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-red-800">Analytics are temporarily unavailable for this team</h3>
                    <p className="mt-2 text-sm text-red-700">
                      ScoutD3 could not load the analytics payload for the selected team. Retry the request or check Data Ingestion if the dataset is still refreshing.
                    </p>
                    {analyticsPayloadError && (
                      <p className="mt-2 text-xs text-red-600">
                        Backend response: {String(analyticsPayloadError)}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void refetchAnalytics()}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                      >
                        Retry analytics
                      </button>
                      <Link
                        to="/data"
                        className="inline-flex items-center px-4 py-2 border border-red-200 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                      >
                        Open Data Ingestion
                      </Link>
                    </div>
                    {trendsError && (
                      <p className="mt-3 text-xs text-red-600">
                        Trend details also failed to load for this team.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analytics Content */}
          {selectedTeamId && selectedTeam && apiData && !analyticsLoading && !selectedTeamMissing && (
            <div className="analytics-sections mt-8 space-y-6">

              {/* ── Team Identity Analysis ── */}
              {comparisonTeam && comparisonAnalyticsData ? (
                /* Two-team side-by-side identity */
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
                    <UsersIcon className="h-5 w-5 text-indigo-500 mr-2" />
                    Team Identity Analysis
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Season context: {apiData.team_name} ({selectedSeasonLabel}) | {comparisonAnalyticsData.team_name} ({comparisonSeasonLabel})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Team 1 identity */}
                    <div className="rounded-lg bg-blue-50 p-5 border-t-4 border-blue-500">
                      <h4 className="text-base font-bold text-blue-800 mb-4">{apiData.team_name}</h4>
                      <p className="text-xs text-blue-600 mb-3">Season: {selectedSeasonLabel}</p>
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Primary Style</div>
                        <p className="text-sm text-gray-800 bg-white rounded border border-black p-2">{apiData.identity?.primary_style}</p>
                        <div className="mt-1 text-xs text-blue-500">Confidence: {Math.round((apiData.identity?.confidence_level || 0) * 100)}%</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Key Characteristics</div>
                        <ul className="space-y-1">
                          {(apiData.identity?.secondary_characteristics || []).map((c: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start">
                              <div className="h-1.5 w-1.5 bg-blue-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                              <span className="bg-white rounded border border-black px-2 py-1 w-full block">{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    {/* Team 2 identity */}
                    <div className="rounded-lg bg-orange-50 p-5 border-t-4 border-orange-500 border-2 border-black">
                      <h4 className="text-base font-bold text-orange-800 mb-4">{comparisonAnalyticsData.team_name}</h4>
                      <p className="text-xs text-orange-600 mb-3">Season: {comparisonSeasonLabel}</p>
                      <div className="mb-3">
                        <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">Primary Style</div>
                        <p className="text-sm text-gray-800 bg-white rounded border border-black p-2">{comparisonAnalyticsData.identity?.primary_style}</p>
                        <div className="mt-1 text-xs text-orange-500">Confidence: {Math.round((comparisonAnalyticsData.identity?.confidence_level || 0) * 100)}%</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Key Characteristics</div>
                        <ul className="space-y-1">
                          {(comparisonAnalyticsData.identity?.secondary_characteristics || []).map((c: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start">
                              <div className="h-1.5 w-1.5 bg-orange-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                              <span className="bg-white rounded border border-black px-2 py-1 w-full block">{c}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Single-team identity */
                <div className="bg-white rounded-lg border-2 border-black p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <UsersIcon className="h-5 w-5 text-indigo-500 mr-2" />
                    Team Identity Analysis — {apiData.team_name}
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">Season: {selectedSeasonLabel}</p>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Primary Playing Style:</h4>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">{apiData.identity?.primary_style}</p>
                      <div className="mt-2 text-xs text-gray-500">
                        Confidence: {Math.round((apiData.identity?.confidence_level || 0) * 100)}%
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Key Characteristics:</h4>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(apiData.identity?.secondary_characteristics || []).map((characteristic: string, index: number) => (
                          <li key={index} className="flex items-start text-sm text-gray-700">
                            <div className="flex-shrink-0 h-2 w-2 bg-indigo-400 rounded-full mt-2 mr-3"></div>
                            {characteristic}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Performance Metrics ── */}
              {comparisonTeam && comparisonAnalyticsData ? (
                /* Two-team side-by-side metrics */
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
                    <TrophyIcon className="h-5 w-5 text-yellow-500 mr-2" />
                    Performance Metrics
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Season context: {apiData.team_name} ({selectedSeasonLabel}) | {comparisonAnalyticsData.team_name} ({comparisonSeasonLabel})
                  </p>
                  <details className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-700">
                      How these metrics are calculated
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <p>{getMetricMethodology(selectedTeam?.sport).offense}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).defense}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).overall}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).consistency}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).source}</p>
                    </div>
                  </details>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Team 1 metrics */}
                    <div className="rounded-lg bg-blue-50 p-5 border-t-4 border-blue-500 border-2 border-black">
                      <h4 className="text-sm font-bold text-blue-800 mb-4">{apiData.team_name}</h4>
                      <p className="text-xs text-blue-600 mb-3">Season: {selectedSeasonLabel}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Overall Rating', value: apiData.performance_metrics?.overall_rating },
                          { label: 'Offensive Rating', value: apiData.performance_metrics?.offensive_rating },
                          { label: 'Defensive Rating', value: apiData.performance_metrics?.defensive_rating },
                          { label: 'Consistency', value: Math.round((apiData.performance_metrics?.consistency_score || 0) * 100) },
                        ].map(({ label, value }) => (
                          <div key={label} className="text-center bg-white/70 rounded-lg py-3 px-2">
                            <div className={`text-2xl font-bold ${getRatingColor(value || 0)}`}>{value}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Team 2 metrics */}
                    <div className="rounded-lg bg-orange-50 p-5 border-t-4 border-orange-500 border-2 border-black">
                      <h4 className="text-sm font-bold text-orange-800 mb-4">{comparisonAnalyticsData.team_name}</h4>
                      <p className="text-xs text-orange-600 mb-3">Season: {comparisonSeasonLabel}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Overall Rating', value: comparisonAnalyticsData.performance_metrics?.overall_rating },
                          { label: 'Offensive Rating', value: comparisonAnalyticsData.performance_metrics?.offensive_rating },
                          { label: 'Defensive Rating', value: comparisonAnalyticsData.performance_metrics?.defensive_rating },
                          { label: 'Consistency', value: Math.round((comparisonAnalyticsData.performance_metrics?.consistency_score || 0) * 100) },
                        ].map(({ label, value }) => (
                          <div key={label} className="text-center bg-white/70 rounded-lg py-3 px-2">
                            <div className={`text-2xl font-bold ${getRatingColor(value || 0)}`}>{value}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Single-team metrics */
                <div className="bg-white rounded-lg border-2 border-black p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <TrophyIcon className="h-5 w-5 text-yellow-500 mr-2" />
                    Performance Metrics
                  </h3>
                  <details className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-700">
                      How these metrics are calculated
                    </summary>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <p>{getMetricMethodology(selectedTeam?.sport).offense}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).defense}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).overall}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).consistency}</p>
                      <p>{getMetricMethodology(selectedTeam?.sport).source}</p>
                    </div>
                  </details>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${getRatingColor(apiData.performance_metrics?.overall_rating || 0)}`}>
                        {apiData.performance_metrics?.overall_rating}
                      </div>
                      <div className="text-sm text-gray-500">Overall Rating</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${getRatingColor(apiData.performance_metrics?.offensive_rating || 0)}`}>
                        {apiData.performance_metrics?.offensive_rating}
                      </div>
                      <div className="text-sm text-gray-500">Offensive Rating</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${getRatingColor(apiData.performance_metrics?.defensive_rating || 0)}`}>
                        {apiData.performance_metrics?.defensive_rating}
                      </div>
                      <div className="text-sm text-gray-500">Defensive Rating</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${getRatingColor((apiData.performance_metrics?.consistency_score || 0) * 100)}`}>
                        {Math.round((apiData.performance_metrics?.consistency_score || 0) * 100)}
                      </div>
                      <div className="text-sm text-gray-500">Consistency</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Competitive Advantages & Areas ── */}
              {comparisonTeam && comparisonAnalyticsData ? (
                /* Two-team side-by-side strengths/weaknesses */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Team 1 */}
                  <div className="bg-white shadow rounded-lg p-6">
                    <h4 className="text-base font-semibold text-blue-800 mb-4">{apiData.team_name}</h4>
                    <div className="space-y-4">
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Competitive Advantages</h5>
                        <ul className="space-y-1">
                          {(apiData.comparison_data?.key_advantages || []).map((a: string, i: number) => (
                            <li key={i} className="flex items-start text-sm text-gray-700">
                              <div className="h-1.5 w-1.5 bg-green-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Areas for Improvement</h5>
                        <ul className="space-y-1">
                          {(apiData.comparison_data?.key_disadvantages || []).map((d: string, i: number) => (
                            <li key={i} className="flex items-start text-sm text-gray-700">
                              <div className="h-1.5 w-1.5 bg-red-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  {/* Team 2 */}
                  <div className="bg-white shadow rounded-lg p-6">
                    <h4 className="text-base font-semibold text-orange-800 mb-4">{comparisonAnalyticsData.team_name}</h4>
                    <div className="space-y-4">
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Competitive Advantages</h5>
                        <ul className="space-y-1">
                          {(comparisonAnalyticsData.comparison_data?.key_advantages || []).map((a: string, i: number) => (
                            <li key={i} className="flex items-start text-sm text-gray-700">
                              <div className="h-1.5 w-1.5 bg-green-500 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-2">Areas for Improvement</h5>
                        <ul className="space-y-1">
                          {(comparisonAnalyticsData.comparison_data?.key_disadvantages || []).map((d: string, i: number) => (
                            <li key={i} className="flex items-start text-sm text-gray-700">
                              <div className="h-1.5 w-1.5 bg-red-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Single-team advantages/disadvantages */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white shadow rounded-lg p-6">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                      Competitive Advantages
                    </h4>
                    <ul className="space-y-2">
                      {(apiData.comparison_data?.key_advantages || []).map((advantage: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <div className="flex-shrink-0 h-2 w-2 bg-green-400 rounded-full mt-2 mr-3"></div>
                          <span className="text-sm text-gray-700">{advantage}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-white shadow rounded-lg p-6">
                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                      Areas for Improvement
                    </h4>
                    <ul className="space-y-2">
                      {(apiData.comparison_data?.key_disadvantages || []).map((disadvantage: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <div className="flex-shrink-0 h-2 w-2 bg-red-400 rounded-full mt-2 mr-3"></div>
                          <span className="text-sm text-gray-700">{disadvantage}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ── Detailed Season Statistics (single-team only) ── */}
              {!comparisonTeam && (
                <div className="analytics-season-stats-section bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
                    <ChartBarIcon className="h-5 w-5 text-purple-500 mr-2" />
                    Full Season Statistics
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">Season: {selectedSeasonLabel}</p>
                  <div className="analytics-season-stats-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Record */}
                    <div className="analytics-stat-tile bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border-l-4 border-indigo-500">
                      <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Record</div>
                      <div className="mt-2 text-2xl font-bold text-indigo-900">{selectedRecord}</div>
                      <div className="mt-1 text-xs text-indigo-700">
                        {selectedRecordStats.winRate !== null
                          ? `${selectedRecordStats.winRate.toFixed(1)}% Win Rate`
                          : 'No games yet'}
                      </div>
                    </div>

                    {/* Sport-specific stats */}
                    {selectedTeam?.sport?.toLowerCase().includes('baseball') || selectedTeam?.sport?.toLowerCase().includes('softball') ? (
                      <>
                        <div className="analytics-stat-tile bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border-l-4 border-orange-500">
                          <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide">Batting Avg</div>
                          <div className="mt-2 text-2xl font-bold text-orange-900">{(selectedTeam?.stats?.batting_avg || 0).toFixed(3)}</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border-l-4 border-red-500">
                          <div className="text-xs font-semibold text-red-600 uppercase tracking-wide">ERA</div>
                          <div className="mt-2 text-2xl font-bold text-red-900">{(selectedTeam?.stats?.era || 0).toFixed(2)}</div>
                        </div>
                      </>
                    ) : selectedTeam?.sport?.toLowerCase().includes('soccer') ? (
                      <>
                        <div className="analytics-stat-tile bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border-l-4 border-green-500">
                          <div className="text-xs font-semibold text-green-600 uppercase tracking-wide">Goals Per Game</div>
                          <div className="mt-2 text-2xl font-bold text-green-900">{(selectedTeam?.stats?.ppg || 0).toFixed(2)}</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-l-4 border-blue-500">
                          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Goals Against Avg</div>
                          <div className="mt-2 text-2xl font-bold text-blue-900">{(selectedTeam?.stats?.gaa || 0).toFixed(2)}</div>
                        </div>
                      </>
                    ) : selectedTeam?.sport?.toLowerCase() === "women's volleyball" ? (
                      <>
                        <div className="analytics-stat-tile bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-4 border-l-4 border-pink-500">
                          <div className="text-xs font-semibold text-pink-600 uppercase tracking-wide">Assists / Set</div>
                          <div className="mt-2 text-2xl font-bold text-pink-900">{(selectedTeam?.stats?.assists_per_set || 0).toFixed(2)}</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border-l-4 border-purple-500">
                          <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Blocks / Set</div>
                          <div className="mt-2 text-2xl font-bold text-purple-900">{(selectedTeam?.stats?.blocks_per_set || 0).toFixed(2)}</div>
                        </div>
                      </>
                    ) : (
                      /* Basketball */
                      <>
                        <div className="analytics-stat-tile bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border-l-4 border-amber-500">
                          <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide">PPG</div>
                          <div className="mt-2 text-2xl font-bold text-amber-900">{(selectedTeam?.stats?.ppg || 0).toFixed(1)}</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-4 border-l-4 border-cyan-500">
                          <div className="text-xs font-semibold text-cyan-600 uppercase tracking-wide">Opp PPG</div>
                          <div className="mt-2 text-2xl font-bold text-cyan-900">{(selectedTeam?.stats?.opp_ppg || 0).toFixed(1)}</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-lime-50 to-lime-100 rounded-lg p-4 border-l-4 border-lime-500">
                          <div className="text-xs font-semibold text-lime-600 uppercase tracking-wide">Reb Margin</div>
                          <div className="mt-2 text-2xl font-bold text-lime-900">{(selectedTeam?.stats?.reb_margin || 0).toFixed(1)}</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg p-4 border-l-4 border-rose-500">
                          <div className="text-xs font-semibold text-rose-600 uppercase tracking-wide">3PT %</div>
                          <div className="mt-2 text-2xl font-bold text-rose-900">{(selectedTeam?.stats?.three_pct || 0).toFixed(1)}%</div>
                        </div>
                        <div className="analytics-stat-tile bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg p-4 border-l-4 border-sky-500">
                          <div className="text-xs font-semibold text-sky-600 uppercase tracking-wide">FT %</div>
                          <div className="mt-2 text-2xl font-bold text-sky-900">{(selectedTeam?.stats?.ft_pct || 0).toFixed(1)}%</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Trends Analysis ── */}
              {comparisonTeam && comparisonAnalyticsData ? (
                /* Two-team side-by-side trends */
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-6 flex items-center">
                    <ChartBarIcon className="h-5 w-5 text-green-500 mr-2" />
                    Recent Trends
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Season context: {apiData.team_name} ({selectedSeasonLabel}) | {comparisonAnalyticsData.team_name} ({comparisonSeasonLabel})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Team 1 trends */}
                    <div className="rounded-lg bg-blue-50 p-5 border-t-4 border-blue-500 border-2 border-black">
                      <h4 className="text-base font-bold text-blue-800 mb-4">{apiData.team_name}</h4>
                      <p className="text-xs text-blue-600 mb-3">Season: {selectedSeasonLabel}</p>
                      <div className="space-y-4">
                        <div className="flex items-center">
                          {getFormIcon(apiData.trends?.recent_form || 'stable')}
                          <span className="ml-2 text-sm font-medium text-gray-900 capitalize">
                            {apiData.trends?.recent_form || 'Stable'} Form
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-gray-700">{apiData.trends?.form_description}</p>
                        </div>
                        <div className="bg-white/70 p-3 rounded-md border border-blue-200">
                          <p className="text-sm text-blue-800 font-medium">Streak: {apiData.trends?.streak_info}</p>
                        </div>
                        {trendsData?.trends && (
                          <div className="mt-3">
                            <h5 className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-2">Performance Breakdown:</h5>
                            <div className="grid grid-cols-1 gap-2">
                              {trendsData.trends.map((trend: any, idx: number) => (
                                <div key={idx} className="bg-white/70 p-2 rounded-md text-xs">
                                  <div className="font-semibold text-blue-900">{trend.period}</div>
                                  <div className="text-blue-800">{trend.record || `${trend.wins}-${trend.losses}`}</div>
                                  <div className="text-gray-600">Avg Pts: {trend.avg_points} | Allowed: {trend.avg_allowed}</div>
                                </div>
                              ))}
                            </div>
                            {trendsData.key_trend && (
                              <p className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded">
                                {trendsData.key_trend}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Team 2 trends */}
                    <div className="rounded-lg bg-orange-50 p-5 border-t-4 border-orange-500 border-2 border-black">
                      <h4 className="text-base font-bold text-orange-800 mb-4">{comparisonAnalyticsData.team_name}</h4>
                      <p className="text-xs text-orange-600 mb-3">Season: {comparisonSeasonLabel}</p>
                      <div className="space-y-4">
                        <div className="flex items-center">
                          {getFormIcon(comparisonAnalyticsData.trends?.recent_form || 'stable')}
                          <span className="ml-2 text-sm font-medium text-gray-900 capitalize">
                            {comparisonAnalyticsData.trends?.recent_form || 'Stable'} Form
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-gray-700">{comparisonAnalyticsData.trends?.form_description}</p>
                        </div>
                        <div className="bg-white/70 p-3 rounded-md border border-orange-200">
                          <p className="text-sm text-orange-800 font-medium">Streak: {comparisonAnalyticsData.trends?.streak_info}</p>
                        </div>
                        {comparisonTrendsData?.trends && (
                          <div className="mt-3">
                            <h5 className="text-xs font-medium text-orange-700 uppercase tracking-wide mb-2">Performance Breakdown:</h5>
                            <div className="grid grid-cols-1 gap-2">
                              {comparisonTrendsData.trends.map((trend: any, idx: number) => (
                                <div key={idx} className="bg-white/70 p-2 rounded-md text-xs">
                                  <div className="font-semibold text-orange-900">{trend.period}</div>
                                  <div className="text-orange-800">{trend.record || `${trend.wins}-${trend.losses}`}</div>
                                  <div className="text-gray-600">Avg Pts: {trend.avg_points} | Allowed: {trend.avg_allowed}</div>
                                </div>
                              ))}
                            </div>
                            {comparisonTrendsData.key_trend && (
                              <p className="mt-2 text-xs text-green-700 bg-green-50 p-2 rounded">
                                {comparisonTrendsData.key_trend}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Single-team trends */
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <ChartBarIcon className="h-5 w-5 text-green-500 mr-2" />
                    Recent Trends
                  </h3>
                  <p className="text-xs text-gray-500 mb-3">Season: {selectedSeasonLabel}</p>

                  <div className="space-y-4">
                    <div className="flex items-center">
                      {getFormIcon(apiData.trends?.recent_form || 'stable')}
                      <span className="ml-2 text-sm font-medium text-gray-900 capitalize">
                        {apiData.trends?.recent_form || 'Stable'} Form
                      </span>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-700">{apiData.trends?.form_description}</p>
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded-md">
                      <p className="text-sm text-blue-800 font-medium">Streak: {apiData.trends?.streak_info}</p>
                    </div>

                    {trendsData?.trends && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Performance Breakdown:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {trendsData.trends.map((trend: any, idx: number) => (
                            <div key={idx} className="bg-gray-50 p-3 rounded-md">
                              <div className="text-xs font-medium text-gray-500 uppercase">{trend.period}</div>
                              <div className="mt-1 text-lg font-bold text-gray-900">{trend.record || `${trend.wins}-${trend.losses}`}</div>
                              <div className="text-xs text-gray-500">Avg Pts: {trend.avg_points} | Allowed: {trend.avg_allowed}</div>
                            </div>
                          ))}
                        </div>
                        {trendsData.key_trend && (
                          <p className="mt-3 text-sm text-green-700 bg-green-50 p-2 rounded">
                            {trendsData.key_trend}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Contextual Analysis (single-team only) ── */}
              {!comparisonTeam && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Contextual Analysis
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">vs Conference:</h4>
                      <p className="text-sm text-gray-700">{apiData.comparison_data?.vs_conference}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-2">vs Division III:</h4>
                      <p className="text-sm text-gray-700">{apiData.comparison_data?.vs_division}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Head-to-Head Comparison (unchanged) ── */}
              {comparisonTeamId && comparisonError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-red-800">Comparison data failed to load</h3>
                      <p className="mt-1 text-sm text-red-700">
                        The selected matchup could not be analyzed right now. Retry the comparison or choose a different opponent.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refetchComparison()}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                    >
                      Retry comparison
                    </button>
                  </div>
                </div>
              )}

              {comparisonTeam && comparisonApiData && (
                <div className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-medium text-gray-900">
                      Head-to-Head: {selectedTeam?.name} vs {comparisonTeam.name}
                    </h3>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleGenerateComparisonReport}
                        disabled={generateComparisonReport.isLoading || hasInvalidComparisonSelection}
                        className="inline-flex items-center px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {generateComparisonReport.isLoading
                          ? 'Generating Report...'
                          : comparisonScoutingReport
                            ? 'Regenerate Scouting Report'
                            : 'Generate Scouting Report'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadScoutingPdf}
                        disabled={!comparisonScoutingReport?.id || downloadingScoutingPdf}
                        className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                        {downloadingScoutingPdf ? 'Downloading...' : 'Download Full Report PDF'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadComparisonPdf}
                        disabled={downloadingPdf || hasInvalidComparisonSelection}
                        className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                        {downloadingPdf ? 'Generating...' : 'Download Comparison PDF'}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Seasons: {selectedTeam?.name} ({selectedSeasonLabel}) | {comparisonTeam.name} ({comparisonSeasonLabel})
                  </p>

                  {/* Verdict Banner */}
                  {comparisonApiData?.comparison?.verdict && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                      <p className="text-sm font-semibold text-green-800 text-center">
                        {comparisonApiData.comparison.verdict}
                      </p>
                    </div>
                  )}

                  {/* Edge Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Offensive Edge</div>
                      <div className="mt-1 text-lg font-bold text-blue-900">{comparisonApiData?.comparison?.offensive_edge}</div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-4 text-center">
                      <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Defensive Edge</div>
                      <div className="mt-1 text-lg font-bold text-emerald-900">{comparisonApiData?.comparison?.defensive_edge}</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 text-center">
                      <div className="text-xs font-medium text-purple-600 uppercase tracking-wide">Overall Edge</div>
                      <div className="mt-1 text-lg font-bold text-purple-900">{comparisonApiData?.comparison?.overall_edge}</div>
                    </div>
                  </div>

                  {/* Ratings Comparison */}
                  {comparisonApiData?.comparison?.rating_rows && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Ratings</h4>
                      <div className="overflow-x-auto rounded-lg border-2 border-black">
                        <table className="min-w-full divide-y divide-black border-black">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-4 py-3 text-left text-base font-bold text-gray-900 border-b-2 border-black uppercase">Metric</th>
                              <th className="px-4 py-3 text-center text-base font-bold text-gray-900 border-b-2 border-black uppercase">{selectedTeam?.name}</th>
                              <th className="px-4 py-3 text-center text-base font-bold text-gray-900 border-b-2 border-black uppercase">{comparisonTeam.name}</th>
                              <th className="px-4 py-3 text-center text-base font-bold text-gray-900 border-b-2 border-black uppercase">Edge</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black">
                            {comparisonApiData.comparison.rating_rows.map((row: any, idx: number) => (
                              <tr key={idx} className="bg-white">
                                <td className="px-4 py-3 text-base font-medium text-gray-900 border-b border-black">{row.label}</td>
                                <td className={`px-4 py-3 text-base text-center font-semibold border-b border-black ${row.edge === 'team1' ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}>{row.team1}</td>
                                <td className={`px-4 py-3 text-base text-center font-semibold border-b border-black ${row.edge === 'team2' ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}>{row.team2}</td>
                                <td className="px-4 py-3 text-base text-center border-b border-black">
                                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                    row.edge === 'team1' ? 'bg-blue-100 text-blue-800' :
                                    row.edge === 'team2' ? 'bg-orange-100 text-orange-800' :
                                    row.edge === 'n/a' ? 'bg-slate-100 text-slate-600' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {row.edge === 'team1' ? selectedTeam?.name : row.edge === 'team2' ? comparisonTeam.name : row.edge === 'n/a' ? 'N/A' : 'Even'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Statistical Comparison Table */}
                  {comparisonApiData?.comparison?.stat_rows && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Statistical Breakdown</h4>
                      <div className="overflow-x-auto rounded-lg border-2 border-black">
                        <table className="min-w-full divide-y divide-black border-black">
                          <thead className="bg-white">
                            <tr>
                              <th className="px-4 py-3 text-left text-base font-bold text-gray-900 border-b-2 border-black uppercase">Statistic</th>
                              <th className="px-4 py-3 text-center text-base font-bold text-gray-900 border-b-2 border-black uppercase">{selectedTeam?.name}</th>
                              <th className="px-4 py-3 text-center text-base font-bold text-gray-900 border-b-2 border-black uppercase">{comparisonTeam.name}</th>
                              <th className="px-4 py-3 text-center text-base font-bold text-gray-900 border-b-2 border-black uppercase">Edge</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black">
                            {comparisonApiData.comparison.stat_rows.map((row: any, idx: number) => (
                              <tr key={idx} className="bg-white">
                                <td className="px-4 py-3 text-base font-medium text-gray-900 border-b border-black">{row.label}</td>
                                <td className={`px-4 py-3 text-base text-center font-semibold border-b border-black ${row.edge === 'team1' ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}>{row.team1}</td>
                                <td className={`px-4 py-3 text-base text-center font-semibold border-b border-black ${row.edge === 'team2' ? 'text-green-700 bg-green-50' : 'text-gray-900'}`}>{row.team2}</td>
                                <td className="px-4 py-3 text-base text-center border-b border-black">
                                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                                    row.edge === 'team1' ? 'bg-blue-100 text-blue-800' :
                                    row.edge === 'team2' ? 'bg-orange-100 text-orange-800' :
                                    row.edge === 'n/a' ? 'bg-slate-100 text-slate-600' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {row.edge === 'team1' ? selectedTeam?.name : row.edge === 'team2' ? comparisonTeam.name : row.edge === 'n/a' ? 'N/A' : 'Even'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-gray-500 px-1">
                        <span>{selectedTeam?.name}: {comparisonApiData.comparison.team1_advantages} advantages</span>
                        <span>{comparisonTeam.name}: {comparisonApiData.comparison.team2_advantages} advantages</span>
                      </div>
                    </div>
                  )}

                  {/* Playing Styles */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">{selectedTeam?.name}</h4>
                      <p className="text-sm text-blue-800 mb-2">Style: {comparisonApiData?.comparison?.team1_style}</p>
                      <ul className="space-y-1">
                        {(comparisonApiData?.comparison?.team1_strengths || []).map((s: string, idx: number) => (
                          <li key={idx} className="text-sm text-blue-700 flex items-center">
                            <div className="h-1.5 w-1.5 bg-blue-400 rounded-full mr-2 flex-shrink-0"></div>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-orange-900 mb-2">{comparisonTeam.name}</h4>
                      <p className="text-sm text-orange-800 mb-2">Style: {comparisonApiData?.comparison?.team2_style}</p>
                      <ul className="space-y-1">
                        {(comparisonApiData?.comparison?.team2_strengths || []).map((s: string, idx: number) => (
                          <li key={idx} className="text-sm text-orange-700 flex items-center">
                            <div className="h-1.5 w-1.5 bg-orange-400 rounded-full mr-2 flex-shrink-0"></div>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {comparisonScoutingReport && (
                    <div className="mt-8 border-t border-gray-200 pt-6 space-y-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <h4 className="text-xl font-bold text-gray-900">
                            {comparisonScoutingReport.team_name} vs {comparisonScoutingReport.opponent_name} Scouting Report
                          </h4>
                          <p className="mt-1 text-sm text-gray-600">
                            {comparisonScoutingReport.team_name} vs {comparisonScoutingReport.opponent_name}
                          </p>
                          <p className="text-sm text-gray-600">{comparisonScoutingReport.sport}</p>
                          <p className="text-sm text-gray-500">{new Date(comparisonScoutingReport.generated_at).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-5">
                        <h5 className="text-base font-semibold text-gray-900 mb-2">Executive Summary</h5>
                        <p className="text-sm text-gray-700 leading-relaxed">{comparisonScoutingReport.summary.team_identity}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white border border-green-200 rounded-lg p-5">
                          <h5 className="text-base font-semibold text-green-800 mb-3">Key Strengths</h5>
                          <ul className="space-y-2">
                            {comparisonScoutingReport.summary.key_strengths.map((strength, index) => (
                              <li key={index} className="text-sm text-gray-700">• {strength}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="bg-white border border-red-200 rounded-lg p-5">
                          <h5 className="text-base font-semibold text-red-800 mb-3">Key Weaknesses</h5>
                          <ul className="space-y-2">
                            {comparisonScoutingReport.summary.key_weaknesses.map((weakness, index) => (
                              <li key={index} className="text-sm text-gray-700">• {weakness}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="bg-white border border-indigo-200 rounded-lg p-5">
                        <h5 className="text-base font-semibold text-indigo-800 mb-3">Strategic Recommendations</h5>
                        <ul className="space-y-2">
                          {comparisonScoutingReport.summary.strategic_recommendations.map((recommendation, index) => (
                            <li key={index} className="text-sm text-gray-700">• {recommendation}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-5">
                        <h5 className="text-base font-semibold text-gray-900 mb-3">Matchup Analysis</h5>
                        <p className="text-sm text-gray-700 mb-1"><strong>Predicted Outcome</strong></p>
                        <p className="text-sm text-gray-900 font-semibold mb-4">{comparisonScoutingReport.matchup_analysis.predicted_outcome}</p>
                        <p className="text-sm text-gray-700 mb-1">Confidence: {Math.round(comparisonScoutingReport.matchup_analysis.confidence * 100)}%</p>
                        <p className="text-sm text-gray-700 mt-4 mb-2"><strong>Key Factors</strong></p>
                        <ul className="space-y-1">
                          {comparisonScoutingReport.matchup_analysis.key_factors.map((factor, index) => (
                            <li key={index} className="text-sm text-gray-700">• {factor}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-5">
                        <h5 className="text-base font-semibold text-gray-900 mb-3">Opponent Profile</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <p className="text-sm font-medium text-gray-900 mb-2">Offensive Tendencies</p>
                            <ul className="space-y-1">
                              {comparisonScoutingReport.opponent_profile.offensive_tendencies.map((tendency, index) => (
                                <li key={index} className="text-sm text-gray-700">• {tendency}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 mb-2">Defensive Tendencies</p>
                            <ul className="space-y-1">
                              {comparisonScoutingReport.opponent_profile.defensive_tendencies.map((tendency, index) => (
                                <li key={index} className="text-sm text-gray-700">• {tendency}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 mt-4"><strong>Recent Form:</strong> {comparisonScoutingReport.opponent_profile.recent_form}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Help Section */}
          <div className="mt-8">
            <div className="bg-indigo-50 rounded-lg p-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <ChartBarIcon className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-indigo-800">
                    Understanding Analytics
                  </h3>
                  <div className="mt-2 text-sm text-indigo-700">
                    <ul className="space-y-1 list-disc list-inside">
                      <li><strong>Team Identity:</strong> Playing style analysis based on offensive/defensive stats</li>
                      <li><strong>Performance Metrics:</strong> Overall, offensive, defensive, and consistency ratings (0–100)</li>
                      <li><strong>Trends:</strong> Recent form, streaks, and period-by-period breakdowns</li>
                      <li><strong>Comparison:</strong> Select a second team to see head-to-head matchup factors</li>
                      <li><strong>Tip:</strong> You can also reach this page by clicking "Analytics" on any team card in the Teams tab</li>
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

export default Analytics;