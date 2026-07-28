/**
 * Human-readable labels for the raw workflow-status strings the
 * backend stores in `sale_order.status`. One source of truth so the
 * orders list, order detail, DA page, and dashboard all render the
 * same wording (previously `DELIVERY_AGENT` was shown as-is on the
 * list but as "Out for Delivery" on the detail — jarring).
 *
 * If a status doesn't have a mapping, `formatWorkflowStatus` falls
 * back to a title-cased version of the raw string (so unmapped
 * future statuses still look reasonable).
 */
export const STEP_LABEL: Record<string, string> = {
  PROCESSING: 'Processing',
  DELIVERY_AGENT: 'Out for Delivery',
  DELIVERED: 'Delivered',
  DELIVERY_FAILED: 'Delivery Failed',
  ORDER_CANCELLED: 'Cancelled',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
  STORE_MANAGER: 'Assigned to Store Manager',
  REGIONAL_MANAGER: 'Assigned to Regional Manager',
  REGIONAL_HEAD: 'Assigned to Regional Head',
};

export function formatWorkflowStatus(raw: string | null | undefined): string {
  if (!raw) return '—';
  const upper = raw.trim().toUpperCase();
  if (STEP_LABEL[upper]) return STEP_LABEL[upper];
  // Fallback: SOMETHING_LIKE_THIS → "Something Like This"
  return upper
    .toLowerCase()
    .split('_')
    .map(w => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}
