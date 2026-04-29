import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  TrophyIcon,
  MapPinIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';

interface TeamReport {
  id: string;
  title: string;
  team_id?: string;
  opponent_id?: string;
  team_name: string;
  opponent_name: string;
  sport?: string;
  generated_at: string;
  status?: string;
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

const TeamDetails: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>('');
  const [downloadingStatsPdf, setDownloadingStatsPdf] = useState(false);

  const { data: teamResponse, isLoading } = useQuery(
    ['team', teamId],
    () => teamId ? api.teams.getById(teamId) : null,
    { enabled: !!teamId }
  );

  // Fetch opponents for this team
  const { data: opponentsResponse } = useQuery(
    ['team-opponents', teamId],
    () => teamId ? api.teams.getOpponents(teamId) : null,
    { enabled: !!teamId }
  );

  const { data: teamStatsResponse, isLoading: isStatsLoading } = useQuery(
    ['team-statistics', teamId],
    () => teamId ? api.teams.getStatistics(teamId) : null,
    { enabled: !!teamId }
  );

  const { data: reportsResponse, isLoading: isReportsLoading } = useQuery(
    ['reports', 'team-details', teamId],
    () => api.reports.getAll(),
    { enabled: !!teamId }
  );

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-300 rounded w-1/3 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-64 bg-gray-300 rounded"></div>
              <div className="h-64 bg-gray-300 rounded"></div>
              <div className="h-64 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const team = teamResponse?.data?.error ? null : teamResponse?.data;

  if (!team) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center rounded-lg bg-white p-10 shadow">
            <h2 className="text-xl font-semibold text-gray-900">Team Not Found</h2>
            <p className="mt-2 text-sm text-gray-500">ScoutD3 could not find live data for this team.</p>
            <Link to="/teams" className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500">
              <ArrowLeftIcon className="mr-1 h-4 w-4" />
              Back to Teams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const opponents = opponentsResponse?.data?.opponents || [];
  const teamStats = teamStatsResponse?.data;
  const displayRecord = teamStats?.record || (team.wins !== undefined && team.losses !== undefined ? `${team.wins}-${team.losses}` : null);
  const allReports: TeamReport[] = reportsResponse?.data?.reports || [];
  const normalizedTeamName = String(team?.name || '').trim().toLowerCase();
  const normalizedTeamSport = String(team?.sport || '').trim().toLowerCase();
  const recentTeamReports = allReports
    .filter((report) => {
      const byId = !!teamId && String(report.team_id || '') === String(teamId);
      if (byId) {
        return true;
      }

      const reportTeamName = String(report.team_name || '').trim().toLowerCase();
      const reportSport = String(report.sport || '').trim().toLowerCase();
      const byLegacyNameAndSport = reportTeamName === normalizedTeamName
        && (!normalizedTeamSport || !reportSport || reportSport === normalizedTeamSport);

      return byLegacyNameAndSport;
    })
    .sort((a, b) => {
      const aTime = new Date(a.generated_at).getTime();
      const bTime = new Date(b.generated_at).getTime();
      return bTime - aTime;
    })
    .slice(0, 3);

  const statLabelMap: Record<string, string> = {
    ppg: 'PPG',
    opp_ppg: 'Opp PPG',
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
  };

  const formatStatValue = (key: string, value: any) => {
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

  const formatStatLabel = (key: string) => {
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

  const downloadTeamStatsPdf = async () => {
    if (!teamId) {
      return;
    }

    try {
      setDownloadingStatsPdf(true);
      const response = await api.teams.getStatisticsPdf(teamId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(team?.name || 'team').replace(/\s+/g, '-').toLowerCase()}-stats.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download team stats PDF:', err);
    } finally {
      setDownloadingStatsPdf(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{team.name} - Team Details - ScoutD3</title>
        <meta name="description" content={`Detailed information about ${team.name} athletics program.`} />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Back navigation */}
          <div className="mb-8">
            <Link
              to="/teams"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Teams
            </Link>
          </div>

          {/* Team header */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
              <div className="mt-2 flex items-center text-sm text-gray-500 space-x-6">
                <div className="flex items-center">
                  <TrophyIcon className="h-4 w-4 mr-1" />
                  {team.conference}
                </div>
                {team.location && (
                  <div className="flex items-center">
                    <MapPinIcon className="h-4 w-4 mr-1" />
                    {team.location}
                  </div>
                )}
              </div>
            </div>

            {/* Team actions */}
            <div className="px-6 py-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-x-6 gap-y-3 xl:grid-cols-[max-content,max-content,minmax(320px,1fr),max-content] xl:items-start">
                  <p className="max-w-[128px] text-xs leading-4 text-slate-500 mt-1 mb-2">Compare with any D3 opponent.</p>
                  <p className="text-xs leading-4 text-transparent select-none mt-1 mb-2">Export this team's stat sheet.</p>
                  <p className="max-w-[320px] text-xs leading-4 text-slate-500 mt-1 mb-2">Opponent suggestions here are same-conference teams.</p>
                  <p className="hidden xl:block text-xs leading-4 text-transparent select-none mt-1 mb-2">Generate scouting report.</p>

                  <div className="xl:self-end">
                    <Link
                      to={`/analytics?team=${team.id}`}
                      className="inline-flex h-10 w-fit items-center px-3 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      View Analytics
                    </Link>
                  </div>
                  <div className="xl:self-end">
                    <button
                      onClick={downloadTeamStatsPdf}
                      disabled={downloadingStatsPdf || !teamId}
                      className={`inline-flex h-10 items-center px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${downloadingStatsPdf ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                      {downloadingStatsPdf ? 'Generating PDF...' : 'Download Team Stats PDF'}
                    </button>
                  </div>
                  <div className="flex items-end gap-2 xl:self-end">
                    <label htmlFor="team-details-opponent" className="sr-only">Select Opponent</label>
                    <select
                      id="team-details-opponent"
                      value={selectedOpponentId}
                      onChange={(e) => setSelectedOpponentId(e.target.value)}
                      className="block h-10 w-[220px] px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    >
                      <option value="">Choose opponent...</option>
                      {opponents.map((opp: any) => (
                        <option key={opp.id} value={opp.id}>{opp.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (selectedOpponentId) {
                          navigate(`/scout/${team.id}/${selectedOpponentId}`);
                        }
                      }}
                      disabled={!selectedOpponentId}
                      className={`inline-flex h-10 items-center justify-center px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${!selectedOpponentId ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      Generate Scouting Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Team information */}
          <div className="mt-8 grid grid-cols-1 items-start gap-6 md:grid-cols-2">
            {/* Sports */}
            <div className="h-[320px] bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <TrophyIcon className="h-5 w-5 text-indigo-500 mr-2" />
                Sport
              </h3>
              <p className="text-sm text-gray-700">{team.sport || 'N/A'}</p>
              {displayRecord && (
                <p className="text-sm text-gray-500 mt-2">Record: {displayRecord}</p>
              )}
              {teamStats?.season && (
                <p className="text-sm text-gray-500 mt-2">Stats Season: {teamStats.season}</p>
              )}
            </div>

            {/* Recent Reports */}
            <div className="h-[320px] bg-white shadow rounded-lg p-6 flex flex-col">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Recent Scouting Reports
              </h3>
              {isReportsLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ) : recentTeamReports.length > 0 ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                    {recentTeamReports.map((report) => (
                      <Link
                        key={report.id}
                        to={`/reports/${report.id}`}
                        className="block rounded-md border border-gray-200 px-3 py-2 hover:bg-gray-50"
                      >
                        <p className="text-sm font-medium text-gray-900">{report.title}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {report.team_name} vs {report.opponent_name} • {new Date(report.generated_at).toLocaleDateString()}
                        </p>
                        {report.overall_statistics && (
                          <div className="mt-2 text-xs text-gray-600">
                            {report.overall_statistics.team && (
                              <p>
                                {report.overall_statistics.team.name || report.team_name} ({report.overall_statistics.team.record || 'N/A'}) - {buildStatSummary(report.sport || team.sport || '', report.overall_statistics.team.stats)}
                              </p>
                            )}
                            {report.overall_statistics.opponent && (
                              <p className="mt-1">
                                {report.overall_statistics.opponent.name || report.opponent_name} ({report.overall_statistics.opponent.record || 'N/A'}) - {buildStatSummary(report.sport || team.sport || '', report.overall_statistics.opponent.stats)}
                              </p>
                            )}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                  <Link
                    to="/reports"
                    className="inline-block text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    View all reports →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-1 flex-col justify-between space-y-3">
                  <div className="text-sm text-gray-500">
                    No recent reports for this team
                  </div>
                  <Link
                    to="/reports"
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    View all reports →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Statistics below top cards */}
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Statistics Overview
            </h3>
            {teamStats?.season && (
              <p className="text-sm text-gray-500 mb-4">
                These Stats Are From: {teamStats.season}
              </p>
            )}
            {isStatsLoading ? (
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ) : teamStats?.stats ? (
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
            ) : (
              <div className="text-sm text-gray-500">No team statistics available yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default TeamDetails;