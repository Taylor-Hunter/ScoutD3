import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';

// Components
import Header from './components/Header';
import Footer from './components/Footer';
import Navigation from './components/Navigation';
import AppReadinessBanner from './components/AppReadinessBanner';
import ErrorBoundary from './components/ErrorBoundary';
import AccessibilityControls from './components/AccessibilityControls';
import LoadingSpinner from './components/LoadingSpinner';
import { AuthProvider } from './contexts/AuthContext';

// Pages
import Dashboard from './pages/Dashboard';
import HomePage from './pages/HomePage'; 
import TeamSelection from './pages/TeamSelection';
import TeamDetails from './pages/TeamDetails';
import ScoutingReport from './pages/ScoutingReport';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import ReportDetails from './pages/ReportDetails';
import DataIngestion from './pages/DataIngestion';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Hooks
import { useAccessibilitySettings } from './hooks/useAccessibilitySettings';
import { useApplicationState } from './hooks/useApplicationState';

// Styles
import './styles/globals.css';
import './styles/accessibility.css';

// Create React Query client with accessibility-friendly defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      retry: 1,
    },
  },
});

function App() {
  const { 
    accessibilitySettings, 
    updateAccessibilitySettings 
  } = useAccessibilitySettings();
  
  const { 
    isLoading, 
    error, 
    announcements,
    announceMessage 
  } = useApplicationState();

  // Apply accessibility settings to document
  React.useEffect(() => {
    const root = document.documentElement;
    
    // High contrast mode
    if (accessibilitySettings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    
    // Reduced motion
    if (accessibilitySettings.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }
    
    // Font scale
    root.style.setProperty('--font-scale', accessibilitySettings.fontScale.toString());
    
  }, [accessibilitySettings]);

  // Announce navigation changes for screen readers
  React.useEffect(() => {
    const handleRouteChange = () => {
      announceMessage('Page navigation completed');
    };
    
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, [announceMessage]);

  if (error) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-800 mb-4">
              Application Error
            </h1>
            <p className="text-red-600 mb-4">
              We're sorry, but something went wrong. Please refresh the page or try again later.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Refresh Page
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ErrorBoundary>
            <Router>
              <div className="min-h-screen bg-gray-50 flex flex-col">
              {/* Skip to content link for keyboard navigation */}
              <a href="#main-content" className="skip-nav-link">
                Skip to main content
              </a>
              
              {/* Accessibility controls */}
              <AccessibilityControls 
                settings={accessibilitySettings}
                onSettingsChange={updateAccessibilitySettings}
              />
              
              {/* Header */}
              <Header />
              
              {/* Main navigation */}
              <Navigation />

              {/* App readiness banner */}
              <AppReadinessBanner />
              
              {/* Loading overlay */}
              {isLoading && (
                <div 
                  className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
                  aria-live="polite"
                  aria-label="Loading content"
                >
                  <LoadingSpinner size="large" />
                </div>
              )}
              
              {/* Main content area */}
                <main className="app-main-content flex-1" role="main" id="main-content" tabIndex={-1}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/teams" element={<TeamSelection />} />
                    <Route path="/teams/:teamId" element={<TeamDetails />} />
                    <Route path="/scout/:teamId/:opponentId" element={<ScoutingReport />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/reports/:reportId" element={<ReportDetails />} />
                    <Route path="/data" element={<DataIngestion />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/help" element={<Help />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </main>

                <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
                  {announcements.length > 0 ? announcements[announcements.length - 1] : ''}
                </div>
              
              {/* Footer */}
              <Footer />
              </div>
            </Router>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;