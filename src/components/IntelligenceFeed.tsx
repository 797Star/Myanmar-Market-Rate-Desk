import React, { useState } from 'react';
import { Newspaper, ShieldCheck, Search, Filter, ExternalLink, Bookmark, CheckCircle2 } from 'lucide-react';
import { IntelligenceReport } from '../types';

interface IntelligenceFeedProps {
  reports: IntelligenceReport[];
}

export const IntelligenceFeed: React.FC<IntelligenceFeedProps> = ({ reports }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filtered = reports.filter((item) => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.titleMm.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summaryMm.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.publisher.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-white flex items-center gap-2 mm-heading">
            <Newspaper className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>သုတေသန အစီရင်ခံစာများနှင့် စောင့်ကြည့်ထုတ်ပြန်ချက်များ</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 en-sub mt-0.5">
            Economic Intelligence · Government, World Bank, INGO Surveys & Verified Media Briefings
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            aria-label="သတင်း သို့မဟုတ် ကုန်စည် ရှာဖွေရန်"
            placeholder="သတင်း သို့မဟုတ် ကုန်စည် ရှာဖွေရန်..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 shadow-xs"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            selectedCategory === 'all'
              ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          အားလုံး ({reports.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('government')}
          className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            selectedCategory === 'government'
              ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          အစိုးရဌာနနှင့် ဗဟိုဘဏ် (Government / CBM)
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('worldbank_ngo')}
          className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            selectedCategory === 'worldbank_ngo'
              ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          World Bank & INGO အစီရင်ခံစာများ
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('roundtable')}
          className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            selectedCategory === 'roundtable'
              ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          လုပ်ငန်းရှင် သီးသန့်ဆွေးနွေးခန်းများ
        </button>
        <button
          type="button"
          onClick={() => setSelectedCategory('verified_media')}
          className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            selectedCategory === 'verified_media'
              ? 'bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
        >
          စိစစ်ပြီး စီးပွားရေးသတင်းစာမျက်နှာများ
        </button>
      </div>

      {/* Reports Feed */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm mm-text">
            ရှာဖွေမှုနှင့် ကိုက်ညီသော သုတေသန အစီရင်ခံစာ မတွေ့ရှိပါ။
          </div>
        ) : (
          filtered.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200"
            >
              {/* Top metadata line */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 mb-2">
                <span className="font-semibold text-slate-950 dark:text-slate-200">
                  {report.publisher}
                </span>
                {report.verifiedBadge && (
                  <span className="inline-flex items-center text-blue-700 dark:text-blue-400" title="Verified Publisher">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                )}
                <span>·</span>
                <span className="num-tabular">{report.publicationDate}</span>
                <span>·</span>
                <span className="text-xs font-medium mm-text">
                  {report.impactLevel === 'high' ? 'သက်ရောက်မှု အလွန်မြင့်မား' : 'ပုံမှန်သက်ရောက်မှု'}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-base font-bold text-slate-950 dark:text-white mm-heading">
                {report.titleMm}
              </h3>
              <div className="text-xs text-slate-500 dark:text-slate-400 en-sub mt-0.5">
                {report.titleEn}
              </div>

              {/* Summary */}
              <p className="text-[14px] text-slate-800 dark:text-slate-300 mt-3 mm-text">
                {report.summaryMm}
              </p>

              {/* Key Takeaways */}
              {report.keyTakeaways && report.keyTakeaways.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-xs font-semibold text-slate-950 dark:text-slate-200 mb-2 mm-text">
                    အဓိက သတိပြုစရာ အချက်များ (Key Takeaways):
                  </div>
                  <ul className="space-y-1.5">
                    {report.keyTakeaways.map((point, pIdx) => (
                      <li
                        key={pIdx}
                        className="flex items-start gap-2 text-[13px] text-slate-700 dark:text-slate-300 mm-text"
                      >
                        <CheckCircle2 className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-1" aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
