export type Issue = {
  id: string;
  title: string;
  file: string;
  line: number;
  category: "Complexity" | "Duplication" | "Architecture" | "Security" | "Dependency" | "Maintainability";
  severity: "Critical" | "High" | "Medium" | "Low";
  score: number;
  detail: string;
  description?: string;
  impact?: string;
  recommendation?: string;
  estimatedEffort?: number;
  status?: string;
}

export const issues: Issue[] = [
  { id: "CC-142", title: "Cyclomatic complexity exceeds threshold", file: "src/services/checkout.ts", line: 84, category: "Complexity", severity: "High", score: 94, detail: "This function has 18 branching paths. Consider extracting payment validation and discount calculation." },
  { id: "CC-138", title: "Circular dependency detected", file: "src/hooks/useCart.ts", line: 12, category: "Architecture", severity: "High", score: 89, detail: "useCart imports from checkoutService, which reaches back into the cart store through a barrel export." },
  { id: "CC-131", title: "Repeated validation logic", file: "src/utils/validate.ts", line: 46, category: "Duplication", severity: "Medium", score: 76, detail: "Similar email and address validation is repeated across 4 modules." },
  { id: "CC-127", title: "Large component with mixed concerns", file: "src/components/OrderSummary.tsx", line: 28, category: "Complexity", severity: "Medium", score: 72, detail: "A 312-line UI component handles data fetching, formatting, and presentation." },
  { id: "CC-119", title: "Unsafe token comparison", file: "src/api/session.ts", line: 107, category: "Security", severity: "Medium", score: 68, detail: "Session token is compared with a non-constant-time string operation." },
  { id: "CC-112", title: "Unused dependency in module", file: "src/services/legacyAuth.ts", line: 3, category: "Architecture", severity: "Low", score: 42, detail: "This module imports a legacy adapter that is not referenced in the current code path." },
];

export const files = [
  { name: "checkout.ts", path: "src/services/checkout.ts", kind: "TS", lines: 248, complexity: 18, debt: "High" },
  { name: "useCart.ts", path: "src/hooks/useCart.ts", kind: "TS", lines: 126, complexity: 12, debt: "High" },
  { name: "validate.ts", path: "src/utils/validate.ts", kind: "TS", lines: 94, complexity: 9, debt: "Medium" },
  { name: "OrderSummary.tsx", path: "src/components/OrderSummary.tsx", kind: "TSX", lines: 312, complexity: 14, debt: "Medium" },
  { name: "session.ts", path: "src/api/session.ts", kind: "TS", lines: 168, complexity: 8, debt: "Medium" },
  { name: "legacyAuth.ts", path: "src/services/legacyAuth.ts", kind: "TS", lines: 76, complexity: 4, debt: "Low" },
];

export const codeSamples: Record<string, string> = {
  "src/services/checkout.ts": `import { cartStore } from "../stores/cart";
import { validateAddress } from "../utils/validate";
import { calculateTax } from "./tax";

export async function processCheckout(order, options) {
  const { items, address, payment } = order;
  let discount = 0;

  if (!items?.length) {
    throw new Error("Your cart is empty");
  }

  if (options?.promoCode) {
    const promotion = await fetchPromotion(options.promoCode);
    if (promotion && promotion.active && promotion.expiresAt > Date.now()) {
      if (promotion.minimumSpend <= order.total) {
        if (promotion.type === "percentage") {
          discount = order.total * (promotion.value / 100);
        } else if (promotion.type === "fixed") {
          discount = Math.min(promotion.value, order.total);
        }
      }
    }
  }

  if (!validateAddress(address)) {
    throw new Error("Please check your delivery address");
  }

  if (!payment?.method) {
    throw new Error("Choose a payment method");
  }

  const subtotal = items.reduce((sum, item) => {
    if (item.quantity > 0 && item.price >= 0) {
      return sum + item.price * item.quantity;
    }
    return sum;
  }, 0);

  const tax = calculateTax(subtotal - discount, address.region);
  const result = await paymentProvider.charge({
    method: payment.method,
    amount: subtotal - discount + tax,
  });

  if (result.success) {
    cartStore.clear();
    return { ...result, total: subtotal - discount + tax };
  }

  throw new Error(result.message || "Payment failed");
}`,
  "src/hooks/useCart.ts": `import { useEffect, useState } from "react";
import { checkoutService } from "../services/checkout";
import { cartStore } from "../stores/cart";

export function useCart() {
  const [items, setItems] = useState(cartStore.getItems());

  useEffect(() => {
    const unsubscribe = cartStore.subscribe(setItems);
    return unsubscribe;
  }, []);

  const checkout = async (options) => {
    return checkoutService.processCheckout(
      { items, total: cartStore.total() },
      options,
    );
  };

  return { items, checkout };
}`,
  "src/utils/validate.ts": `export function validateAddress(address) {
  if (!address) return false;
  return Boolean(address.street && address.city && address.postalCode);
}

export function validateEmail(email) {
  if (!email || typeof email !== "string") return false;
  return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim());
}

export function validatePostalCode(code, country) {
  if (!code || !country) return false;
  if (country === "US") return /^\\d{5}(-\\d{4})?$/.test(code);
  if (country === "CA") return /^[A-Z]\\d[A-Z] ?\\d[A-Z]\\d$/i.test(code);
  return code.length >= 3;
}`,
  "src/components/OrderSummary.tsx": `import { useMemo } from "react";
import { formatCurrency } from "../utils/currency";
import { useCart } from "../hooks/useCart";

export function OrderSummary({ onCheckout }) {
  const { items } = useCart();
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );
  const shipping = subtotal > 75 ? 0 : 6.95;
  const tax = subtotal * 0.0825;

  return (
    <section className="order-summary">
      <h2>Order summary</h2>
      {items.map((item) => (
        <div className="line-item" key={item.id}>
          <span>{item.name} × {item.quantity}</span>
          <span>{formatCurrency(item.price * item.quantity)}</span>
        </div>
      ))}
      <div className="totals">
        <div><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
        <div><span>Shipping</span><span>{shipping === 0 ? "Free" : formatCurrency(shipping)}</span></div>
        <div><span>Estimated tax</span><span>{formatCurrency(tax)}</span></div>
      </div>
      <button onClick={onCheckout}>Continue to payment</button>
      <p>Taxes are estimated and confirmed at checkout.</p>
    </section>
  );
}`,
  "src/api/session.ts": `import { apiClient } from "./client";

export async function createSession(credentials) {
  return apiClient.post("/sessions", credentials);
}

export async function getSession(token) {
  const response = await apiClient.get("/sessions/current", {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  return response.data;
}

export async function isSessionValid(token) {
  if (!token) return false;
  const session = await getSession(token);
  return session.expiresAt > Date.now();
}`,
  "src/services/legacyAuth.ts": `import { legacyAdapter } from "../adapters/legacy";

export function getLegacyProfile(id) {
  return legacyAdapter.fetchProfile(id);
}

export function normalizeLegacyRole(role) {
  const roles = { admin: "owner", user: "member" };
  return roles[role] ?? "member";
}`,
};

export const nodes = [
  { id: "Checkout", x: 49, y: 43, color: "lime", size: 18, detail: "12 imports · 8 dependents" },
  { id: "Cart store", x: 28, y: 27, color: "blue", size: 13, detail: "5 imports · 3 dependents" },
  { id: "useCart", x: 24, y: 57, color: "purple", size: 12, detail: "3 imports · 7 dependents" },
  { id: "Validation", x: 70, y: 26, color: "orange", size: 12, detail: "8 imports · 11 dependents" },
  { id: "Tax service", x: 76, y: 57, color: "blue", size: 10, detail: "4 imports · 2 dependents" },
  { id: "Order UI", x: 39, y: 76, color: "purple", size: 11, detail: "6 imports · 0 dependents" },
  { id: "Payment API", x: 83, y: 77, color: "orange", size: 12, detail: "3 imports · 5 dependents" },
  { id: "Formatter", x: 14, y: 40, color: "blue", size: 9, detail: "2 imports · 4 dependents" },
];

export const rootCauses = [
  {
    id: "checkout-responsibility",
    title: "Checkout module has excessive responsibility",
    summary: "Payment, promotion, address validation, and cart lifecycle are coordinated in one service.",
    evidence: ["12 imports", "38% complexity contribution", "3 duplicated blocks", "8 downstream consumers"],
    issueIds: ["CC-142", "CC-131", "CC-138"],
    files: ["src/services/checkout.ts", "src/hooks/useCart.ts", "src/utils/validate.ts"],
    debtHours: 18,
    severity: "High",
  },
  {
    id: "presentation-data-coupling",
    title: "Order presentation owns data concerns",
    summary: "The order summary component combines fetching, calculations, and rendering.",
    evidence: ["312 lines in one component", "6 direct imports", "3 responsibilities"],
    issueIds: ["CC-127"],
    files: ["src/components/OrderSummary.tsx"],
    debtHours: 7,
    severity: "Medium",
  },
  {
    id: "legacy-auth-path",
    title: "Legacy auth path remains reachable",
    summary: "A legacy adapter and session handling path have not been consolidated.",
    evidence: ["Unused adapter import", "Non-constant-time token comparison", "2 auth entry points"],
    issueIds: ["CC-119", "CC-112"],
    files: ["src/api/session.ts", "src/services/legacyAuth.ts"],
    debtHours: 5,
    severity: "Medium",
  },
];

export const timeline = [
  { id: "sprint-1", label: "Sprint 1", date: "Aug 04", event: "Baseline analysis", debt: 78, architecture: 59, quality: 67, risk: 62 },
  { id: "sprint-2", label: "Sprint 2", date: "Aug 11", event: "Checkout rewrite", debt: 86, architecture: 72, quality: 63, risk: 70 },
  { id: "sprint-3", label: "Sprint 3", date: "Aug 18", event: "Validation shared", debt: 79, architecture: 69, quality: 68, risk: 68 },
  { id: "sprint-4", label: "Sprint 4", date: "Aug 25", event: "Test coverage push", debt: 73, architecture: 67, quality: 74, risk: 65 },
  { id: "current", label: "Current", date: "Today", event: "Latest sample scan", debt: 68, architecture: 74, quality: 71, risk: 74 },
];

export const dnaDimensions = [
  { label: "Complexity", value: 78, color: "#e4a354" },
  { label: "Coupling", value: 64, color: "#a58af1" },
  { label: "Duplication", value: 42, color: "#69adf0" },
  { label: "Test health", value: 71, color: "#a3e635" },
  { label: "Architecture", value: 74, color: "#a58af1" },
  { label: "Security", value: 82, color: "#e27570" },
  { label: "Change frequency", value: 58, color: "#53c4c5" },
  { label: "Dependency stability", value: 67, color: "#7eb4d9" },
];

export const refactorDiff = {
  before: `export async function processCheckout(order, options) {
  if (!order.items?.length) throw new Error("Your cart is empty");
  if (options?.promoCode) {
    const promotion = await fetchPromotion(options.promoCode);
    if (promotion && promotion.active && promotion.expiresAt > Date.now()) {
      if (promotion.minimumSpend <= order.total) {
        if (promotion.type === "percentage") {
          discount = order.total * (promotion.value / 100);
        } else if (promotion.type === "fixed") {
          discount = Math.min(promotion.value, order.total);
        }
      }
    }
  }
  if (!validateAddress(order.address)) throw new Error("Invalid address");
  // payment, tax and cart cleanup also live here
}`,
  after: `import { validateCheckout } from "../validators/checkout";
import { calculateOrderTotal } from "./pricing";

export async function processCheckout(order, options) {
  const validation = validateCheckout(order);
  if (!validation.ok) throw new CheckoutError(validation.reason);

  const total = await calculateOrderTotal(order, options);
  const result = await paymentProvider.charge({
    method: order.payment.method,
    amount: total,
  });

  if (!result.success) throw new PaymentError(result.message);
  return finalizeOrder(result, total);
}`,
};
