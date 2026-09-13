export type NavItem = {
  label: string;
  href: string;
};

// Section 11 of the product spec, minus Customer Detail and Customer
// Timeline (reached by drilling into a customer, not top-level nav items).
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview" },
  { label: "Customers", href: "/customers" },
  { label: "Churn intelligence", href: "/churn-intelligence" },
  { label: "Segments", href: "/segments" },
  { label: "Support intelligence", href: "/support-intelligence" },
  { label: "AI assistant", href: "/assistant" },
  { label: "Model insights", href: "/model-insights" },
  { label: "Analytics", href: "/analytics" },
  { label: "Audit logs", href: "/audit-logs" },
  { label: "Settings", href: "/settings" },
];
