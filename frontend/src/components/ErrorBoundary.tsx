import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/30 bg-red-950/20 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
            <svg
              className="h-8 w-8 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-red-200">Something went wrong</h2>
            <p className="mt-2 max-w-md text-sm text-red-300/70">
              {import.meta.env.DEV
                ? (this.state.error?.message || "An unexpected error occurred")
                : "Something went wrong. Please refresh the page or try again."}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="mt-2 rounded-xl border border-red-500/30 bg-red-500/20 px-6 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/30"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface AudioErrorBoundaryProps {
  children: ReactNode;
}

export function AudioErrorBoundary({ children }: AudioErrorBoundaryProps) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        if (import.meta.env.DEV) console.error("Audio error:", error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

interface SplitErrorBoundaryProps {
  children: ReactNode;
}

export function SplitErrorBoundary({ children }: SplitErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
            <svg
              className="h-8 w-8 text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-amber-200">Split failed</h2>
            <p className="mt-2 max-w-md text-sm text-amber-300/70">
              There was an issue processing your audio file. Please try again.
            </p>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
