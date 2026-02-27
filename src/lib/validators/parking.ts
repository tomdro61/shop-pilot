import { z } from "zod";

// Schema for the external form submission (public API)
export const parkingSubmitSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(7, "Phone is required").max(20),
  drop_off_date: z.string().min(1, "Drop-off date is required"),
  drop_off_time: z.string().min(1, "Drop-off time is required"),
  pick_up_date: z.string().min(1, "Pick-up date is required"),
  pick_up_time: z.string().min(1, "Pick-up time is required"),
  make: z.string().min(1, "Vehicle make is required").max(50),
  model: z.string().min(1, "Vehicle model is required").max(50),
  license_plate: z.string().min(1, "License plate is required").max(15),
  lot: z.string().min(1, "Lot is required"),
  confirmation_number: z.string().min(1, "Confirmation number is required").max(100),
  services_interested: z
    .array(z.enum(["oil_change", "detailing", "brakes", "tire_replacement", "wipers"]))
    .optional()
    .default([]),
  liability_acknowledged: z.boolean().refine((val) => val === true, {
    message: "Liability must be acknowledged",
  }),
  // Honeypot — bots fill this in, humans don't see it
  website: z.string().optional().default(""),
});

export type ParkingSubmitData = z.infer<typeof parkingSubmitSchema>;

// Schema for staff operations (check in, check out, update notes, etc.)
export const parkingUpdateSchema = z.object({
  status: z.enum(["reserved", "checked_in", "checked_out", "no_show", "cancelled"]).optional(),
  spot_number: z.string().max(20).nullable().optional(),
  staff_notes: z.string().max(5000).nullable().optional(),
});

export type ParkingUpdateData = z.infer<typeof parkingUpdateSchema>;
