import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Import global styles
import './styles/globals.css';

// Get root element
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Remove loading screen
const loadingScreen = document.getElementById('loading-screen');
if (loadingScreen) {
  loadingScreen.style.display = 'none';
}

// Render app
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Performance monitoring (optional)
if (import.meta.env.MODE === 'production') {
  // Add performance monitoring here if needed
}