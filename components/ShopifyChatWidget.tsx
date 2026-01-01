// src/components/ShopifyChatWidget.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  createChatSession,
  getChatSession,
  saveChatMessage,
  getChatMessages,
  uploadChatAttachment,
  saveChatAttachment,
  getChatAttachments,
  ChatMessage,
} from '../services/shopifyChatService.ts';

type ChatAttachmentData = {
  id: string;
  file_name: string;
  storage_url: string;
  content_type: string;
  is_image: boolean;
};

const ShopifyChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [messageAttachments, setMessageAttachments] = useState<Record<string, ChatAttachmentData[]>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const storedSessionId = localStorage.getItem('shopify_chat_session_id');
    if (storedSessionId) {
      (async () => {
        const session = await getChatSession(storedSessionId);
        if (session) {
          setSessionId(storedSessionId);
          setIsStarted(true);
          loadMessages(storedSessionId);
        }
      })();
    }
  }, []);

  const loadMessages = async (sid: string) => {
    setLoading(true);
    try {
      const msgs = await getChatMessages(sid);
      setMessages(msgs);
      
      for (const msg of msgs) {
        if (msg.has_attachments && msg.id) {
          const atts = await getChatAttachments(msg.id);
          if (atts.length > 0) {
            setMessageAttachments(prev => ({ ...prev, [msg.id!]: atts }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const startChat = async () => {
    if (!customerName.trim() || !customerEmail.trim()) {
      alert('Please enter your name and email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      alert('Please enter a valid email');
      return;
    }

    try {
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      
      await createChatSession({
        session_id: newSessionId,
        customer_name: customerName,
        customer_email: customerEmail,
        order_number: orderNumber || undefined,
        is_logged_in: false,
        status: 'active',
      });

      localStorage.setItem('shopify_chat_session_id', newSessionId);
      setSessionId(newSessionId);
      setIsStarted(true);
    } catch (err) {
      console.error('Failed to start chat:', err);
      alert('Failed to start chat. Please try again.');
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() && attachments.length === 0) return;

    setSending(true);
    try {
      const messageId = await saveChatMessage({
        session_id: sessionId,
        message_text: messageText.trim() || undefined,
        is_from_customer: true,
        has_attachments: attachments.length > 0,
        is_read: false,
      });

      if (attachments.length > 0) {
        for (const file of attachments) {
          const url = await uploadChatAttachment(messageId, file);
          await saveChatAttachment({
            message_id: messageId,
            file_name: file.name,
            storage_path: `${messageId}/${file.name}`,
            storage_url: url,
            content_type: file.type,
            file_size: file.size,
            is_image: file.type.startsWith('image/'),
          });
        }
      }

      setMessageText('');
      setAttachments([]);
      await loadMessages(sessionId);
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (!isStarted || !sessionId) return;

    const interval = setInterval(() => {
      loadMessages(sessionId);
    }, 3000);

    return () => clearInterval(interval);
  }, [isStarted, sessionId]);

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-2xl hover:scale-110 transition-transform duration-200 flex items-center justify-center z-50"
          aria-label="Open chat"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border-2 border-gray-200">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">💬 Live Support</h3>
              <p className="text-xs opacity-90">We're here to help!</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 rounded-full p-2 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!isStarted ? (
            <div className="flex-1 p-6 flex flex-col justify-center">
              <div className="text-center mb-6">
                <div className="text-5xl mb-3">👋</div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">Welcome!</h4>
                <p className="text-sm text-gray-600">Please tell us about yourself to start chatting</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Order Number (Optional)</label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="#12345"
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition"
                  />
                </div>

                <button
                  onClick={startChat}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition shadow-lg"
                >
                  Start Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {loading && messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl mb-2">💬</div>
                      <p className="text-sm text-gray-500">Start the conversation!</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isCustomer = msg.is_from_customer;
                    const atts = messageAttachments[msg.id!] || [];
                    
                    return (
                      <div key={msg.id} className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isCustomer ? 'bg-indigo-600 text-white' : 'bg-white text-gray-800 border-2 border-gray-200'}`}>
                          {!isCustomer && (
                            <div className="text-xs font-bold mb-1 opacity-75">
                              {msg.agent_name || 'Support Agent'}
                            </div>
                          )}
                          {msg.message_text && (
                            <div className="text-sm whitespace-pre-wrap break-words">{msg.message_text}</div>
                          )}
                          {atts.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {atts.map((att) => (
                                <div key={att.id}>
                                  {att.is_image ? (
                                    <img
                                      src={att.storage_url}
                                      alt={att.file_name}
                                      className="max-w-full rounded-lg"
                                    />
                                  ) : (
                                    <a
                                      href={att.storage_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs underline"
                                    >
                                      📎 {att.file_name}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={`text-[10px] mt-1 ${isCustomer ? 'text-indigo-200' : 'text-gray-400'}`}>
                            {new Date(msg.created_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t-2 border-gray-200 bg-white rounded-b-2xl">
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="text-xs bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-1">
                        <span>📎 {file.name}</span>
                        <button
                          onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                          className="text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        setAttachments([...attachments, ...files]);
                      }}
                    />
                    <div className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center justify-center transition">
                      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </div>
                  </label>

                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message..."
                    disabled={sending}
                    className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none resize-none transition"
                    rows={1}
                  />

                  <button
                    onClick={sendMessage}
                    disabled={sending || (!messageText.trim() && attachments.length === 0)}
                    className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition"
                  >
                    {sending ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default ShopifyChatWidget;
