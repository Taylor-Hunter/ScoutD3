import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

const Help: React.FC = () => {
  const [contactOpen, setContactOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);

  const handleContactSubmit = () => {
    if (contactName && contactMessage) {
      setContactSent(true);
      setContactName('');
      setContactMessage('');
      setTimeout(() => setContactSent(false), 5000);
    }
  };

  const faqItems = [
    {
      question: 'How do I generate a scouting report?',
      answer: 'ScoutD3 starts a one-time automatic NCAA data load when the app is first accessed. Once team data is available, navigate to the Teams page, select your team and the opponent you want to scout, then click "Generate Scouting Report".'
    },
    {
      question: 'What data sources does ScoutD3 use?',
      answer: 'ScoutD3 aggregates data from official NCAA statistics, team websites, game recaps, and publicly available athletics information. All data is sourced ethically and in compliance with NCAA guidelines.'
    },
    {
      question: 'How accurate are the analytics and predictions?',
      answer: 'Our analytics are based on statistical models trained on historical D3 performance data. While predictions are highly informed, actual game outcomes depend on many factors that cannot be fully predicted by statistics alone.'
    },
    {
      question: 'Can I customize report templates?',
      answer: 'Yes, you can customize report formats in the Settings page. Choose from detailed, summary, or custom formats to match your coaching preferences and team needs.'
    },
    {
      question: 'How often is team data updated?',
      answer: 'ScoutD3 performs one automatic load on first access when no dataset exists. After that, updates are manual: use the Data Ingestion page whenever you want refreshed stats.'
    }
  ];

  const helpSections = [
    {
      title: 'Getting Started',
      icon: AcademicCapIcon,
      items: [
        { label: 'Check initial load or manual refresh status', link: '/data' },
        { label: 'Browse teams and start scouting', link: '/teams' },
        { label: 'View team analytics', link: '/analytics' },
        { label: 'Go to the dashboard', link: '/dashboard' },
        { label: 'Configure your preferences', link: '/settings' },
      ]
    },
    {
      title: 'Advanced Features',
      icon: DocumentTextIcon,
      items: [
        { label: 'Advanced analytics filters', link: '/analytics' },
        { label: 'View scouting reports', link: '/reports' },
        { label: 'Data import and ingestion', link: '/data' },
        { label: 'Team comparison tool', link: '/analytics' },
      ]
    },
    {
      title: 'Quick Links',
      icon: QuestionMarkCircleIcon,
      items: [
        { label: 'Home page', link: '/' },
        { label: 'All teams', link: '/teams' },
        { label: 'All reports', link: '/reports' },
        { label: 'Settings', link: '/settings' },
      ]
    }
  ];

  return (
    <>
      <Helmet>
        <title>Help & Support - ScoutD3</title>
        <meta name="description" content="Get help and support for using the ScoutD3 NCAA Division III scouting system." />
      </Helmet>

      <div className="py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Help & Support</h1>
            <p className="mt-4 text-lg text-gray-600">
              Everything you need to get the most out of ScoutD3
            </p>
          </div>

          {/* Quick actions */}
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/data" className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-indigo-400 hover:shadow-md transition">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Initial Load and Refresh</p>
                <p className="text-sm text-gray-500 truncate">Monitor first-access load and run manual NCAA refreshes</p>
              </div>
            </Link>

            <button
              onClick={() => { setContactOpen(true); }}
              className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-indigo-400 hover:shadow-md transition text-left w-full"
            >
              <div className="flex-shrink-0">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Contact Support</p>
                <p className="text-sm text-gray-500 truncate">Get help from our team</p>
              </div>
            </button>

            <Link to="/data" className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-indigo-400 hover:shadow-md transition">
              <div className="flex-shrink-0">
                <AcademicCapIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Data Ingestion</p>
                <p className="text-sm text-gray-500 truncate">Monitor load progress or trigger manual NCAA refreshes</p>
              </div>
            </Link>
          </div>

          {/* FAQ Section */}
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="max-w-3xl mx-auto space-y-6">
              {faqItems.map((item, index) => (
                <div key={index} className="bg-white shadow rounded-lg">
                  <details className="group">
                    <summary className="flex items-center justify-between px-6 py-4 cursor-pointer">
                      <h3 className="text-lg font-medium text-gray-900 group-open:text-indigo-600">
                        {item.question}
                      </h3>
                      <div className="ml-6 flex-shrink-0">
                        <svg className="h-5 w-5 text-gray-400 group-open:text-indigo-600 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </summary>
                    <div className="px-6 pb-4">
                      <p className="text-gray-700 leading-relaxed">
                        {item.answer}
                      </p>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>

          {/* Help sections */}
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
              Documentation
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {helpSections.map((section, index) => (
                <div key={index} className="bg-white shadow rounded-lg p-6">
                  <div className="flex items-center mb-4">
                    <section.icon className="h-6 w-6 text-indigo-600 mr-3" />
                    <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                  </div>
                  <ul className="space-y-3">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex}>
                        <Link
                          to={item.link}
                          className="text-sm text-indigo-600 hover:text-indigo-500 hover:underline"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Contact section */}
          <div className="mt-16 bg-gray-50 rounded-lg p-8 text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Still need help?
            </h2>
            <p className="text-gray-600 mb-6">
              Our support team is here to help you succeed with ScoutD3.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => setContactOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Contact Support
              </button>
              <button
                onClick={() => setContactOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Schedule Demo
              </button>
            </div>

            {/* Contact Form Modal */}
            {contactOpen && (
              <div className="mt-8 max-w-md mx-auto bg-white rounded-lg shadow-lg p-6 text-left">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Send us a message</h3>
                {contactSent ? (
                  <div className="text-center py-4">
                    <div className="text-green-600 font-medium text-lg mb-2">Message sent!</div>
                    <p className="text-sm text-gray-500">We'll get back to you within 24 hours.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                      <textarea
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        rows={4}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="How can we help?"
                      />
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={handleContactSubmit}
                        className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                      >
                        Send Message
                      </button>
                      <button
                        onClick={() => setContactOpen(false)}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Help;