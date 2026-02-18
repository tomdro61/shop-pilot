"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteCustomer } from "@/lib/actions/customers";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

export function CustomerDeleteButton({ customerId }: { customerId: string }) {
  const router = useRouter();

  async function handleDelete() {
    const result = await deleteCustomer(customerId);
    if (result.error) {
      toast.error(result.error);
      return result;
    }
    toast.success("Customer deleted");
    router.push("/customers");
    return result;
  }

  return (
    <DeleteConfirmDialog
      title="Delete Customer"
      description="Are you sure you want to delete this customer? This action cannot be undone. All associated vehicles will also be deleted."
      onConfirm={handleDelete}
    />
  );
}
