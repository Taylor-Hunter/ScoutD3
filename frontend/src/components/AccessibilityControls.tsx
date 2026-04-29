import React, { useEffect, useRef, useState } from 'react';
import { Transition } from '@headlessui/react';
import { 
  AdjustmentsHorizontalIcon, 
  XMarkIcon,
  EyeIcon,
  MoonIcon,
  SpeakerWaveIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

interface AccessibilitySettings {
  darkMode: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  fontScale: number;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
  focusVisible: boolean;
}

interface AccessibilityControlsProps {
  settings: AccessibilitySettings;
  onSettingsChange: (settings: Partial<AccessibilitySettings>) => void;
}

const AccessibilityControls: React.FC<AccessibilityControlsProps> = ({
  settings,
  onSettingsChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const togglePanel = () => setIsOpen(!isOpen);

  const updateSetting = (key: keyof AccessibilitySettings, value: any) => {
    onSettingsChange({ [key]: value });
  };

  useEffect(() => {
    if (isOpen) {
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
      closeButtonRef.current?.focus();
      return;
    }

    lastFocusedElementRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }

      const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) {
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Accessibility controls toggle button */}
      <button
        id="accessibility-controls-toggle"
        onClick={togglePanel}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 p-2 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:p-3"
        aria-label="Open accessibility controls"
        aria-expanded={isOpen}
        aria-controls="accessibility-panel"
      >
        <AdjustmentsHorizontalIcon className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

      {/* Accessibility controls panel */}
      <Transition
        show={isOpen}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={togglePanel} />
      </Transition>

      <Transition
        show={isOpen}
        enter="transition-transform duration-300"
        enterFrom="translate-x-full"
        enterTo="translate-x-0"
        leave="transition-transform duration-200"
        leaveFrom="translate-x-0"
        leaveTo="translate-x-full"
      >
        <div
          id="accessibility-panel"
          ref={panelRef}
          className="fixed top-0 right-0 h-full w-96 bg-white shadow-xl z-50 overflow-y-auto"
          role="dialog"
          aria-labelledby="accessibility-title"
          aria-modal="true"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 
              id="accessibility-title"
              className="text-lg font-semibold text-gray-900"
            >
              Accessibility Settings
            </h2>
            <button
              ref={closeButtonRef}
              onClick={togglePanel}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close accessibility controls"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Panel content */}
          <div className="p-4 space-y-6">
            {/* Visual settings */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-900 mb-3">
                <EyeIcon className="w-5 h-5 inline mr-2" />
                Visual Settings
              </legend>

              {/* Dark mode toggle */}
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="dark-mode" className="text-sm text-gray-700">
                  Dark Mode
                </label>
                <button
                  id="dark-mode"
                  role="switch"
                  aria-checked={settings.darkMode}
                  onClick={() => updateSetting('darkMode', !settings.darkMode)}
                  className={`relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.darkMode ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                      settings.darkMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {settings.darkMode ? 'Disable' : 'Enable'} dark mode
                  </span>
                </button>
              </div>

              {settings.darkMode && (
                <p className="mb-4 text-xs text-gray-500 inline-flex items-center gap-1">
                  <MoonIcon className="w-4 h-4" />
                  Dark mode is active across the site.
                </p>
              )}
              
              {/* High contrast toggle */}
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="high-contrast" className="text-sm text-gray-700">
                  High Contrast Mode
                </label>
                <button
                  id="high-contrast"
                  role="switch"
                  aria-checked={settings.highContrast}
                  onClick={() => updateSetting('highContrast', !settings.highContrast)}
                  className={`relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.highContrast ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                      settings.highContrast ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {settings.highContrast ? 'Disable' : 'Enable'} high contrast mode
                  </span>
                </button>
              </div>

              {/* Reduced motion toggle */}
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="reduced-motion" className="text-sm text-gray-700">
                  Reduce Motion
                </label>
                <button
                  id="reduced-motion"
                  role="switch"
                  aria-checked={settings.reducedMotion}
                  onClick={() => updateSetting('reducedMotion', !settings.reducedMotion)}
                  className={`relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.reducedMotion ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                      settings.reducedMotion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {settings.reducedMotion ? 'Disable' : 'Enable'} reduced motion
                  </span>
                </button>
              </div>

              {/* Font scale slider */}
              <div className="mb-4">
                <label htmlFor="font-scale" className="block text-sm text-gray-700 mb-2">
                  Font Size: {Math.round(settings.fontScale * 100)}%
                </label>
                <input
                  type="range"
                  id="font-scale"
                  min="0.8"
                  max="1.5"
                  step="0.1"
                  value={settings.fontScale}
                  onInput={(e) => updateSetting('fontScale', parseFloat((e.target as HTMLInputElement).value))}
                  onChange={(e) => updateSetting('fontScale', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-describedby="font-scale-help"
                />
                <div id="font-scale-help" className="text-xs text-gray-500 mt-1">
                  Adjust text size from 80% to 150%
                </div>
              </div>
            </fieldset>

            {/* Screen reader settings */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-900 mb-3">
                <SpeakerWaveIcon className="w-5 h-5 inline mr-2" />
                Screen Reader
              </legend>
              
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="screen-reader" className="text-sm text-gray-700">
                  Optimize for Screen Readers
                </label>
                <button
                  id="screen-reader"
                  role="switch"
                  aria-checked={settings.screenReaderOptimized}
                  onClick={() => updateSetting('screenReaderOptimized', !settings.screenReaderOptimized)}
                  className={`relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.screenReaderOptimized ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                      settings.screenReaderOptimized ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {settings.screenReaderOptimized ? 'Disable' : 'Enable'} screen reader optimization
                  </span>
                </button>
              </div>
            </fieldset>

            {/* Keyboard navigation settings */}
            <fieldset>
              <legend className="text-sm font-medium text-gray-900 mb-3">
                <CommandLineIcon className="w-5 h-5 inline mr-2" />
                Keyboard Navigation
              </legend>
              
              <div className="flex items-center justify-between mb-4">
                <label htmlFor="keyboard-nav" className="text-sm text-gray-700">
                  Enhanced Keyboard Navigation
                </label>
                <button
                  id="keyboard-nav"
                  role="switch"
                  aria-checked={settings.keyboardNavigation}
                  onClick={() => updateSetting('keyboardNavigation', !settings.keyboardNavigation)}
                  className={`relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.keyboardNavigation ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                      settings.keyboardNavigation ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {settings.keyboardNavigation ? 'Disable' : 'Enable'} enhanced keyboard navigation
                  </span>
                </button>
              </div>

              {settings.keyboardNavigation && (
                <p className="mb-4 text-xs text-gray-500">
                  Shortcuts: Alt+1 main content, Alt+2 navigation, Alt+3 accessibility controls.
                </p>
              )}

              <div className="flex items-center justify-between mb-4">
                <label htmlFor="focus-visible" className="text-sm text-gray-700">
                  Enhanced Focus Indicators
                </label>
                <button
                  id="focus-visible"
                  role="switch"
                  aria-checked={settings.focusVisible}
                  onClick={() => updateSetting('focusVisible', !settings.focusVisible)}
                  className={`relative inline-flex w-11 h-6 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.focusVisible ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${
                      settings.focusVisible ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                  <span className="sr-only">
                    {settings.focusVisible ? 'Disable' : 'Enable'} enhanced focus indicators
                  </span>
                </button>
              </div>
            </fieldset>

            {/* Reset button */}
            <button
              onClick={() => onSettingsChange({
                darkMode: false,
                highContrast: false,
                reducedMotion: false,
                fontScale: 1.0,
                screenReaderOptimized: false,
                keyboardNavigation: false,
                focusVisible: false
              })}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Reset to Defaults
            </button>

            {/* Help text */}
            <div className="text-xs text-gray-500 border-t pt-4">
              <p>
                These settings help make ScoutD3 more accessible. Settings are saved locally 
                and will persist across sessions.
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </>
  );
};

export default AccessibilityControls;