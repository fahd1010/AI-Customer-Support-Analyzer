// src/services/shopifyChatService.ts
import { supabase } from './supabaseInboxService.ts';

export type ChatSession = {
  id?: string;
  session_id: string;
  customer_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  order_number?: string;
  is_logged_in: boolean;
  shopify_store_url?: string;
  last_message_at?: string;
  status: 'active' | 'closed' | 'archived';
  created_at?: string;
};

export type ChatMessage = {
  id?: string;
  session_id: string;
  message_text?: string;
  is_from_customer: boolean;
  agent_name?: string;
  has_attachments: boolean;
  is_read: boolean;
  created_at?: string;
};

export type ChatAttachment = {
  id?: string;
  message_id: string;
  file_name: string;
  storage_path: string;
  storage_url: string;
  content_type: string;
  file_size?: number;
  is_image: boolean;
};

export async function createChatSession(session: ChatSession): Promise<string> {
  const { data, error } = await supabase
    .from('shopify_chat_sessions')
    .insert({
      session_id: session.session_id,
      customer_id: session.customer_id,
      customer_name: session.customer_name,
      customer_email: session.customer_email,
      customer_phone: session.customer_phone,
      order_number: session.order_number,
      is_logged_in: session.is_logged_in,
      shopify_store_url: session.shopify_store_url,
      status: session.status || 'active',
    })
    .select('session_id')
    .single();

  if (error) {
    console.error('Failed to create chat session:', error);
    throw error;
  }

  return data.session_id;
}

export async function getChatSession(sessionId: string): Promise<ChatSession | null> {
  const { data, error } = await supabase
    .from('shopify_chat_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (error) {
    console.error('Failed to get chat session:', error);
    return null;
  }

  return data;
}

export async function getAllChatSessions(limit = 100): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('shopify_chat_sessions')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get chat sessions:', error);
    return [];
  }

  return data || [];
}

export async function saveChatMessage(message: ChatMessage): Promise<string> {
  const { data, error } = await supabase
    .from('shopify_chat_messages')
    .insert({
      session_id: message.session_id,
      message_text: message.message_text,
      is_from_customer: message.is_from_customer,
      agent_name: message.agent_name,
      has_attachments: message.has_attachments,
      is_read: message.is_read,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save chat message:', error);
    throw error;
  }

  return data.id;
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('shopify_chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to get chat messages:', error);
    return [];
  }

  return data || [];
}

export async function uploadChatAttachment(
  messageId: string,
  file: File
): Promise<string> {
  const fileName = `${Date.now()}_${file.name}`;
  const filePath = `${messageId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('shopify-chat-attachments')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error('Failed to upload chat attachment:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('shopify-chat-attachments')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function saveChatAttachment(attachment: ChatAttachment): Promise<void> {
  const { error } = await supabase
    .from('shopify_chat_attachments')
    .insert({
      message_id: attachment.message_id,
      file_name: attachment.file_name,
      storage_path: attachment.storage_path,
      storage_url: attachment.storage_url,
      content_type: attachment.content_type,
      file_size: attachment.file_size,
      is_image: attachment.is_image,
    });

  if (error) {
    console.error('Failed to save chat attachment:', error);
    throw error;
  }
}

export async function getChatAttachments(messageId: string): Promise<ChatAttachment[]> {
  const { data, error } = await supabase
    .from('shopify_chat_attachments')
    .select('*')
    .eq('message_id', messageId);

  if (error) {
    console.error('Failed to get chat attachments:', error);
    return [];
  }

  return data || [];
}

export async function markMessagesAsRead(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('shopify_chat_messages')
    .update({ is_read: true })
    .eq('session_id', sessionId)
    .eq('is_from_customer', true);

  if (error) {
    console.error('Failed to mark messages as read:', error);
  }
}

export async function updateChatSessionStatus(
  sessionId: string,
  status: 'active' | 'closed' | 'archived'
): Promise<void> {
  const { error } = await supabase
    .from('shopify_chat_sessions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId);

  if (error) {
    console.error('Failed to update chat session status:', error);
    throw error;
  }
}
