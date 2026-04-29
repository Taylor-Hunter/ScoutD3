import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  DocumentTextIcon,
  ChartBarIcon,
  TrophyIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';

interface ScoutingReportData {
  id: string;
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
  statistics: {
    recent_games: any[];
    season_averages: any;
    vs_similar_opponents: any;
  };
  overall_statistics?: {
    team?: {
      name?: string;
      season?: string;
      record?: string;
      stats?: Record<string, unknown>;
    };
    opponent?: {
      name?: string;
      season?: string;
      record?: string;
      stats?: Record<string, unknown>;
    };
  };
}

interface TeamOption {
  id: string;
  name: string;
  school_name: string;
  conference: string;
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

const ScoutingReport: React.FC = () => {
  const { teamId, opponentId } = useParams<{ teamId: string; opponentId: string }>();
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>(opponentId || '');
  const [reportData, setReportData] = useState<ScoutingReportData | null>(null);

  // Fetch team data
  const { data: teamResponse } = useQuery(
    ['team', teamId],
    () => teamId ? api.teams.getById(teamId) : null,
    { enabled: !!teamId }
  );

  // Fetch potential opponents
  const { data: opponentsResponse } = useQuery(
    ['team-opponents', teamId],
    () => teamId ? api.teams.getOpponents(teamId) : null,
    { enabled: !!teamId }
  );

  // Fetch all teams for opponent selection
  const { data: allTeamsResponse } = useQuery(
    ['teams-for-selection'],
    () => api.teams.getAll()
  );

  // Generate report mutation
  const generateReport = useMutation(
    (data: { teamId: string; opponentId: string; sport: string }) =>
      api.reports.generate(data),
    {
      onSuccess: (response) => {
        setReportData(response.data);
      },
      onError: (error) => {
        console.error('Failed to generate report:', error);
      },
    }
  );

  const team = teamResponse?.data?.error ? null : teamResponse?.data;
  const opponents: TeamOption[] = opponentsResponse?.data?.opponents || allTeamsResponse?.data?.teams || [];
  const selectedOpponent = opponents.find(opp => opp.id === selectedOpponentId);

  const handleGenerateReport = () => {
    if (teamId && selectedOpponentId && team?.sport) {
      generateReport.mutate({
        teamId,
        opponentId: selectedOpponentId,
        sport: team.sport,
      });
    }
  };

  const downloadPdf = async () => {
    if (reportData?.id) {
      try {
        const response = await api.reports.getPdf(reportData.id);
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `scouting-report-${team?.name}-vs-${selectedOpponent?.name}.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to download PDF:', error);
      }
    }
  };

  if (!team) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="text-gray-500">Loading team data...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Scouting Report - {team.name} - ScoutD3</title>
        <meta name="description" content={`Generate professional scouting report for ${team.name} opponent analysis.`} />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="md:flex md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
                Scouting Report Generator
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {team.name} • {team.conference}
              </p>
            </div>
            <div className="mt-4 flex md:ml-4 md:mt-0">
              <Link
                to="/teams"
                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                ← Back to Teams
              </Link>
            </div>
          </div>

          {/* Opponent Selection */}
          {!reportData && (
            <div className="mt-8">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Select Opponent to Scout
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Choose opponent team:
                    </label>
                    <select
                      className="block w-full max-w-md py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={selectedOpponentId}
                      onChange={(e) => setSelectedOpponentId(e.target.value)}
                    >
                      <option value="">Select an opponent...</option>
                      {opponents.map(opponent => (
                        <option key={opponent.id} value={opponent.id}>
                          {opponent.name} ({opponent.conference})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedOpponent && (
                    <div className="bg-gray-50 p-4 rounded-md">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        Selected Opponent:
                      </h4>
                      <div className="text-sm text-gray-600">
                        <div><strong>Team:</strong> {selectedOpponent.name}</div>
                        <div><strong>Conference:</strong> {selectedOpponent.conference}</div>
                      </div>
                    </div>
                  )}

                  <div>
                    <button
                      onClick={handleGenerateReport}
                      disabled={!selectedOpponentId || generateReport.isLoading}
                      className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generateReport.isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating Report...
                        </>
                      ) : (
                        <>
                          <DocumentTextIcon className="h-4 w-4 mr-2" />
                          Generate Scouting Report
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {generateReport.isLoading && (
            <div className="mt-8">
              <div className="bg-blue-50 rounded-lg p-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      Generating Professional Scouting Report
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        Analyzing opponent statistics, recent performance, and strategic tendencies...
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {generateReport.error && (
            <div className="mt-8">
              <div className="bg-red-50 rounded-lg p-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Report Generation Failed
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>
                        Unable to generate scouting report. This may be due to insufficient data or system issues.
                      </p>
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={handleGenerateReport}
                        className="text-sm font-medium text-red-800 underline hover:text-red-700"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Generated Report */}
          {reportData && (
            <div className="mt-8 space-y-6">
              {/* Report Header */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      Professional Scouting Report
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {reportData.team_name} vs {reportData.opponent_name} • {reportData.sport} • Generated {new Date(reportData.generated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setReportData(null)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <EyeIcon className="h-4 w-4 mr-1" />
                      New Report
                    </button>
                    <button
                      onClick={downloadPdf}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="bg-white shadow rounded-lg p-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                  Executive Summary
                </h4>
                <div className="prose max-w-none">
                  <p className="text-gray-700 leading-relaxed">
                    {reportData.summary.team_identity}
                  </p>
                </div>
              </div>

              {/* Overall Team Statistics */}
              {reportData.overall_statistics && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Overall Team Statistics</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {([reportData.overall_statistics.team, reportData.overall_statistics.opponent] as const)
                      .filter(Boolean)
                      .map((teamBlock, idx) => {
                        if (!teamBlock) {
                          return null;
                        }

                        const statKeys = getPrimaryStatKeys(reportData.sport);
                        return (
                          <div key={idx} className="rounded-md border border-gray-200 p-4 bg-gray-50">
                            <p className="text-sm font-semibold text-gray-900">{teamBlock.name || 'Team'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Record: {teamBlock.record || 'N/A'} • Season: {teamBlock.season || reportData.season || 'N/A'}
                            </p>
                            <div className="mt-3 space-y-1 text-sm text-gray-700">
                              {statKeys.map((key) => (
                                <p key={key}>
                                  <span className="font-medium">{statLabel(key)}:</span>{' '}
                                  {statValue(key, teamBlock.stats?.[key])}
                                </p>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Key Insights Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Strengths */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <TrophyIcon className="h-5 w-5 text-yellow-500 mr-2" />
                    Key Strengths
                  </h4>
                  <ul className="space-y-2">
                    {reportData.summary.key_strengths.map((strength, index) => (
                      <li key={index} className="flex items-start">
                        <div className="flex-shrink-0 h-2 w-2 bg-green-400 rounded-full mt-2 mr-3"></div>
                        <span className="text-sm text-gray-700">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="bg-white shadow rounded-lg p-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                    Areas to Target
                  </h4>
                  <ul className="space-y-2">
                    {reportData.summary.key_weaknesses.map((weakness, index) => (
                      <li key={index} className="flex items-start">
                        <div className="flex-shrink-0 h-2 w-2 bg-red-400 rounded-full mt-2 mr-3"></div>
                        <span className="text-sm text-gray-700">{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Strategic Recommendations */}
              <div className="bg-white shadow rounded-lg p-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <ChartBarIcon className="h-5 w-5 text-indigo-500 mr-2" />
                  Strategic Recommendations
                </h4>
                <div className="space-y-3">
                  {reportData.summary.strategic_recommendations.map((recommendation, index) => (
                    <div key={index} className="bg-indigo-50 p-4 rounded-md">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-indigo-100 text-indigo-600 text-sm font-medium">
                            {index + 1}
                          </div>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-indigo-800">{recommendation}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Matchup Analysis */}
              <div className="bg-white shadow rounded-lg p-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">
                  Matchup Analysis
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-600">
                      {reportData.matchup_analysis.predicted_outcome}
                    </div>
                    <div className="text-sm text-gray-500">Predicted Outcome</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {Math.round(reportData.matchup_analysis.confidence * 100)}%
                    </div>
                    <div className="text-sm text-gray-500">Confidence Level</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {reportData.matchup_analysis.key_factors.length}
                    </div>
                    <div className="text-sm text-gray-500">Key Factors</div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <h5 className="text-sm font-medium text-gray-900 mb-2">Critical Factors:</h5>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {reportData.matchup_analysis.key_factors.map((factor, index) => (
                      <li key={index}>• {factor}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Opponent Profile */}
              <div className="bg-white shadow rounded-lg p-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">
                  Opponent Profile
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-2">Offensive Tendencies:</h5>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {reportData.opponent_profile.offensive_tendencies.map((tendency, index) => (
                        <li key={index}>• {tendency}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-2">Defensive Tendencies:</h5>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {reportData.opponent_profile.defensive_tendencies.map((tendency, index) => (
                        <li key={index}>• {tendency}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-sm font-medium text-gray-900">Recent Form:</h5>
                    <p className="text-sm text-gray-700">{reportData.opponent_profile.recent_form}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-900">Home vs Away:</h5>
                    <p className="text-sm text-gray-700">{reportData.opponent_profile.home_vs_away}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ScoutingReport;