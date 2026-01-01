// src/services/geminiService.ts - COMPLETE WITH FILTERING
import { GoogleGenAI, Type } from "@google/genai";
import {
  AGENT_STRENGTH_IDS,
  AGENT_WEAKNESS_IDS,
  AgentReplyAnalysis,
  AIAnalysis,
  NEGATIVE_TAG_IDS,
  PAIN_TAG_IDS,
  POSITIVE_TAG_IDS,
  ROOT_CAUSES,
  SEVERITIES,
  THEME_IDS,
  TICKET_STATUSES,
  PRODUCTS,
} from "../types.ts";

function parseChatTurns(chatConversation: string): { customer: string[]; agent: string[] } {
  const lines = chatConversation.split('\n').filter(l => l.trim());
  const customer: string[] = [];
  const agent: string[] = [];

  lines.forEach(line => {
    const lower = line.toLowerCase();
    if (lower.startsWith('customer:') || lower.startsWith('عميل:')) {
      customer.push(line.replace(/^(customer:|عميل:)/i, '').trim());
    } else if (lower.startsWith('agent:') || lower.startsWith('وكيل:') || lower.startsWith('موظف:')) {
      agent.push(line.replace(/^(agent:|وكيل:|موظف:)/i, '').trim());
    }
  });

  return { customer, agent };
}

export const analyzeCustomerMessage = async (
  chatConversation: string,
  context?: { productName?: string; productAmazonId?: string; orderId?: string }
): Promise<{
  customerText: AIAnalysis & { text: string };
  agentReplyText: string;
  detectedProduct: { id: string; name: string; amazonId: string } | null;
  chatMetadata: { customerTurns: number; agentTurns: number };
}> => {
  
  // ✅ FILTER: Ignore messages not related to products
  const lowerText = chatConversation.toLowerCase();
  const productKeywords = [
    "artemis", "ether", "oxylus", "pillow", "apolloair", "apollo air",
    "sleeping pad", "leak", "valve", "inflate", "deflate", "pump", "air",
    "mattress", "camping", "gear doctors", "deflation", "bubble", "noise",
    "comfort", "warranty", "replacement", "refund", "order"
  ];
  
  const hasProductMention = productKeywords.some(kw => lowerText.includes(kw));
  
  if (!hasProductMention) {
    return {
      customerText: {
        text: "",
        rootCausePrimary: "Uncategorized",
        rootCauseSecondary: "",
        sentiment: "Neutral",
        severity: "Normal",
        suggestedStatus: "Open",
        themeIds: [],
        summary: "",
        positives: [],
        negativePoints: [],
        painPoints: [],
        positiveTags: [],
        negativeTags: [],
        painPointTags: [],
        replacementRequested: false,
        troubleshootingApplied: false,
      },
      agentReplyText: "",
      detectedProduct: null,
      chatMetadata: { customerTurns: 0, agentTurns: 0 },
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const safeContext = {
    productName: context?.productName || "",
    productAmazonId: context?.productAmazonId || "",
    orderId: context?.orderId || "",
  };

  const productsList = PRODUCTS.map(p => `${p.name} (ID: ${p.id}, Amazon: ${p.amazonId})`).join(", ");

  const { customer, agent } = parseChatTurns(chatConversation);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Full chat conversation:\n"""${chatConversation}"""\n\nContext:\n${JSON.stringify(safeContext)}\n\nChat Structure: ${customer.length} customer messages, ${agent.length} agent replies`,
      config: {
        systemInstruction: `
You are an EXPERT customer support analyst with DEEP ATTENTION TO DETAIL.

CRITICAL MISSION: Analyze EVERY SINGLE DETAIL in this conversation.

${customer.length} customer messages
${agent.length} agent replies

AVAILABLE PRODUCTS:
${productsList}

🔍 COMPREHENSIVE ANALYSIS REQUIREMENTS:

CUSTOMER ANALYSIS (analyze ALL ${customer.length} messages):
✅ Extract EVERY problem mentioned (even small ones)
✅ Identify ALL emotions expressed (frustration, anger, satisfaction, etc.)
✅ Capture ALL product issues (leaks, valve problems, comfort issues, etc.)
✅ Note ALL customer expectations and requests
✅ Detect ANY troubleshooting attempts mentioned
✅ Identify ANY replacement requests (explicit or implicit)
✅ Extract ALL pain points (urgency, travel plans, sleep issues, etc.)
✅ Capture ALL positive feedback (if any)
✅ Note ANY order IDs, product names, or specific details mentioned
✅ Understand the FULL context and history of the issue

AGENT REPLIES ANALYSIS (combine ALL ${agent.length} replies):
✅ Combine ALL agent responses into one text
✅ Preserve ALL troubleshooting steps provided
✅ Keep ALL empathy statements
✅ Include ALL solutions offered
✅ Maintain ALL policy explanations
✅ Capture ALL next steps mentioned

PRODUCT DETECTION:
✅ Scan for product names: Artemis 3D, Ether, Oxylus, Pillow, ApolloAir
✅ Look for product keywords in Arabic/English
✅ Match to product IDs: artemis_3d, ether, oxylus, pillow, apollo_air

ROOT CAUSE IDENTIFICATION:
✅ Primary root cause (most important issue)
✅ Secondary root cause (if multiple issues exist)
✅ Consider ALL customer messages to determine root cause

SENTIMENT & SEVERITY:
✅ Overall sentiment across ALL messages (Positive/Neutral/Negative)
✅ Severity level (Normal/Urgent/Critical) based on:
  - Customer urgency
  - Impact on customer
  - Time sensitivity
  - Emotional intensity

THEMES & TAGS:
✅ Extract ALL relevant themes from THEME_IDS
✅ Tag ALL positives from POSITIVE_TAG_IDS
✅ Tag ALL negatives from NEGATIVE_TAG_IDS
✅ Tag ALL pain points from PAIN_TAG_IDS

COMPREHENSIVE SUMMARY:
✅ Write a detailed 1-2 sentence summary covering:
  - Main issue
  - Customer impact
  - Current status
  - Any urgency factors

⚠️ CRITICAL RULES:
- DO NOT skip any detail, no matter how small
- DO NOT summarize - capture EVERYTHING
- DO NOT miss any customer concern
- DO NOT ignore any emotion or pain point
- DO NOT overlook any product mention
- ANALYZE the FULL conversation context
- UNDERSTAND the complete customer journey
- PRESERVE all important information

Return STRICT JSON with FOUR parts:
1. customer_combined: COMPLETE analysis of ALL customer messages
2. agent_combined_text: ALL agent replies concatenated (preserve everything)
3. detected_product_id: product ID or null
4. conversation_turns: message counts
        `,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customer_combined: {
              type: Type.OBJECT,
              properties: {
                customer_text: { type: Type.STRING },
                rootCausePrimary: { type: Type.STRING, enum: Array.from(ROOT_CAUSES.map(r => r)) },
                rootCauseSecondary: { type: Type.STRING },
                sentiment: { type: Type.STRING, enum: ["Positive", "Neutral", "Negative"] },
                severity: { type: Type.STRING, enum: Array.from(SEVERITIES.map(s => s)) },
                suggestedStatus: { type: Type.STRING, enum: Array.from(TICKET_STATUSES) },
                themeIds: { type: Type.ARRAY, items: { type: Type.STRING, enum: Array.from(THEME_IDS) } },
                summary: { type: Type.STRING },
                positives: { type: Type.ARRAY, items: { type: Type.STRING } },
                negativePoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                positiveTags: { type: Type.ARRAY, items: { type: Type.STRING, enum: Array.from(POSITIVE_TAG_IDS) } },
                negativeTags: { type: Type.ARRAY, items: { type: Type.STRING, enum: Array.from(NEGATIVE_TAG_IDS) } },
                painPointTags: { type: Type.ARRAY, items: { type: Type.STRING, enum: Array.from(PAIN_TAG_IDS) } },
                replacementRequested: { type: Type.BOOLEAN },
                troubleshootingApplied: { type: Type.BOOLEAN },
              },
            },
            agent_combined_text: { type: Type.STRING },
            detected_product_id: { type: Type.STRING },
            conversation_turns: {
              type: Type.OBJECT,
              properties: {
                customer_messages: { type: Type.NUMBER },
                agent_replies: { type: Type.NUMBER },
              },
            },
          },
          required: ["customer_combined", "agent_combined_text"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    const cust = result.customer_combined || {};

    const detectedProductId = result.detected_product_id || null;
    const detectedProduct = detectedProductId ? PRODUCTS.find(p => p.id === detectedProductId) || null : null;

    return {
      customerText: {
        text: cust.customer_text || "",
        rootCausePrimary: cust.rootCausePrimary || "Uncategorized",
        rootCauseSecondary: cust.rootCauseSecondary || "",
        sentiment: cust.sentiment || "Neutral",
        severity: cust.severity || "Normal",
        suggestedStatus: cust.suggestedStatus || "Open",
        themeIds: Array.isArray(cust.themeIds) ? cust.themeIds : [],
        summary: cust.summary || "",
        positives: Array.isArray(cust.positives) ? cust.positives : [],
        negativePoints: Array.isArray(cust.negativePoints) ? cust.negativePoints : [],
        painPoints: Array.isArray(cust.painPoints) ? cust.painPoints : [],
        positiveTags: Array.isArray(cust.positiveTags) ? cust.positiveTags : [],
        negativeTags: Array.isArray(cust.negativeTags) ? cust.negativeTags : [],
        painPointTags: Array.isArray(cust.painPointTags) ? cust.painPointTags : [],
        replacementRequested: Boolean(cust.replacementRequested),
        troubleshootingApplied: Boolean(cust.troubleshootingApplied),
      },
      agentReplyText: result.agent_combined_text || "",
      detectedProduct,
      chatMetadata: {
        customerTurns: customer.length,
        agentTurns: agent.length,
      },
    };

  } catch (error) {
    console.error("Chat analysis error:", error);
    return {
      customerText: {
        text: "",
        rootCausePrimary: "Uncategorized",
        rootCauseSecondary: "",
        sentiment: "Neutral",
        severity: "Normal",
        suggestedStatus: "Open",
        themeIds: [],
        summary: "Chat analysis failed (API error).",
        positives: [],
        negativePoints: [],
        painPoints: [],
        positiveTags: [],
        negativeTags: [],
        painPointTags: [],
        replacementRequested: false,
        troubleshootingApplied: false,
      },
      agentReplyText: "",
      detectedProduct: null,
      chatMetadata: { customerTurns: 0, agentTurns: 0 },
    };
  }
};

export const analyzeAgentReply = async (
  replyText: string,
  context?: {
    customerText?: any;
    customerRootCausePrimary?: string;
    customerSentiment?: string;
    replacementRequested?: boolean;
    troubleshootingApplied?: boolean;
    totalReplies?: number;
  }
): Promise<AgentReplyAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const safeContext = {
    customerText: context?.customerText || "",
    customerRootCausePrimary: context?.customerRootCausePrimary || "",
    customerSentiment: context?.customerSentiment || "",
    replacementRequested: Boolean(context?.replacementRequested),
    troubleshootingApplied: Boolean(context?.troubleshootingApplied),
    totalReplies: context?.totalReplies || 1,
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Customer message:\n"""${safeContext.customerText}"""\n\nAgent replies (${safeContext.totalReplies} total):\n"""${replyText}"""\n\nContext:\n${JSON.stringify(safeContext)}`,
      config: {
        systemInstruction: `
You are a STRICT QA coach for customer support with EXTREME ATTENTION TO DETAIL.

CRITICAL: You are evaluating ${safeContext.totalReplies} agent replies in a MULTI-TURN conversation.

🔍 COMPREHENSIVE EVALUATION CHECKLIST:

EMPATHY & TONE (check EVERY reply):
✅ Did agent acknowledge customer frustration?
✅ Did agent apologize appropriately?
✅ Did agent show understanding?
✅ Was tone professional and caring?
✅ Did agent validate customer concerns?

PROBLEM UNDERSTANDING:
✅ Did agent understand the FULL issue?
✅ Did agent ask clarifying questions if needed?
✅ Did agent address ALL customer concerns?
✅ Did agent miss any important details?

SOLUTION QUALITY:
✅ Were troubleshooting steps clear and complete?
✅ Were steps numbered and easy to follow?
✅ Did agent provide ALL necessary information?
✅ Were solutions appropriate for the issue?
✅ Did agent offer alternatives if needed?

COMMUNICATION CLARITY:
✅ Was language clear and simple?
✅ Were technical terms explained?
✅ Was structure organized and logical?
✅ Were instructions step-by-step?
✅ Was response length appropriate?

NEXT STEPS & FOLLOW-UP:
✅ Did agent clearly state next steps?
✅ Did agent set expectations (timeline, process)?
✅ Did agent provide contact information?
✅ Did agent offer to follow up?
✅ Was customer left with clear action items?

POLICY & COMPLIANCE:
✅ Did agent follow company policies?
✅ Were warranty terms explained correctly?
✅ Were replacement/refund policies clear?
✅ Did agent avoid risky promises?
✅ Was information accurate?

PERSONALIZATION:
✅ Did agent use customer name?
✅ Did agent reference specific details from conversation?
✅ Did agent tailor response to customer situation?
✅ Did agent show genuine care?

CONVERSATION FLOW (for ${safeContext.totalReplies} replies):
✅ Was there consistency across replies?
✅ Did agent follow through on promises?
✅ Did agent build on previous responses?
✅ Was there good conversation progression?

MISSING ELEMENTS (identify what's missing):
❌ Missing empathy statements?
❌ Missing troubleshooting steps?
❌ Missing next actions?
❌ Missing required information requests?
❌ Missing follow-up commitment?

OVERALL QUALITY SCORE (1-10):
- 9-10: Exceptional (all elements present, perfect execution)
- 7-8: Good (most elements present, minor improvements needed)
- 5-6: Acceptable (key elements present, several improvements needed)
- 3-4: Needs Improvement (missing important elements)
- 1-2: Poor (major issues, significant training needed)

⚠️ EVALUATION RULES:
- Evaluate ALL ${safeContext.totalReplies} replies together
- Consider the COMPLETE conversation context
- Identify EVERY strength (tag from AGENT_STRENGTH_IDS)
- Identify EVERY weakness (tag from AGENT_WEAKNESS_IDS)
- Provide 3-7 SPECIFIC, ACTIONABLE focus areas
- Be HONEST and CONSTRUCTIVE in feedback
- Consider customer sentiment and issue severity

Return STRICT JSON only.
        `,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallQualityScore: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            strengthTags: { type: Type.ARRAY, items: { type: Type.STRING, enum: Array.from(AGENT_STRENGTH_IDS) } },
            weaknessTags: { type: Type.ARRAY, items: { type: Type.STRING, enum: Array.from(AGENT_WEAKNESS_IDS) } },
            focusAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["overallQualityScore", "summary", "strengthTags", "weaknessTags", "focusAreas"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      overallQualityScore: Number(result.overallQualityScore || 0),
      summary: result.summary || "",
      strengthTags: Array.isArray(result.strengthTags) ? result.strengthTags : [],
      weaknessTags: Array.isArray(result.weaknessTags) ? result.weaknessTags : [],
      focusAreas: Array.isArray(result.focusAreas) ? result.focusAreas : [],
    };
  } catch (error) {
    console.error("Agent reply analysis error:", error);
    return {
      overallQualityScore: 0,
      summary: "Agent reply analysis failed (API error).",
      strengthTags: [],
      weaknessTags: [],
      focusAreas: [],
    };
  }
};
