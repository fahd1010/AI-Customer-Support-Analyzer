// src/types.ts - UNIFIED WITH NEW STANDARDS ONLY

// ========== Storage Keys ==========
export const STORAGE_KEYS = {
  ISSUES_V1: "support_ai_issues_v1",
  TICKETS_V2: "support_ai_tickets_v2",
  WEBHOOK_SECRET: "support_ai_webhook_secret",
  WEBHOOK_BASE_URL: "support_ai_webhook_base_url",
  AUTH: "support_intel_auth",
  SETTINGS: "support_intel_settings",
} as const;

// ========== Status / Severity ==========
export type TicketStatus =
  | "Open"
  | "Troubleshooting"
  | "Waiting Customer"
  | "Resolved"
  | "Replacement in progress"
  | "Closed"
  | "Reopened";

export const TICKET_STATUSES: TicketStatus[] = [
  "Open",
  "Troubleshooting",
  "Waiting Customer",
  "Resolved",
  "Replacement in progress",
  "Closed",
  "Reopened",
];

export type Severity = "Normal" | "Urgent" | "Critical";
export const SEVERITIES: Severity[] = ["Normal", "Urgent", "Critical"];

export type Sentiment = "Positive" | "Neutral" | "Negative";
export type Channel = "Manual" | "Email" | "Chat" | "Amazon" | "WhatsApp" | "Gmail";

// ========== Products Catalog ==========
export const PRODUCTS = [
  { id: "artemis_3d", name: "Artemis 3D", amazonId: "ASIN_ARTEMIS_3D", aliases: ["artemis", "artemis 3d"] },
  { id: "ether", name: "Ether", amazonId: "ASIN_ETHER", aliases: ["ether"] },
  { id: "oxylus", name: "Oxylus", amazonId: "ASIN_OXYLUS", aliases: ["oxylus"] },
  { id: "pillow", name: "Pillow", amazonId: "ASIN_PILLOW", aliases: ["pillow", "camping pillow"] },
  { id: "apollo_air", name: "ApolloAir", amazonId: "ASIN_APOLLO_AIR", aliases: ["apolloair", "apollo air", "apollo air 5.2"] },
] as const;

export type ProductDef = (typeof PRODUCTS)[number];

export function getProductById(id: string) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

// ========== Root Causes ==========
export const ROOT_CAUSES = [
  "Leak / Deflates Overnight",
  "Valve Leak",
  "Internal Weld Leak",
  "Doesn't Hold Air All Night",
  "Valve Problem",
  "Valve Flap Sealed (Shipping Compression)",
  "Inflation Difficulty",
  "Slow Inflate/Deflate",
  "Comfort",
  "Bubble / Air Pocket",
  "Noise",
  "Shipping Delay",
  "Missing Item",
  "Accessory Missing",
  "Damaged on Arrival",
  "Warranty/Registration",
  "Returns/Refund",
  "Uncategorized",
] as const;

// ========== Customer Feedback Standards ==========
export const STANDARD_POSITIVES = [
  "Excellent Comfort & Support",
  "Holds Air All Night",
  "Easy & Fast Inflation / Deflation",
  "Lightweight & Packable",
  "Durable Materials",
  "Quiet / Low Noise",
  "High Stability / Non-Slip",
  "Good Insulation (Warm)",
  "Comfortable Thickness / True to Size",
  "Great Value for Money",
  "Easy Rolling / Good Stuff Sack",
  "Professional Design & Finish",
  "Useful Accessories",
  "Excellent Customer Service / Warranty",
  "Versatile Use (Camping / Hiking / Travel)",
] as const;

export const STANDARD_NEGATIVES = [
  "Air Leaks / Punctures",
  "Valve Issues",
  "Difficult Inflation / Deflation",
  "Uncomfortable / Poor Support",
  "Size / Thickness Mismatch",
  "Slipping / Poor Grip",
  "Noise During Movement",
  "Poor Insulation (Cold)",
  "Material / Durability Issues",
  "Heavy / Bulky When Packed",
  "Hard to Roll / Stuff Sack Issues",
  "Odor / Chemical Smell",
  "Price / Value Concerns",
  "After-Sales / Warranty Issues",
  "Missing or Unhelpful Accessories",
] as const;

export const CUSTOMER_PAIN_POINTS = [
  "Ruined sleep / discomfort overnight",
  "Side-sleeper incompatibility",
  "Portability expectations not met (pack size/shape)",
  "Frustration with inflation setup (seal sensitivity)",
  "Comfort vs. expectation gap (ground feel)",
] as const;

// ========== Agent Reply Evaluation Standards ==========
export const AGENT_POSITIVE_THEMES = [
  "Warm & Empathetic Tone",
  "Acknowledgment of Customer Experience",
  "Clear Resolution or Action Plan",
  "Reinforcing Brand Identity",
  "Clarity and Simplicity",
  "Personalization",
  "Product Knowledge Displayed",
  "Appreciation and Gratitude",
  "Proactive Assistance",
  "Positive Reinforcement",
] as const;

export const AGENT_NEGATIVE_THEMES = [
  "Cold or Robotic Tone",
  "Lack of Empathy",
  "Missing Action Plan",
  "Over-Explaining / Too Technical",
  "Defensive Language",
  "Generic Response",
  "No Brand Personality",
  "Ignoring Key Feedback",
  "Punctuation / Grammar Issues",
  "No Ending Warmth / Close-off",
] as const;

// ========== AI Analysis Interfaces ==========
export interface AIAnalysis {
  text: string;
  rootCausePrimary: (typeof ROOT_CAUSES)[number];
  rootCauseSecondary: string;
  sentiment: Sentiment;
  severity: Severity;
  suggestedStatus: TicketStatus;
  summary: string;
  positives: string[];
  negativePoints: string[];
  painPoints: string[];
  replacementRequested: boolean;
  troubleshootingApplied: boolean;
}

export interface AgentReplyAnalysis {
  overallQualityScore: number;
  summary: string;
  positiveThemes: string[];
  negativeThemes: string[];
  focusAreas: string[];
}

// ========== Message / Ticket Models ==========
export interface TicketMessage {
  id: string;
  customerKey: string;
  channel: Channel;
  customerText: string;
  agentReplyText?: string;
  orderId?: string;
  productId?: string;
  productName?: string;
  productAmazonId?: string;
  createdAt: string;
  customerAnalysis: AIAnalysis;
  agentAnalysis?: AgentReplyAnalysis;
  external?: Record<string, any>;
}

export interface SupportTicket {
  id: string;
  customerKey: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  lastActivityAt: string;
  status: TicketStatus;
  severity: Severity;
  rootCausePrimary: (typeof ROOT_CAUSES)[number];
  rootCauseSecondary: string;
  replacementRequested: boolean;
  troubleshootingApplied: boolean;
  messages: TicketMessage[];
}

export interface TicketMessageInput {
  customerName: string;
  customerEmail: string;
  customerFallbackId?: string;
  channel: Channel;
  customerText: string;
  agentReplyText?: string;
  orderId?: string;
  productId?: string;
  productName?: string;
  productAmazonId?: string;
  customerAnalysis: AIAnalysis;
  agentAnalysis?: AgentReplyAnalysis;
  external?: Record<string, any>;
}

// ========== Helper Functions ==========
export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

export function buildCustomerKey(emailNorm: string, fallbackId?: string): string {
  if (emailNorm) return `email:${emailNorm}`;
  if (fallbackId && String(fallbackId).trim()) return `fallback:${String(fallbackId).trim()}`;
  return `anon:${crypto.randomUUID()}`;
}

export function migrateLegacyIssuesToTickets(legacy: any[]): SupportTicket[] {
  const byEmail: Record<string, SupportTicket> = {};
  const sorted = [...legacy].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const item of sorted) {
    const emailNorm = normalizeEmail(item.customerEmail);
    const key = buildCustomerKey(emailNorm);

    if (!byEmail[key]) {
      byEmail[key] = {
        id: crypto.randomUUID(),
        customerKey: key,
        customerName: item.customerName || "",
        customerEmail: emailNorm,
        createdAt: item.createdAt,
        lastActivityAt: item.createdAt,
        status: item.status === "Solved" ? "Resolved" : "Open",
        severity: "Normal",
        rootCausePrimary: "Uncategorized",
        rootCauseSecondary: "",
        replacementRequested: false,
        troubleshootingApplied: false,
        messages: [],
      };
    }

    byEmail[key].messages.push({
      id: crypto.randomUUID(),
      customerKey: key,
      channel: "Manual",
      customerText: item.problemText || "",
      agentReplyText: "",
      createdAt: item.createdAt,
      customerAnalysis: {
        text: item.problemText || "",
        rootCausePrimary: "Uncategorized",
        rootCauseSecondary: "",
        sentiment: item.sentiment || "Neutral",
        severity: "Normal",
        suggestedStatus: item.status === "Solved" ? "Resolved" : "Open",
        summary: item.summary || "",
        positives: item.positives || [],
        negativePoints: [],
        painPoints: [],
        replacementRequested: false,
        troubleshootingApplied: false,
      },
    });

    byEmail[key].lastActivityAt = item.createdAt;
  }

  return Object.values(byEmail).map((t) => ({
    ...t,
    messages: t.messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }));
}
// ========== Tag Helpers (for UI compatibility) ==========
export const TAGS = {
  themeName: (id: string) => id,
  positiveName: (id: string) => id,
  negativeName: (id: string) => id,
  painName: (id: string) => id,
  agentStrengthName: (id: string) => id,
  agentWeaknessName: (id: string) => id,
};
// ========== Backward Compatibility Exports ==========
export const THEME_IDS = [] as const;
export const AGENT_STRENGTH_IDS = AGENT_POSITIVE_THEMES;
export const AGENT_WEAKNESS_IDS = AGENT_NEGATIVE_THEMES;
export const POSITIVE_TAG_IDS = STANDARD_POSITIVES;
export const NEGATIVE_TAG_IDS = STANDARD_NEGATIVES;
export const PAIN_TAG_IDS = CUSTOMER_PAIN_POINTS;
