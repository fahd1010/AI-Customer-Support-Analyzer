// src/pages/ChatWidget.tsx
import React from 'react';
import ShopifyChatWidget from '../components/ShopifyChatWidget.tsx';

const ChatWidget: React.FC = () => {
  return (
    <div className="min-h-screen bg-transparent">
      <ShopifyChatWidget />
    </div>
  );
};

export default ChatWidget;
