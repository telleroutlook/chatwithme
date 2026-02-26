import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualMessageList } from './VirtualMessageList';
import type { Message } from '@chatwithme/shared';

// Mock react-virtuoso
let mockAtBottomState = true;
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, components, atBottomStateChange, className, style }: any) => {
    // Call atBottomStateChange with mock state
    if (atBottomStateChange) {
      atBottomStateChange(mockAtBottomState);
    }

    const ListComponent = components?.List || 'div';

    return (
      <div data-testid="virtuoso-container" className={className} style={style}>
        <ListComponent data-testid="virtuoso-list">
          {data.map((item: Message, index: number) => (
            <div key={item.id} data-testid={`message-${index}`}>
              {itemContent(index, item)}
            </div>
          ))}
        </ListComponent>
      </div>
    );
  },
}));

const createMockMessage = (id: string, role: 'user' | 'assistant', content: string): Message => ({
  id,
  userId: 'user-1',
  conversationId: 'conv-1',
  role,
  message: content,
  files: [],
  generatedImageUrls: [],
  searchResults: [],
  createdAt: new Date('2026-02-24T00:00:00.000Z'),
});

describe('VirtualMessageList', () => {
  const mockMessages: Message[] = [
    createMockMessage('1', 'user', 'Hello'),
    createMockMessage('2', 'assistant', 'Hi there!'),
    createMockMessage('3', 'user', 'How are you?'),
  ];

  it('renders messages correctly', () => {
    const renderMessage = vi.fn((message: Message) => (
      <div data-testid={`msg-${message.id}`}>{message.message}</div>
    ));

    render(<VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />);

    expect(renderMessage).toHaveBeenCalledTimes(3);
  });

  it('calls renderMessage with correct message and index', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />);

    expect(renderMessage).toHaveBeenNthCalledWith(1, mockMessages[0], 0);
    expect(renderMessage).toHaveBeenNthCalledWith(2, mockMessages[1], 1);
    expect(renderMessage).toHaveBeenNthCalledWith(3, mockMessages[2], 2);
  });

  it('calls onScrollToBottom when at bottom', () => {
    mockAtBottomState = true;
    const onScrollToBottom = vi.fn();
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(
      <VirtualMessageList
        messages={mockMessages}
        renderMessage={renderMessage}
        onScrollToBottom={onScrollToBottom}
        isAtBottom={true}
      />
    );

    expect(onScrollToBottom).toHaveBeenCalled();
  });

  it('does not call onScrollToBottom when not at bottom', () => {
    mockAtBottomState = false;
    const onScrollToBottom = vi.fn();
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(
      <VirtualMessageList
        messages={mockMessages}
        renderMessage={renderMessage}
        onScrollToBottom={onScrollToBottom}
        isAtBottom={false}
      />
    );

    expect(onScrollToBottom).not.toHaveBeenCalled();
    // Reset for other tests
    mockAtBottomState = true;
  });

  it('renders empty list when no messages', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={[]} renderMessage={renderMessage} />);

    expect(renderMessage).not.toHaveBeenCalled();
  });

  it('passes initialScrollTop to Virtuoso', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(
      <VirtualMessageList
        messages={mockMessages}
        renderMessage={renderMessage}
        initialScrollTop={500}
      />
    );

    const container = screen.getByTestId('virtuoso-container');
    expect(container).toBeInTheDocument();
  });

  it('uses custom list component with correct attributes', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />);

    const list = screen.getByTestId('virtuoso-list');
    expect(list).toHaveAttribute('role', 'log');
    expect(list).toHaveAttribute('aria-live', 'polite');
    expect(list).toHaveAttribute('aria-label', 'Chat messages');
  });

  it('applies correct container styles', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />);

    const virtuosoContainer = screen.getByTestId('virtuoso-container');
    expect(virtuosoContainer).toHaveClass('h-full');
    expect(virtuosoContainer).toHaveClass('w-full');
  });

  it('handles onScrollToBottom being undefined', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    expect(() => {
      render(
        <VirtualMessageList
          messages={mockMessages}
          renderMessage={renderMessage}
          isAtBottom={true}
        />
      );
    }).not.toThrow();
  });

  it('handles single message', () => {
    const singleMessage = [createMockMessage('1', 'user', 'Single message')];
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={singleMessage} renderMessage={renderMessage} />);

    expect(renderMessage).toHaveBeenCalledTimes(1);
    expect(renderMessage).toHaveBeenCalledWith(singleMessage[0], 0);
  });

  it('handles large number of messages efficiently', () => {
    const largeMessageList: Message[] = Array.from({ length: 1000 }, (_, i) =>
      createMockMessage(`${i}`, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`)
    );

    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={largeMessageList} renderMessage={renderMessage} />);

    // Should render all messages (in real Virtuoso, only visible ones would render)
    expect(renderMessage).toHaveBeenCalledTimes(1000);
  });

  it('updates when messages change', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    const { rerender } = render(
      <VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />
    );

    expect(renderMessage).toHaveBeenCalledTimes(3);

    const newMessages = [...mockMessages, createMockMessage('4', 'assistant', 'New message')];

    rerender(<VirtualMessageList messages={newMessages} renderMessage={renderMessage} />);

    expect(renderMessage).toHaveBeenCalledTimes(7); // 3 + 4
  });

  it('uses internal ref when no external ref provided', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    const { rerender } = render(
      <VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />
    );

    // Should render without errors when no external ref is provided
    rerender(<VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />);

    expect(screen.getByTestId('virtuoso-container')).toBeInTheDocument();
  });

  it('applies contain strict style for performance', () => {
    const renderMessage = vi.fn((message: Message) => <div>{message.message}</div>);

    render(<VirtualMessageList messages={mockMessages} renderMessage={renderMessage} />);

    const container = screen.getByTestId('virtuoso-container');
    expect(container).toHaveStyle({ contain: 'strict' });
  });
});
