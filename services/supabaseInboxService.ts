// src/services/supabaseInboxService.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bsodhudnndgmpjkclhhm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzb2RodWRubmRnbXBqa2NsaGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyNDc5MjYsImV4cCI6MjA4MjgyMzkyNn0.ocjKV-pnCkEfoL6ToTpnQiIDEyg9-MqIfVUQ_mKLbNk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type InboxMessage = {
  id?: string;
  thread_id: string;
  message_id: string;
  date_iso: string;
  date_ms: number;
  subject: string;
  from_raw: string;
  from_name: string;
  from_email: string;
  to_raw?: string;
  cc_raw?: string;
  bcc_raw?: string;
  is_from_me: boolean;
  body_text: string;
  has_attachments: boolean;
  customer_key?: string;
};

type InboxAttachment = {
  message_id: string;
  attachment_index: number;
  file_name: string;
  content_type: string;
  is_image: boolean;
  storage_path?: string;
  storage_url?: string;
  file_size?: number;
};

export async function saveInboxMessage(message: InboxMessage): Promise<void> {
  const { error } = await supabase
    .from('inbox_messages')
    .upsert({
      thread_id: message.thread_id,
      message_id: message.message_id,
      date_iso: message.date_iso,
      date_ms: message.date_ms,
      subject: message.subject,
      from_raw: message.from_raw,
      from_name: message.from_name,
      from_email: message.from_email,
      to_raw: message.to_raw,
      cc_raw: message.cc_raw,
      bcc_raw: message.bcc_raw,
      is_from_me: message.is_from_me,
      body_text: message.body_text,
      has_attachments: message.has_attachments,
      customer_key: message.customer_key,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'message_id' });

  if (error) {
    console.error('Failed to save inbox message:', error);
    throw error;
  }
}

export async function saveInboxAttachment(attachment: InboxAttachment): Promise<void> {
  const { error } = await supabase
    .from('inbox_attachments')
    .upsert({
      message_id: attachment.message_id,
      attachment_index: attachment.attachment_index,
      file_name: attachment.file_name,
      content_type: attachment.content_type,
      is_image: attachment.is_image,
      storage_path: attachment.storage_path,
      storage_url: attachment.storage_url,
      file_size: attachment.file_size,
    }, { onConflict: 'message_id,attachment_index' });

  if (error) {
    console.error('Failed to save attachment:', error);
    throw error;
  }
}

export async function uploadAttachmentToStorage(
  messageId: string,
  attachmentIndex: number,
  fileName: string,
  base64Data: string,
  contentType: string
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: contentType });
  
  const filePath = `${messageId}/${attachmentIndex}_${fileName}`;
  
  const { error: uploadError } = await supabase.storage
    .from('inbox-attachments')
    .upload(filePath, blob, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error('Failed to upload attachment:', uploadError);
    throw uploadError;
  }

  const { data } = supabase.storage
    .from('inbox-attachments')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

export async function getInboxMessages(limit = 100): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .order('date_ms', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch inbox messages:', error);
    return [];
  }

  return data || [];
}

export async function getThreadMessages(threadId: string): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('date_ms', { ascending: true });

  if (error) {
    console.error('Failed to fetch thread messages:', error);
    return [];
  }

  return data || [];
}

export async function getAttachmentsByMessageId(messageId: string): Promise<InboxAttachment[]> {
  const { data, error } = await supabase
    .from('inbox_attachments')
    .select('*')
    .eq('message_id', messageId)
    .order('attachment_index', { ascending: true });

  if (error) {
    console.error('Failed to fetch attachments:', error);
    return [];
  }

  return data || [];
}
// src/services/supabaseInboxService.ts - ADD THESE FUNCTIONS AT THE END

export async function updateThreadDetails(
  threadId: string,
  updates: {
    pipeline_stage?: string;
    priority?: string;
    phone_number?: string;
    order_number?: string;
    order_date?: string;
    order_status?: string;
    product_issue?: string;
    assigned_agent?: string;
    tags?: string[];
    custom_link?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('inbox_messages')
    .update({
      ...updates,
      tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('thread_id', threadId);

  if (error) {
    console.error('Failed to update thread details:', error);
    throw error;
  }
}

export async function getThreadDetails(threadId: string): Promise<any> {
  const { data, error } = await supabase
    .from('inbox_messages')
    .select('pipeline_stage, priority, phone_number, order_number, order_date, order_status, product_issue, assigned_agent, tags, custom_link')
    .eq('thread_id', threadId)
    .single();

  if (error) {
    console.error('Failed to get thread details:', error);
    return null;
  }

  return data;
}

export async function addThreadNote(
  threadId: string,
  agentName: string,
  noteText: string
): Promise<void> {
  const { error } = await supabase
    .from('inbox_internal_notes')
    .insert({
      thread_id: threadId,
      agent_name: agentName,
      note_text: noteText,
    });

  if (error) {
    console.error('Failed to add thread note:', error);
    throw error;
  }
}

export async function getThreadNotes(threadId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('inbox_internal_notes')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get thread notes:', error);
    return [];
  }

  return data || [];
}

export async function addThreadAction(
  threadId: string,
  actionType: string,
  actionNotes?: string
): Promise<void> {
  const { error } = await supabase
    .from('inbox_quick_actions')
    .insert({
      thread_id: threadId,
      action_type: actionType,
      action_notes: actionNotes,
      action_status: 'Pending',
    });

  if (error) {
    console.error('Failed to add thread action:', error);
    throw error;
  }
}

