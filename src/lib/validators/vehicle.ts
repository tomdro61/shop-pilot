import { z } from "zod";

const currentYear = new Date().getFullYear();

export const vehicleSchema = z.object({
  customer_id: z.string().uuid(),
  year: z.number().min(1900).max(currentYear + 2).nullable().optional(),
  make: z.string().max(100),
  model: z.string().max(100),
  vin: z.string().max(17),
  mileage: z.number().min(0).nullable().optional(),
  color: z.string().max(50),
  notes: z.string().max(2000),
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

export function prepareVehicleData(data: VehicleFormData) {
  return {
    customer_id: data.customer_id,
    year: data.year || null,
    make: data.make || null,
    model: data.model || null,
    vin: data.vin || null,
    mileage: data.mileage || null,
    color: data.color || null,
    notes: data.notes || null,
  };
}
