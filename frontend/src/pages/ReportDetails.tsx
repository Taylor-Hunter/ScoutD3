import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  CalendarIcon,
  TrophyIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

import { api } from '../services/api';

const ReportDetails: React.FC = () => {
  const { reportId } = useParams<{ reportId: string }>();

  const { data: reportResponse, isLoading } = useQuery(
    ['report', reportId],
    () => reportId ? api.reports.getById(reportId) : null,
    { enabled: !!reportId }
  );

  const downloadPdf = async () => {
    if (!reportId) return;
    try {
      const response = await api.reports.getPdf(reportId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `scouting-report-${reportId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download PDF:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-300 rounded w-3/4"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
            <div className="h-32 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const report = reportResponse?.data?.error ? null : reportResponse?.data;

  if (!report) {
    return (
      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center rounded-lg bg-white p-10 shadow">
            <h2 className="text-xl font-semibold text-gray-900">Report Not Found</h2>
            <p className="mt-2 text-sm text-gray-500">This report is not available from the current live dataset.</p>
            <Link to="/reports" className="mt-4 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500">
              <ArrowLeftIcon className="mr-1 h-4 w-4" />
              Back to Reports
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{report.title} - Scouting Report - ScoutD3</title>
        <meta name="description" content={`Detailed scouting report: ${report.title}`} />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Back navigation */}
          <div className="mb-8">
            <Link
              to="/reports"
              className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeftIcon className="h-4 w-4 mr-1" />
              Back to Reports
            </Link>
          </div>

          {/* Report header */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
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
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={downloadPdf}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Report content */}
          <div className="mt-8 space-y-6">
            {/* Team Identity / Executive Summary */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Executive Summary</h2>
              <p className="text-gray-700 leading-relaxed">
                {report.summary?.team_identity || 'No executive summary available.'}
              </p>
            </div>

            {/* Key Strengths */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Strengths</h2>
              <ul className="space-y-3">
                {report.summary?.key_strengths?.map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <div className="flex-shrink-0 h-2 w-2 bg-green-500 rounded-full mt-2 mr-3"></div>
                    <span className="text-gray-700">{item}</span>
                  </li>
                )) || (
                  <li className="text-gray-500">No strengths data available.</li>
                )}
              </ul>
            </div>

            {/* Key Weaknesses */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Weaknesses</h2>
              <ul className="space-y-3">
                {report.summary?.key_weaknesses?.map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <div className="flex-shrink-0 h-2 w-2 bg-red-500 rounded-full mt-2 mr-3"></div>
                    <span className="text-gray-700">{item}</span>
                  </li>
                )) || (
                  <li className="text-gray-500">No weaknesses data available.</li>
                )}
              </ul>
            </div>

            {/* Strategic Recommendations */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Strategic Recommendations</h2>
              <ul className="space-y-3">
                {report.summary?.strategic_recommendations?.map((recommendation: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <div className="flex-shrink-0 h-2 w-2 bg-indigo-500 rounded-full mt-2 mr-3"></div>
                    <span className="text-gray-700">{recommendation}</span>
                  </li>
                )) || (
                  <li className="text-gray-500">No strategic recommendations available.</li>
                )}
              </ul>
            </div>

            {/* Matchup Analysis */}
            {report.matchup_analysis && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Matchup Analysis</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Predicted Outcome</h3>
                    <p className="text-lg font-semibold text-gray-900">{report.matchup_analysis.predicted_outcome}</p>
                    <p className="text-sm text-gray-500">Confidence: {Math.round((report.matchup_analysis.confidence || 0) * 100)}%</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Key Factors</h3>
                    <ul className="space-y-2">
                      {report.matchup_analysis.key_factors?.map((factor: string, index: number) => (
                        <li key={index} className="flex items-start text-sm">
                          <div className="flex-shrink-0 h-1.5 w-1.5 bg-indigo-400 rounded-full mt-2 mr-2"></div>
                          <span className="text-gray-700">{factor}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Opponent Profile */}
            {report.opponent_profile && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Opponent Profile</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Offensive Tendencies</h3>
                    <ul className="space-y-1">
                      {report.opponent_profile.offensive_tendencies?.map((item: string, index: number) => (
                        <li key={index} className="text-sm text-gray-600">{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Defensive Tendencies</h3>
                    <ul className="space-y-1">
                      {report.opponent_profile.defensive_tendencies?.map((item: string, index: number) => (
                        <li key={index} className="text-sm text-gray-600">{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-500">
                  Recent Form: {report.opponent_profile.recent_form}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ReportDetails;