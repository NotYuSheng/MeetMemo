import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorAlert from './ErrorAlert';

describe('ErrorAlert', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<ErrorAlert error={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the error message with an alert role', () => {
    render(<ErrorAlert error="Something went wrong" onClose={() => {}} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ErrorAlert error="Boom" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
