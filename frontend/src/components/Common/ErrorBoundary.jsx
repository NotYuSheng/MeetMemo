import React from 'react';
import { Container, Alert } from '@govtechsg/sgds-react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // You could also log to an error reporting service here
    // Example: logErrorToService(error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Reload the page to start fresh
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <Container className="py-5">
          <Alert variant="danger" className="mb-4">
            <div className="d-flex align-items-start">
              <AlertTriangle className="me-3 flex-shrink-0" size={24} />
              <div className="flex-grow-1">
                <h4 className="alert-heading mb-3">Something went wrong</h4>
                <p className="mb-3">
                  The application encountered an unexpected error. This has been logged for
                  investigation.
                </p>

                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mb-3">
                    <summary className="mb-2" style={{ cursor: 'pointer' }}>
                      <strong>Error Details (Development Only)</strong>
                    </summary>
                    <pre className="bg-light p-3 rounded" style={{ fontSize: '0.875rem' }}>
                      <code>{this.state.error.toString()}</code>
                    </pre>
                    {this.state.errorInfo && (
                      <pre
                        className="bg-light p-3 rounded mt-2"
                        style={{ fontSize: '0.875rem', maxHeight: '300px', overflow: 'auto' }}
                      >
                        <code>{this.state.errorInfo.componentStack}</code>
                      </pre>
                    )}
                  </details>
                )}

                <div className="d-flex gap-2">
                  <button className="btn btn-primary" onClick={this.handleReset}>
                    Reload Application
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => (window.location.href = '/')}
                  >
                    Go to Home
                  </button>
                </div>
              </div>
            </div>
          </Alert>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
