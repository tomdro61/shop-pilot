import { AlertTriangle, CreditCard } from "lucide-react";
import { SectionTitle } from "@/components/ui/section-title";
import { getPaymentMethod } from "@/lib/actions/payment-methods";
import { brandLabel } from "@/lib/utils/card-brand";
import { AddCardButton, RemoveCardButton } from "./payment-method-actions";

export async function PaymentMethodsSection({ customerId }: { customerId: string }) {
  const result = await getPaymentMethod(customerId);
  const card = result.ok ? result.data : null;
  const loadError = result.ok ? null : result.error;

  return (
    <section className="pt-2">
      <SectionTitle
        title="Payment Methods"
        sub={loadError ? "Couldn't load card" : card ? "1 card on file" : "No card on file"}
        action={
          loadError ? null : (
            <AddCardButton
              customerId={customerId}
              buttonLabel={card ? "Replace Card" : "Add Card"}
            />
          )
        }
      />

      {loadError ? (
        <div className="bg-card border border-amber-200 dark:border-amber-900 rounded-md shadow-card px-4 py-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-none" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Couldn&apos;t check card on file</p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300/80">
              {loadError}. Refresh to try again — don&apos;t add a new card before resolving, or you may end up with two cards on this customer.
            </p>
          </div>
        </div>
      ) : card ? (
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
          <article className="flex items-center gap-4 px-4 py-3.5">
            <div className="w-9 h-9 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-stone-900 dark:text-stone-50">
                {brandLabel(card.brand)} ending in {card.last4}
              </div>
              <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                Expires {String(card.exp_month).padStart(2, "0")}/{String(card.exp_year).slice(-2)}
              </div>
            </div>
            <RemoveCardButton customerId={customerId} />
          </article>
        </div>
      ) : (
        <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card py-10 text-center">
          <p className="text-sm text-stone-500 dark:text-stone-400">No card on file</p>
          <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
            Save a card to charge it directly when a job is complete
          </p>
        </div>
      )}
    </section>
  );
}
