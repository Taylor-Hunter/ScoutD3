import { useState, useEffect, useCallback } from 'react';

export interface AccessibilitySettings {
  darkMode: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  fontScale: number;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
  focusVisible: boolean;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  darkMode: false,
  highContrast: false,
  reducedMotion: false,
  fontScale: 1.0,
  screenReaderOptimized: false,
  keyboardNavigation: false,
  focusVisible: false,
};

const STORAGE_KEY = 'scoutd3-accessibility-settings';

export const useAccessibilitySettings = () => {
  const [accessibilitySettings, setAccessibilitySettings] = useState<AccessibilitySettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load accessibility settings from localStorage:', error);
    }
    
    // Check for system preferences
    const systemPreferences = getSystemAccessibilityPreferences();
    return { ...DEFAULT_SETTINGS, ...systemPreferences };
  });

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(accessibilitySettings));
    } catch (error) {
      console.warn('Failed to save accessibility settings to localStorage:', error);
    }
  }, [accessibilitySettings]);

  // Apply CSS custom properties and classes based on settings
  useEffect(() => {
    const root = document.documentElement;
    const darkModeEnabled = Boolean(accessibilitySettings.darkMode);
    const highContrastEnabled = Boolean(accessibilitySettings.highContrast);
    const reducedMotionEnabled = Boolean(accessibilitySettings.reducedMotion);
    const screenReaderEnabled = Boolean(accessibilitySettings.screenReaderOptimized);
    const keyboardNavEnabled = Boolean(accessibilitySettings.keyboardNavigation);
    const focusVisibleEnabled = Boolean(accessibilitySettings.focusVisible);
    const fontScale = Number(accessibilitySettings.fontScale) || 1;
    
    // Font scale
    root.style.setProperty('--font-scale', fontScale.toString());
    
    // High contrast mode
    root.classList.toggle('high-contrast', highContrastEnabled);

    // Dark mode
    root.classList.toggle('dark-mode', darkModeEnabled);
    
    // Reduced motion
    root.classList.toggle('reduced-motion', reducedMotionEnabled);
    
    // Screen reader optimized
    root.classList.toggle('screen-reader-optimized', screenReaderEnabled);
    
    // Enhanced keyboard navigation
    root.classList.toggle('enhanced-keyboard-nav', keyboardNavEnabled);
    
    // Enhanced focus indicators
    root.classList.toggle('enhanced-focus', focusVisibleEnabled);
    
    // Set data attributes for CSS targeting
    root.setAttribute('data-high-contrast', String(highContrastEnabled));
    root.setAttribute('data-dark-mode', String(darkModeEnabled));
    root.setAttribute('data-reduced-motion', String(reducedMotionEnabled));
    root.setAttribute('data-screen-reader', String(screenReaderEnabled));
    
  }, [accessibilitySettings]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQueries = {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)'),
      highContrast: window.matchMedia('(prefers-contrast: high)'),
    };

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        updateAccessibilitySettings({ reducedMotion: true });
      }
    };

    const handleHighContrastChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        updateAccessibilitySettings({ highContrast: true });
      }
    };

    // Add listeners
    mediaQueries.reducedMotion.addEventListener('change', handleReducedMotionChange);
    mediaQueries.highContrast.addEventListener('change', handleHighContrastChange);

    return () => {
      mediaQueries.reducedMotion.removeEventListener('change', handleReducedMotionChange);
      mediaQueries.highContrast.removeEventListener('change', handleHighContrastChange);
    };
  }, []);

  useEffect(() => {
    if (!accessibilitySettings.keyboardNavigation) {
      return;
    }

    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (!event.altKey) {
        return;
      }

      if (event.key === '1') {
        event.preventDefault();
        const main = document.getElementById('main-content');
        if (main) {
          main.setAttribute('tabindex', '-1');
          main.focus();
        }
      }

      if (event.key === '2') {
        event.preventDefault();
        const firstNavLink = document.querySelector('nav a') as HTMLElement | null;
        firstNavLink?.focus();
      }

      if (event.key === '3') {
        event.preventDefault();
        const controlsButton = document.getElementById('accessibility-controls-toggle') as HTMLElement | null;
        controlsButton?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => document.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [accessibilitySettings.keyboardNavigation]);

  useEffect(() => {
    if (!accessibilitySettings.screenReaderOptimized) {
      return;
    }

    announceToScreenReader(
      'Screen reader optimization enabled. Keyboard shortcuts: Alt+1 for main content, Alt+2 for navigation, Alt+3 for accessibility controls.'
    );
  }, [accessibilitySettings.screenReaderOptimized]);

  const updateAccessibilitySettings = useCallback((updates: Partial<AccessibilitySettings>) => {
    setAccessibilitySettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetAccessibilitySettings = useCallback(() => {
    setAccessibilitySettings(DEFAULT_SETTINGS);
  }, []);

  return {
    accessibilitySettings,
    updateAccessibilitySettings,
    resetAccessibilitySettings,
  };
};

/**
 * Get system accessibility preferences from media queries and browser APIs
 */
function getSystemAccessibilityPreferences(): Partial<AccessibilitySettings> {
  const preferences: Partial<AccessibilitySettings> = {};

  try {
    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      preferences.reducedMotion = true;
    }

    // Check for high contrast preference
    if (window.matchMedia('(prefers-contrast: high)').matches) {
      preferences.highContrast = true;
    }

    // Respect system dark mode on first load
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      preferences.darkMode = true;
    }

    // Check for screen reader usage (heuristic)
    if (isScreenReaderDetected()) {
      preferences.screenReaderOptimized = true;
      preferences.keyboardNavigation = true;
      preferences.focusVisible = true;
    }

  } catch (error) {
    console.warn('Failed to detect system accessibility preferences:', error);
  }

  return preferences;
}

/**
 * Heuristic detection of screen reader usage
 * This is not 100% accurate but provides a reasonable starting point
 */
function isScreenReaderDetected(): boolean {
  try {
    // Check for common screen reader user agents
    const userAgent = navigator.userAgent.toLowerCase();
    const screenReaderIndicators = [
      'nvda', 'jaws', 'voiceover', 'talkback', 'orca'
    ];
    
    if (screenReaderIndicators.some(indicator => userAgent.includes(indicator))) {
      return true;
    }

    // Check for speech synthesis support (not definitive but helpful)
    if ('speechSynthesis' in window && speechSynthesis.getVoices().length > 0) {
      return false; // This would need more sophisticated detection
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Announce message to screen readers
 */
export const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  // Remove after announcement
  setTimeout(() => {
    if (announcement.parentNode) {
      announcement.parentNode.removeChild(announcement);
    }
  }, 1000);
};

export default useAccessibilitySettings;