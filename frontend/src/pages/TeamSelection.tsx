import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  UsersIcon,
  ChartBarIcon,
  DocumentTextIcon,
  TrophyIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

// Team interface definition
interface Team {
  id: number;
  name: string;
  conference: string;
  sport: string;
}

import { api } from '../services/api';
import { useAppSettings } from '../hooks/useAppSettings';

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

// Treat trailing "St." as "State" so names like "Alfred St." match queries for "state".
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

// Fetch teams from the backend API
const fetchTeams = async () => {
  const response = await api.get('/teams');
  return response.data;
};

const TeamSelection: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSport, setSelectedSport] = useState('all');
  const [selectedConference, setSelectedConference] = useState('all');
  const [hasAppliedDefaultSport, setHasAppliedDefaultSport] = useState(false);
  const { settings: appSettings } = useAppSettings();

  // Fetch teams data using React Query
  const { data: teamsData, isLoading, error } = useQuery({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const teams: Team[] = teamsData?.teams || [];

  // Get unique sports for the dropdown
  const availableSports = Array.from(new Set(teams.map(team => team.sport))).sort();

  // Conferences available for the currently selected sport (or all sports)
  const availableConferences = Array.from(
    new Set(
      teams
        .filter((team) => selectedSport === 'all' || team.sport === selectedSport)
        .map((team) => team.conference)
        .filter((conference): conference is string => Boolean(conference))
    )
  ).sort();

  // Reset conference filter when it's no longer valid for the selected sport
  useEffect(() => {
    if (selectedConference !== 'all' && !availableConferences.includes(selectedConference)) {
      setSelectedConference('all');
    }
  }, [selectedConference, availableConferences]);

  // Pre-select the user's preferred default sport once teams are loaded.
  // We only do this on the first load so a user's manual selection wins.
  useEffect(() => {
    if (hasAppliedDefaultSport || teams.length === 0) {
      return;
    }
    const preferred = appSettings.defaultSport.trim().toLowerCase();
    if (preferred) {
      const match = availableSports.find((sport) =>
        sport.toLowerCase().includes(preferred)
      );
      if (match) {
        setSelectedSport(match);
      }
    }
    setHasAppliedDefaultSport(true);
  }, [appSettings.defaultSport, availableSports, hasAppliedDefaultSport, teams.length]);

  // Filter teams based on search term and sport
  const filteredTeams = teams.filter((team) => {
    const normalizedSearch = normalizeSearchText(searchTerm);
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
    const matchesConference = selectedConference === 'all' || team.conference === selectedConference;

    return matchesSearch && matchesSport && matchesConference;
  });

  if (isLoading) {
    return (
      <>
        <Helmet>
          <title>Team Selection - ScoutD3</title>
        </Helmet>
        <div className="min-h-screen bg-gray-50 py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              <p className="mt-4 text-lg text-gray-600">Loading teams...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Helmet>
          <title>Team Selection - ScoutD3</title>
        </Helmet>
        <div className="min-h-screen bg-gray-50 py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <UsersIcon className="mx-auto h-12 w-12 text-red-400" />
              <p className="mt-4 text-lg text-red-600">Failed to load teams</p>
              <Link to="/data" className="mt-4 text-indigo-600 hover:text-indigo-500">
                Go to Data Import →
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Team Selection - ScoutD3</title>
        <meta name="description" content="Browse and select NCAA Division III teams for scouting analysis." />
      </Helmet>

      <div className="min-h-screen bg-gray-50 py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Team Selection</h2>
            <p className="mt-2 text-sm text-gray-600">
              Browse NCAA Division III teams and select opponents for analysis
            </p>
            <p className="mt-2 text-sm text-gray-600">
              View Team: Opponents are from the same conference when generating reports.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Analytics: Choose any opponent in D3 to generate report.
            </p>
            <Link to="/dashboard" className="mt-4 inline-flex items-center text-indigo-600 hover:text-indigo-500">
              ← Back to Dashboard
            </Link>
          </div>

          {/* Search and Filters */}
          {teams.length > 0 && (
            <div className="mb-6 flex flex-col sm:flex-row gap-4">
              {/* Search input */}
              <div className="flex-1">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 py-2 pl-10 pr-3 text-gray-900 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                    placeholder="Search teams or conferences..."
                  />
                </div>
              </div>

              {/* Sport filter */}
              <div className="sm:w-48">
                <select
                  value={selectedSport}
                  onChange={(e) => setSelectedSport(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 py-2 pl-3 pr-10 text-gray-900 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                >
                  <option value="all">All Sports</option>
                  {availableSports.map((sport) => (
                    <option key={sport} value={sport}>
                      {sport}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conference filter */}
              <div className="sm:w-64">
                <select
                  value={selectedConference}
                  onChange={(e) => setSelectedConference(e.target.value)}
                  className="block w-full rounded-md border border-gray-300 py-2 pl-3 pr-10 text-gray-900 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600"
                >
                  <option value="all">All Conferences</option>
                  {availableConferences.map((conference) => (
                    <option key={conference} value={conference}>
                      {conference}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Results summary */}
          {teams.length > 0 && (
            <div className="mb-4 text-sm text-gray-600">
              Showing {filteredTeams.length} of {teams.length} teams
            </div>
          )}

          {/* Content */}
          {teams.length === 0 ? (
            <div className="text-center py-12">
              <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No teams available</h3>
              <p className="mt-2 text-sm text-gray-500">
                ScoutD3 is waiting for NCAA data to finish loading. The first load starts automatically on first access; use Data Ingestion for manual refreshes.
              </p>
              <div className="mt-6">
                <Link
                  to="/data"
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  <DocumentTextIcon className="mr-2 h-4 w-4" />
                  Open Data Ingestion
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Teams grid */}
              <div className="team-selection-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTeams.map((team) => (
                  <div
                    key={team.id}
                    className="team-selection-card bg-white rounded-lg border border-gray-300 p-6 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center mb-4">
                      <div className="team-card-avatar h-10 w-10 bg-indigo-600 rounded-full flex items-center justify-center">
                        <span className="team-card-avatar-text text-sm font-medium text-white">
                          {team.name.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-medium text-gray-900">
                          {team.name}
                        </h3>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-500 mb-4">
                      <div className="flex items-center">
                        <AcademicCapIcon className="team-card-meta-icon h-4 w-4 mr-2" />
                        <span>{team.sport}</span>
                      </div>
                      <div className="flex items-center">
                        <UsersIcon className="team-card-meta-icon h-4 w-4 mr-2" />
                        <span>{team.conference}</span>
                      </div>
                    </div>

                    <div className="team-card-actions-panel flex space-x-2">
                      <Link
                        to={`/teams/${team.id}`}
                        className="team-selection-primary-action flex-1 inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                      >
                        <ChartBarIcon className="mr-2 h-4 w-4" />
                        View Team
                      </Link>
                      <Link
                        to={`/analytics?team=${team.id}`}
                        className="team-selection-secondary-action flex-1 inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                      >
                        <DocumentTextIcon className="mr-2 h-4 w-4" />
                        Analytics
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* No results state */}
              {filteredTeams.length === 0 && searchTerm && (
                <div className="text-center py-12">
                  <MagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-4 text-lg font-medium text-gray-900">No teams found</h3>
                  <p className="mt-2 text-sm text-gray-500">Try adjusting your search terms.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default TeamSelection;