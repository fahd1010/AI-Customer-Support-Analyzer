// src/services/storageService.ts
import { SupportTicket, STORAGE_KEYS } from "../types.ts";

type RemoteMode = "supabase" | "none";

// ---- Hardcoded Supabase config (as requested) ----
const SUPABASE_URL = "https://vqxsvmjkhxfgtllvpqlq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxeHN2bWpraHhmZ3RsbHZwcWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5NDM3NDQsImV4cCI6MjA4MjUxOTc0NH0.6y2kZLpgLqzl_E2kdlvs-Ikvl8wzTpc7ZWphlpY4ROA";

const SUPABASE_TABLE = "support_intel_state";

function sbEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_TABLE);
}

export function remoteMode(): RemoteMode {
  return sbEnabled() ? "supabase" : "none";
}

// ---------------- Local ----------------
export function loadLocalTickets(): SupportTicket[] | null {
  const raw = localStorage.getItem(STORAGE_KEYS.TICKETS_V2);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SupportTicket[];
  } catch {
    return null;
  }
}

export function saveLocalTickets(tickets: SupportTicket[]) {
  localStorage.setItem(STORAGE_KEYS.TICKETS_V2, JSON.stringify(tickets));
}

// ---------------- Remote (Row-per-customer) ----------------
//
// Table schema expected:
// - customer_key text PRIMARY KEY
// - data jsonb (stores SupportTicket[] for this customer_key)
// - updated_at timestamptz default now()
//
type RemoteRow = { customer_key: string; data: any; updated_at?: string };

function headersBase() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

function groupByCustomer(tickets: SupportTicket[]) {
  const map = new Map<string, SupportTicket[]>();
  for (const t of tickets) {
    const key = t.customerKey || "unknown";
    const arr = map.get(key) || [];
    arr.push(t);
    map.set(key, arr);
  }

  // sort each customer's tickets by lastActivity desc (optional, but nice)
  for (const [k, arr] of map.entries()) {
    arr.sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
    map.set(k, arr);
  }

  return map;
}

async function fetchRemoteKeys(): Promise<string[]> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=customer_key`;
    const res = await fetch(url, { method: "GET", headers: headersBase() });
    if (!res.ok) {
      console.error(`Failed to fetch remote keys: ${res.status} ${res.statusText}`);
      return [];
    }
    const rows = (await res.json()) as Array<{ customer_key: string }>;
    return rows.map((r) => r.customer_key).filter(Boolean);
  } catch (err) {
    console.error("Error fetching remote keys:", err);
    return [];
  }
}

async function upsertCustomerRow(customerKey: string, customerTickets: SupportTicket[]): Promise<boolean> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`;

    const payload: RemoteRow = {
      customer_key: customerKey,
      data: customerTickets, // store array of SupportTicket for this customer
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...headersBase(),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Failed to upsert customer_key=${customerKey}: ${res.status} ${res.statusText}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Error upserting customer_key=${customerKey}:`, err);
    return false;
  }
}

async function deleteCustomerRow(customerKey: string): Promise<boolean> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?customer_key=eq.${encodeURIComponent(
      customerKey
    )}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: headersBase(),
    });

    if (!res.ok) {
      console.error(`Failed to delete customer_key=${customerKey}: ${res.status} ${res.statusText}`);
      return false;
    }

    console.log(`✅ Successfully deleted customer_key=${customerKey} from Supabase`);
    return true;
  } catch (err) {
    console.error(`Error deleting customer_key=${customerKey}:`, err);
    return false;
  }
}

export async function loadRemoteTickets(): Promise<SupportTicket[] | null> {
  if (!sbEnabled()) return null;

  try {
    const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=customer_key,data,updated_at`;
    const res = await fetch(url, { method: "GET", headers: headersBase() });
    if (!res.ok) return null;

    const rows = (await res.json()) as RemoteRow[];
    if (!Array.isArray(rows)) return null;

    const all: SupportTicket[] = [];
    for (const r of rows) {
      const data = r?.data;
      if (Array.isArray(data)) {
        // each row holds SupportTicket[] for one customer
        all.push(...(data as SupportTicket[]));
      }
    }

    // sort global tickets by lastActivity
    all.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    return all;
  } catch {
    return null;
  }
}

/**
 * Full sync:
 * - DELETE stale rows FIRST (rows in remote but not in local)
 * - UPSERT remaining customer rows
 */
export async function saveRemoteTickets(tickets: SupportTicket[]): Promise<boolean> {
  if (!sbEnabled()) {
    console.warn("⚠️ Supabase not enabled, skipping remote save");
    return false;
  }

  try {
    const grouped = groupByCustomer(tickets);
    const desiredKeys = new Set(Array.from(grouped.keys()));

    // 1) Fetch existing keys FIRST (قبل أي upsert)
    console.log("📡 Fetching existing customer keys from Supabase...");
    const existingKeys = await fetchRemoteKeys();
    console.log(`Found ${existingKeys.length} existing customer keys in Supabase`);
    
    // 2) Determine which keys should be deleted (موجودة في remote لكن مش في local)
    const staleKeys = existingKeys.filter((k) => !desiredKeys.has(k));

    // 3) DELETE stale rows FIRST (قبل الـ upsert)
    if (staleKeys.length > 0) {
      console.log(`🗑️ Deleting ${staleKeys.length} stale customer rows from Supabase...`);
      console.log("Stale keys to delete:", staleKeys);
      
      const delPromises = staleKeys.map((k) => deleteCustomerRow(k));
      const delResults = await Promise.all(delPromises);
      const deletedCount = delResults.filter(Boolean).length;
      
      console.log(`✅ Deleted ${deletedCount}/${staleKeys.length} stale rows`);
      
      if (deletedCount < staleKeys.length) {
        console.warn(`⚠️ Some deletions failed: ${staleKeys.length - deletedCount} rows not deleted`);
      }
    } else {
      console.log("✨ No stale rows to delete");
    }

    // 4) UPSERT remaining customers
    if (grouped.size > 0) {
      console.log(`💾 Upserting ${grouped.size} customer rows to Supabase...`);
      
      const upsertPromises = Array.from(grouped.entries()).map(([key, arr]) =>
        upsertCustomerRow(key, arr)
      );
      const upsertResults = await Promise.all(upsertPromises);
      const upsertedCount = upsertResults.filter(Boolean).length;
      
      console.log(`✅ Upserted ${upsertedCount}/${grouped.size} rows`);
      
      if (upsertedCount < grouped.size) {
        console.error(`❌ Some upserts failed: ${grouped.size - upsertedCount} rows not saved`);
        return false;
      }
      
      return true;
    }

    console.log("✨ No customer data to upsert (all tickets deleted)");
    return true;
  } catch (err) {
    console.error("❌ saveRemoteTickets failed:", err);
    return false;
  }
}

export async function loadTicketsSharedFirst(): Promise<{
  tickets: SupportTicket[];
  source: "remote" | "local" | "empty";
}> {
  const remote = await loadRemoteTickets();
  if (remote && Array.isArray(remote)) return { tickets: remote, source: "remote" };

  const local = loadLocalTickets();
  if (local && Array.isArray(local)) return { tickets: local, source: "local" };

  return { tickets: [], source: "empty" };
}

export async function saveTicketsSmart(tickets: SupportTicket[]): Promise<"remote" | "local"> {
  // Always save local as a safety cache
  saveLocalTickets(tickets);

  if (remoteMode() === "supabase") {
    const ok = await saveRemoteTickets(tickets);
    if (ok) return "remote";
  }
  return "local";
}