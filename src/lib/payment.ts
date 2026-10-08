/**
 * Payment-method label mapping. One place so every page (orders list,
 * order detail, dashboard recent orders, customer detail, my-deliveries)
 * agrees on what "PAY_AFTER_DELIVERY" and "RAZORPAY" render as.
 *
 * Mirrors the legacy Thymeleaf mapping (admin/orders.html,
 * deliveryAgentOrders.html, orderWorkFlow.html) — those templates
 * used "Paid" / "COD" everywhere. The React admin uses "Online" for
 * the paid case so ops can distinguish "how" from "whether" at a
 * glance; the underlying paymentStatus column ("CAPTURED" / "PAID" /
 * "COLLECTED" etc.) still carries the truth of settlement.
 *
 * Unknown methods fall through to the raw string — matches the
 * Thymeleaf "else: th:text=${paymentMethod}" branch. Blank / null
 * renders as an em-dash so tables don't gap out.
 */
export function formatPaymentMethod(raw: string | null | undefined): string {
  if (!raw) return '—';
  const upper = raw.trim().toUpperCase();
  if (upper === 'PAY_AFTER_DELIVERY') return 'COD';
  if (upper === 'RAZORPAY' || upper === 'CASHFREE') return 'Online';
  return raw;
}
