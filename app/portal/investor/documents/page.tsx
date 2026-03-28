'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, Search, FileText } from 'lucide-react';

type DocCategory = 'all' | 'mortgage' | 'statement' | 'tax' | 'legal';

interface Document {
  category: DocCategory;
  name: string;
  subtitle: string;
  date: string;
  size: string;
}

const categoryStyles: Record<string, string> = {
  mortgage: 'bg-navy/10 text-navy',
  statement: 'bg-blue-100 text-blue-700',
  tax: 'bg-green-100 text-green-700',
  legal: 'bg-gray-100 text-gray-600',
};

const categoryLabels: Record<string, string> = {
  mortgage: 'Mortgage',
  statement: 'Statement',
  tax: 'Tax',
  legal: 'Legal',
};

export default function DocumentsPage() {
  const [activeFilter, setActiveFilter] = useState<DocCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filters: { key: DocCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'mortgage', label: 'Mortgage Docs' },
    { key: 'statement', label: 'Statements' },
    { key: 'tax', label: 'Tax' },
    { key: 'legal', label: 'Legal' },
  ];

  const documents: Document[] = [
    { category: 'mortgage', name: 'Mortgage Commitment', subtitle: '142 Wellington St', date: 'Dec 15, 2025', size: '2.3 MB' },
    { category: 'mortgage', name: 'Independent Appraisal', subtitle: '142 Wellington St', date: 'Dec 10, 2025', size: '8.1 MB' },
    { category: 'mortgage', name: 'Title Insurance Certificate', subtitle: '142 Wellington St', date: 'Dec 15, 2025', size: '1.2 MB' },
    { category: 'mortgage', name: 'Mortgage Commitment', subtitle: '88 King St', date: 'Mar 1, 2026', size: '2.1 MB' },
    { category: 'mortgage', name: 'Independent Appraisal', subtitle: '88 King St', date: 'Feb 25, 2026', size: '7.8 MB' },
    { category: 'statement', name: 'Monthly Statement', subtitle: 'March 2026', date: 'Apr 1, 2026', size: '0.4 MB' },
    { category: 'statement', name: 'Monthly Statement', subtitle: 'February 2026', date: 'Mar 1, 2026', size: '0.4 MB' },
    { category: 'statement', name: 'Monthly Statement', subtitle: 'January 2026', date: 'Feb 1, 2026', size: '0.4 MB' },
    { category: 'statement', name: 'Annual Statement', subtitle: '2025', date: 'Feb 1, 2026', size: '1.1 MB' },
    { category: 'tax', name: 'T5 Slip', subtitle: '2025 Tax Year', date: 'Feb 28, 2026', size: '0.3 MB' },
    { category: 'legal', name: 'Investor Disclosure Statement', subtitle: '2026', date: 'Jan 5, 2026', size: '0.8 MB' },
    { category: 'legal', name: 'AML & KYC Declaration', subtitle: '', date: 'Jan 15, 2024', size: '0.5 MB' },
  ];

  const filteredDocuments = documents.filter((doc) => {
    const matchesFilter = activeFilter === 'all' || doc.category === activeFilter;
    const matchesSearch =
      searchQuery === '' ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.subtitle.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Document Centre</h1>
      <p className="font-body text-gray-500 text-sm mb-6">Access all your mortgage documents, statements, tax slips, and legal agreements</p>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-3 font-body text-sm text-navy placeholder:text-gray-400 focus:outline-none focus:border-lime"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {filters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => setActiveFilter(filter.key)}
            className={
              activeFilter === filter.key
                ? 'bg-lime text-navy font-semibold rounded-full px-4 py-1 text-sm'
                : 'bg-white border border-gray-200 text-gray-600 rounded-full px-4 py-1 text-sm cursor-pointer'
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Document List */}
      <div className="space-y-2">
        {filteredDocuments.map((doc, index) => (
          <div
            key={`${doc.name}-${doc.subtitle}-${index}`}
            className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:border-lime transition-colors"
          >
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${categoryStyles[doc.category]}`}>
              {categoryLabels[doc.category]}
            </span>
            <span className="text-lg">&#128196;</span>
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm text-navy font-medium">{doc.name}</p>
              {doc.subtitle && <p className="text-gray-400 text-xs font-body">{doc.subtitle}</p>}
            </div>
            <span className="text-gray-400 text-sm font-body whitespace-nowrap">{doc.date}</span>
            <span className="text-gray-400 text-sm font-body whitespace-nowrap">{doc.size}</span>
            <button
              onClick={() => alert('Download coming soon. Contact mfox@foxmortgage.ca')}
              className="border border-gray-200 text-navy rounded-lg px-3 py-1 text-sm hover:border-lime transition-colors inline-flex items-center gap-1 flex-shrink-0"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
