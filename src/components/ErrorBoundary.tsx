import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F9F8F6] dark:bg-[#111211] text-[#1C1C1C] dark:text-[#F3F2EE] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#191A19] border border-[#1C1C1C]/20 dark:border-stone-800 rounded-sm p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[#b91c1c] dark:text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="text-base font-bold">Application Error</h1>
            </div>
            <p className="text-xs text-[#1C1C1C]/75 dark:text-stone-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#1C1C1C] hover:bg-[#004225] text-white dark:bg-emerald-700 dark:hover:bg-emerald-600 rounded-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reload Dashboard</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
