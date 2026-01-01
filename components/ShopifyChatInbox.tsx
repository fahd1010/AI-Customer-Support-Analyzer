// src/components/ShopifyChatInbox.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  getAllChatSessions,
  getChatMessages,
  saveChatMessage,
  getChatAttachments,
  uploadChatAttachment,
  saveChatAttachment,
  markMessagesAsRead,
  ChatSession,
  ChatMessage,
} from '../services/shopifyChatService.ts';

type ToastType = 'success' | 'error' | 'info' | 'warning';

type ChatAttachmentData = {
  id: string;
  file_name: string;
  storage_url: string;
  content_type: string;
  is_image: boolean;
};

const ShopifyChatInbox: React.FC<{ showToast: (type: ToastType, message: string) => void }> = ({ showToast }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messageAttachments, setMessageAttachments] = useState<Record<string, ChatAttachmentData[]>>({});

  const loadSessions = useCallback(async () => {
    try {
      const data = await getAllChatSessions(100);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      showToast('error', 'Failed to load chat sessions');
    }
  }, [showToast]);

  const loadMessages = useCallback(async (sessionId: string) => {
    setLoading(true);
    try {
      const msgs = await getChatMessages(sessionId);
      setMessages(msgs);

      for (const msg of msgs) {
        if (msg.has_attachments && msg.id) {
          const atts = await getChatAttachments(msg.id);
          if (atts.length > 0) {
            setMessageAttachments((prev) => ({ ...prev, [msg.id!]: atts }));
          }
        }
      }

      await markMessagesAsRead(sessionId);
    } catch (err) {
      console.error('Failed to load messages:', err);
      showToast('error', 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSession) return;
    loadMessages(selectedSession.session_id);
    const interval = setInterval(() => loadMessages(selectedSession.session_id), 3000);
    return () => clearInterval(interval);
  }, [selectedSession, loadMessages]);

  const sendMessage = async () => {
    if (!selectedSession || (!messageText.trim() && attachments.length === 0)) return;

    setSending(true);
    try {
      const messageId = await saveChatMessage({
        session_id: selectedSession.session_id,
        message_text: messageText.trim() || undefined,
        is_from_customer: false,
        agent_name: 'Support Agent',
        has_attachments: attachments.length > 0,
        is_read: true,
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
      await loadMessages(selectedSession.session_id);
      showToast('success', 'Message sent!');
    } catch (err) {
      console.error('Failed to send message:', err);
      showToast('error', 'Failed to send message');
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

  const unreadCount = (session: ChatSession) => {
    return messages.filter((m) => m.session_id === session.session_id && m.is_from_customer && !m.is_read).length;
  };

  return (
    <div className="w-full h-full font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-white">
              <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
                🛒 Shopify Chats
              </div>
              <div className="text-xs text-gray-500 font-medium">{sessions.length} conversations</div>
            </div>
            <div className="max-h-[72vh] overflow-auto">
              {sessions.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <div className="text-sm text-gray-500 font-medium">No chats yet</div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sessions.map((session) => {
                    const isSelected = selectedSession?.session_id === session.session_id;
                    return (
                      <div
                        key={session.session_id}
                        className={`p-4 hover:bg-purple-50 cursor-pointer transition-all ${
                          isSelected ? 'bg-purple-50 border-l-4 border-purple-600' : ''
                        }`}
                        onClick={() => setSelectedSession(session)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-gray-900 truncate flex items-center gap-2">
                              👤 {session.customer_name}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                                SHOPIFY
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 truncate">{session.customer_email}</div>
                            {session.order_number && (
                              <div className="text-xs text-gray-600 mt-1">Order: {session.order_number}</div>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 whitespace-nowrap">
                            {new Date(session.last_message_at!).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              session.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : session.status === 'closed'
                                ? 'bg-gray-100 text-gray-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {session.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-white">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold text-gray-900 truncate">
                  {selectedSession ? '💬 Conversation' : '📧 Select a chat'}
                </div>
                {selectedSession && (
                  <div className="text-xs text-gray-500 break-words mt-1">
                    <span className="font-semibold text-gray-700">{selectedSession.customer_name}</span>
                    {' • '}
                    <span className="text-gray-600">{selectedSession.customer_email}</span>
                    {selectedSession.order_number && (
                      <>
                        {' • '}
                        <span className="text-gray-700 font-medium">Order: {selectedSession.order_number}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="max-h-[56vh] overflow-auto p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
              {!selectedSession ? (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <div className="text-center">
                    <div className="text-6xl mb-4">👈</div>
                    <div className="text-sm text-gray-500 font-medium">Select a chat from the list</div>
                  </div>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <div className="text-center">
                    <div className="text-6xl mb-4">📭</div>
                    <div className="text-sm text-gray-500 font-medium">No messages yet</div>
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isAgent = !msg.is_from_customer;
                  const atts = messageAttachments[msg.id!] || [];

                  return (
                    <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[92%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-md border-2 transition-all hover:shadow-lg ${
                          isAgent
                            ? 'bg-gradient-to-br from-purple-600 to-purple-700 text-white border-purple-600'
                            : 'bg-white text-gray-900 border-gray-200'
                        }`}
                      >
                        <div className="text-[11px] opacity-90 mb-2 flex items-center justify-between gap-2 font-semibold">
                          <span className="truncate">
                            {isAgent ? `🧑‍💼 ${msg.agent_name || 'You'}` : `👤 ${selectedSession.customer_name}`}
                          </span>
                          <span className="whitespace-nowrap">{new Date(msg.created_at!).toLocaleString()}</span>
                        </div>
                        {msg.message_text && (
                          <div
                            className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${
                              isAgent ? 'text-white' : 'text-gray-800'
                            }`}
                          >
                            {msg.message_text}
                          </div>
                        )}
                        {atts.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {atts.map((att) => (
                              <div key={att.id}>
                                {att.is_image ? (
                                  <img
                                    src={att.storage_url}
                                    alt={att.file_name}
                                    className="max-h-64 w-auto rounded-xl border-2 border-gray-200 shadow-sm"
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
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t-2 border-gray-200 p-4 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex flex-col gap-3">
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-purple-50 px-3 py-2 rounded-xl border border-purple-200 flex items-center gap-2"
                      >
                        <span>📎 {file.name}</span>
                        <button
                          onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                          className="text-red-600 hover:text-red-800 font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      disabled={!selectedSession || sending}
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        setAttachments([...attachments, ...files]);
                      }}
                    />
                    <div className="text-sm px-3 py-2 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 font-semibold text-purple-700 transition">
                      📎 Attach
                    </div>
                  </label>

                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!selectedSession || sending}
                    placeholder={selectedSession ? '✍️ Type your reply...' : 'Select a chat first'}
                    className="flex-1 min-h-[90px] rounded-2xl border-2 border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 resize-none break-words font-medium transition"
                  />

                  <button
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 text-white text-sm font-bold hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
                    disabled={!selectedSession || sending || (!messageText.trim() && attachments.length === 0)}
                    onClick={sendMessage}
                  >
                    {sending ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Sending...
                      </span>
                    ) : (
                      '📤 Send'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopifyChatInbox;
