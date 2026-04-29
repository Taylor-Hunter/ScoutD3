import React from 'react';

interface FooterProps {}

const Footer: React.FC<FooterProps> = () => {
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <p className="text-sm text-gray-500">
            © 2026 ScoutD3. NCAA Division III Multi-Sport Opponent Scouting Report Generation System.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;