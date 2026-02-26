import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TitleView } from './TitleView';
import type { CodeBlockMeta } from './types';

describe('TitleView', () => {
  const mockMeta: CodeBlockMeta = {
    language: 'typescript',
    filename: 'utils.ts',
    displayName: 'Typescript',
    lineCount: 42,
    category: 'programming',
  };

  const mockOnSwitchToCode = vi.fn();

  it('renders filename', () => {
    render(<TitleView meta={mockMeta} onSwitchToCode={mockOnSwitchToCode} />);
    expect(screen.getByText('utils.ts')).toBeInTheDocument();
  });

  it('renders display name', () => {
    render(<TitleView meta={mockMeta} onSwitchToCode={mockOnSwitchToCode} />);
    expect(screen.getByText('Typescript')).toBeInTheDocument();
  });

  it('renders line count', () => {
    render(<TitleView meta={mockMeta} onSwitchToCode={mockOnSwitchToCode} />);
    expect(screen.getByText('42 lines')).toBeInTheDocument();
  });

  it('renders singular "line" for single line', () => {
    const singleLineMeta = { ...mockMeta, lineCount: 1 };
    render(<TitleView meta={singleLineMeta} onSwitchToCode={mockOnSwitchToCode} />);
    expect(screen.getByText('1 line')).toBeInTheDocument();
  });

  it('calls onSwitchToCode when clicked', () => {
    render(<TitleView meta={mockMeta} onSwitchToCode={mockOnSwitchToCode} />);
    const button = screen.getByRole('button', { name: /view code for/i });
    fireEvent.click(button);
    expect(mockOnSwitchToCode).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label', () => {
    render(<TitleView meta={mockMeta} onSwitchToCode={mockOnSwitchToCode} />);
    const button = screen.getByRole('button', { name: 'View code for utils.ts' });
    expect(button).toBeInTheDocument();
  });

  it('renders file icon', () => {
    const { container } = render(
      <TitleView meta={mockMeta} onSwitchToCode={mockOnSwitchToCode} />
    );
    // Check for SVG element (FileText icon)
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
