// ===== FILE: src/utils/promptpayParser.ts =====

type EmvMap = Record<string, string>;

export function parseEmvTlvs(payload: string): EmvMap {
  const result: EmvMap = {};
  let i = 0;

  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    const valueStart = i + 4;
    const valueEnd = valueStart + len;

    if (valueEnd > payload.length || Number.isNaN(len)) break;

    result[id] = payload.slice(valueStart, valueEnd);
    i = valueEnd;
  }

  return result;
}

export function parseNestedEmvTlvs(value: string): EmvMap {
  return parseEmvTlvs(value);
}

export type PromptPayType = "mobile" | "national_id" | "tax_id" | "ewallet" | "unknown";

export interface PromptPayInfo {
  type: PromptPayType;
  id: string | null;
  rawPayload: string;
  scheme: string;
  payeeName?: string;
}

export function extractPromptPayInfo(payload: string): PromptPayInfo {
  const top = parseEmvTlvs(payload);

  const pp = top["29"];
  if (!pp) {
    return { 
      type: "unknown", 
      id: null, 
      rawPayload: payload,
      scheme: "UNKNOWN"
    };
  }

  const nested = parseNestedEmvTlvs(pp);

  const aid = nested["00"];
  if (!aid || !aid.startsWith("A00000067701")) {
    return { 
      type: "unknown", 
      id: null, 
      rawPayload: payload,
      scheme: "UNKNOWN"
    };
  }

  // ✅ Extract payee name from tag 59
  const payeeName = top["59"] || "";

  // ✅ Detect type based on subtag
  if (nested["01"]) {
    return { 
      type: "mobile", 
      id: nested["01"], 
      rawPayload: payload,
      scheme: "PROMPTPAY",
      payeeName
    };
  }
  if (nested["02"]) {
    return { 
      type: "national_id", 
      id: nested["02"], 
      rawPayload: payload,
      scheme: "PROMPTPAY",
      payeeName
    };
  }
  if (nested["03"]) {
    return { 
      type: "tax_id", 
      id: nested["03"], 
      rawPayload: payload,
      scheme: "PROMPTPAY",
      payeeName
    };
  }
  if (nested["04"]) {
    return { 
      type: "ewallet", 
      id: nested["04"], 
      rawPayload: payload,
      scheme: "PROMPTPAY",
      payeeName
    };
  }

  return { 
    type: "unknown", 
    id: null, 
    rawPayload: payload,
    scheme: "PROMPTPAY",
    payeeName
  };
}

// Additional helper functions
export function getAccountTypeFromPromptPayType(type: PromptPayType): string {
  switch (type) {
    case 'tax_id':
      return 'Business';
    case 'mobile':
    case 'national_id':
      return 'Personal';
    default:
      return 'Unknown';
  }
}

export default extractPromptPayInfo;