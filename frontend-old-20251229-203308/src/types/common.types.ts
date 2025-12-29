/**
 * Common type definitions used throughout the application
 */

/**
 * Theme mode
 */
export type Theme = 'light' | 'dark';

/**
 * Loading state
 */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Generic callback function type
 */
export type Callback<T = void> = (arg: T) => void;

/**
 * Async callback function type
 */
export type AsyncCallback<T = void, R = void> = (arg: T) => Promise<R>;

/**
 * Generic event handler type
 */
export type EventHandler<T = React.SyntheticEvent> = (event: T) => void;
