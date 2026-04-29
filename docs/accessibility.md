# ScoutD3 Accessibility Guide

This guide reflects the accessibility features currently implemented in the frontend.

## Current Accessibility Features

ScoutD3 currently includes a user-facing accessibility settings panel with working controls for:

- dark mode
- high contrast mode
- reduced motion
- larger text scaling
- screen-reader optimization
- enhanced keyboard navigation
- enhanced focus indicators

These settings are stored locally and applied on load.

## Current Implementation Notes

### Settings Persistence

Accessibility settings are persisted in browser local storage. The settings hook also handles older saved data defensively so newly added options do not break the UI.

### Document-Level Styling

The frontend applies classes and data attributes to the document root so accessibility preferences affect the whole application, including page-specific styling such as the homepage hero area.

### Keyboard Interaction

The accessibility controls panel supports:

- keyboard opening and closing
- Escape to close
- focus management and restoration
- visible focus indicators for keyboard users

### Screen Reader Support

The current app includes a live region for announcements so key state changes can be surfaced to assistive technology.

## Visual Accessibility

### Dark Mode

Dark mode affects both the general application shell and homepage-specific content. Recent styling updates were made so the home hero section no longer stays visually light when dark mode is enabled.

### High Contrast

High contrast mode has been strengthened so the visual difference is more meaningful, especially for text and focus states.

### Reduced Motion

Reduced motion minimizes motion-heavy UI behavior for users who prefer less animation.

### Larger Text

Font scaling is supported through the accessibility settings panel and is applied dynamically.

## Development Expectations

If you change layout, theming, or shared components, re-check:

- keyboard-only navigation
- focus visibility
- dark mode coverage
- high contrast readability
- persistence across reloads
- live announcements for important state changes

## Goal

The goal of the current accessibility work is not only to store user preferences, but to ensure those settings have meaningful effects on real interaction and readability across the app.