import { useState, useCallback } from 'react';

interface ApplicationState {
  isLoading: boolean;
  error: string | null;
  announcements: string[];
}

export const useApplicationState = () => {
  const [state, setState] = useState<ApplicationState>({
    isLoading: false,
    error: null,
    announcements: [],
  });

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const announceMessage = useCallback((message: string) => {
    setState(prev => ({
      ...prev,
      announcements: [...prev.announcements, message]
    }));

    // Clear announcement after a delay for screen readers
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        announcements: prev.announcements.filter(ann => ann !== message)
      }));
    }, 3000);
  }, []);

  return {
    ...state,
    setLoading,
    setError,
    clearError,
    announceMessage,
  };
};