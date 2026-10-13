"use client";

import { updateEstimateFields } from "@/lib/actions/estimates";
import { CustomerPickerEditor } from "./job-customer-editor";
import type { CustomerOption } from "./job-customer-editor";

interface EstimateCustomerEditorProps {
  estimateId: string;
  currentCustomer: CustomerOption | null;
  hasVehicle: boolean;
}

export function EstimateCustomerEditor({
  estimateId,
  currentCustomer,
  hasVehicle,
}: EstimateCustomerEditorProps) {
  return (
    <CustomerPickerEditor
      currentCustomer={currentCustomer}
      onConfirm={async (customer) => {
        const result = await updateEstimateFields(estimateId, {
          customer_id: customer.id,
          vehicle_id: null,
        });
        return "error" in result && result.error ? result.error : null;
      }}
      describeChange={(name) => (
        <>
          This estimate will be reassigned to <strong>{name}</strong>.
          {hasVehicle &&
            " The vehicle will be cleared, since vehicles belong to the previous customer."}
          {" Line items stay as they are."}
        </>
      )}
    />
  );
}
