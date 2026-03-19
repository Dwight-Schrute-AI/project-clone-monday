/** @module ErrorBoundary — catches render errors and shows recovery UI with retry */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { logger } from "../../services/logger";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error("Uncaught render error", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <h1 className={styles.heading}>Something went wrong</h1>
          <p className={styles.message}>
            An unexpected error occurred. You can try again or refresh the page.
          </p>
          {this.state.error && (
            <details className={styles.details}>
              <summary className={styles.summary}>Error details</summary>
              <pre className={styles.stack}>{this.state.error.message}</pre>
            </details>
          )}
          <button className={styles.retryButton} onClick={this.handleRetry} type="button">
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
