import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  let mockRef: React.RefObject<HTMLTextAreaElement | null>;

  beforeEach(() => {
    mockRef = { current: null };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders textarea with correct props', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value="test value"
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('test value');
  });

  it('uses custom placeholder', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Enter your message"
        textareaRef={mockRef}
      />
    );

    expect(screen.getByPlaceholderText('Enter your message')).toBeInTheDocument();
  });

  it('uses default placeholder when none provided', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('calls onChange when user types', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'hello' } });

    expect(onChange).toHaveBeenCalledWith('hello');
  });

  it('calls onKeyDown when key is pressed', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value="test"
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onKeyDown).toHaveBeenCalled();
  });

  it('is disabled when disabled prop is true', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        disabled={true}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('does not auto-focus when autoFocus is false', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        autoFocus={false}
        textareaRef={mockRef}
      />
    );

    expect(document.activeElement).not.toBe(screen.getByRole('textbox'));
  });

  it('has correct accessibility attributes', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Type a message..."
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('placeholder', 'Type a message...');
  });

  it('has correct styling classes', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    const { container } = render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('w-full');
    expect(textarea).toHaveClass('resize-none');
    expect(textarea).toHaveClass('rounded-xl');
  });

  it('handles value updates', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    const { rerender } = render(
      <TextInput
        value="initial"
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('initial');

    rerender(
      <TextInput
        value="updated"
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    expect(textarea).toHaveValue('updated');
  });

  it('sets rows attribute to 1', () => {
    const onChange = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <TextInput
        value=""
        onChange={onChange}
        onKeyDown={onKeyDown}
        textareaRef={mockRef}
      />
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('rows', '1');
  });
});
