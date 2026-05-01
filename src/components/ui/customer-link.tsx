"use client";

import Link from "next/link";

interface CustomerLinkProps {
  customerId: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  /** Use when the parent element has an onClick navigation — prevents bubbling. */
  stopPropagation?: boolean;
}

/**
 * Wraps a customer-name display in a link to `/customers/{id}`.
 * Falls back to plain children when no id is available.
 * Use `stopPropagation` inside rows/cards that already handle onClick navigation.
 */
export function CustomerLink({
  customerId,
  children,
  className = "",
  stopPropagation,
}: CustomerLinkProps) {
  if (!customerId) return <>{children}</>;

  return (
    <Link
      href={`/customers/${customerId}`}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className={`hover:text-blue-600 dark:hover:text-blue-400 hover:underline underline-offset-2 ${className}`}
    >
      {children}
    </Link>
  );
}
