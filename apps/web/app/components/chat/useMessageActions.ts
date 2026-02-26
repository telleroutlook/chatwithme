import { useState } from 'react';

type MenuState = {
  messageId: string;
  content: string;
  position: { x: number; y: number };
};

export function useMessageActions() {
  const [activeMenu, setActiveMenu] = useState<MenuState | null>(null);

  const showMenu = (messageId: string, content: string, position: { x: number; y: number }) => {
    setActiveMenu({ messageId, content, position });
  };

  const hideMenu = () => {
    setActiveMenu(null);
  };

  return {
    activeMenu,
    showMenu,
    hideMenu,
  };
}
