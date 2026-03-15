import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateParkingCustomer } from "@/lib/parking-customer";
import { createOrUpdateQuoContact } from "@/lib/quo/contacts";
import { toE164 } from "@/lib/quo/format";
import { sendSMS } from "@/lib/quo/client";
import { getPhoneNumber } from "@/lib/quo/routing";
import { quoteRequestAckSMS, quoteRequestInternalSMS } from "@/lib/messaging/templates";
import { revalidatePath } from "next/cache";

const ALLOWED_ORIGINS = [
  "https://www.broadwaymotorsrevere.com",
  "https://broadwaymotorsrevere.com",
  "https://www.broadwaymotorsma.com",
  "https://broadwaymotorsma.com",
  "http://localhost:3000",
  "http://localhost:3001",
];

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  try {
    // 1. Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      console.error("[Quote Request] Invalid JSON body");
      return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400, headers });
    }

    // 2. Honeypot spam check
    if (body.website || body["bot-field"]) {
      console.log("[Quote Request] Honeypot triggered, ignoring");
      return NextResponse.json({ success: true }, { status: 200, headers });
    }

    console.log("[Quote Request] Received:", JSON.stringify(body));

    // 3. Extract fields
    const data = body as Record<string, unknown>;

    const getString = (keys: string[]): string => {
      for (const key of keys) {
        const val = data[key];
        if (typeof val === "string" && val.trim()) return val.trim();
      }
      return "";
    };

    const firstName = getString(["first_name", "firstName", "First Name", "first name"]);
    const lastName = getString(["last_name", "lastName", "Last Name", "last name"]);
    const email = getString(["email", "Email", "e-mail"]).toLowerCase();
    const phone = getString(["phone", "Phone", "phone_number", "phoneNumber", "Phone Number"]);
    const vehicleMake = getString(["vehicle_make", "vehicleMake", "Vehicle Make", "make", "Make"]);
    const vehicleModel = getString(["vehicle_model", "vehicleModel", "Vehicle Model", "model", "Model"]);
    const vehicleYearRaw = getString(["vehicle_year", "vehicleYear", "Vehicle Year", "year", "Year"]);
    const message = getString(["message", "Message", "comments", "Comments", "notes", "Notes"]);

    // Parse services — array, comma-separated string, or JSON string
    const servicesRaw = data["services"] ?? data["services_interested"] ?? data["servicesInterested"]
      ?? data["Services Interested In"] ?? data["Services"] ?? data["services_interested_in"] ?? [];
    let services: string[] = [];
    if (Array.isArray(servicesRaw)) {
      services = servicesRaw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
    } else if (typeof servicesRaw === "string") {
      if (servicesRaw.startsWith("[")) {
        try {
          services = JSON.parse(servicesRaw).filter((s: unknown): s is string => typeof s === "string");
        } catch { /* fall through */ }
      }
      if (services.length === 0) {
        services = servicesRaw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }

    const vehicleYear = vehicleYearRaw ? parseInt(vehicleYearRaw, 10) || null : null;

    // 4. Validate required fields
    if (!firstName || !phone) {
      console.error("[Quote Request] Missing required fields", { firstName, phone });
      return NextResponse.json({ success: false, error: "Name and phone are required" }, { status: 400, headers });
    }
    if (services.length === 0) {
      console.error("[Quote Request] No services selected");
      return NextResponse.json({ success: false, error: "Please select a service" }, { status: 400, headers });
    }

    // 5. Find or create customer
    const customerId = await findOrCreateParkingCustomer({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
    });

    // 6. Create Quo contact on shop line
    let quoContactId: string | undefined;
    const e164Phone = toE164(phone);
    if (e164Phone) {
      try {
        const result = await createOrUpdateQuoContact({
          phone: e164Phone,
          firstName,
          lastName,
          email,
        });
        quoContactId = result.contactId;
      } catch (err) {
        console.error("[Quote Request] Quo contact error:", err);
      }
    }

    // 7. Insert into quote_requests
    const supabase = createAdminClient();
    const { data: inserted, error } = await supabase
      .from("quote_requests")
      .insert({
        customer_id: customerId,
        quo_contact_id: quoContactId || null,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: e164Phone || phone,
        services,
        vehicle_make: vehicleMake || null,
        vehicle_model: vehicleModel || null,
        vehicle_year: vehicleYear,
        message: message || null,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Quote Request] DB insert failed:", error);
      return NextResponse.json({ success: false, error: "Failed to save request" }, { status: 500, headers });
    }

    console.log(`[Quote Request] Created ${inserted.id} for ${firstName} ${lastName}`);

    // 8. Revalidate dashboard + quote requests page
    revalidatePath("/dashboard");
    revalidatePath("/quote-requests");

    // 9. Send SMS notifications (after DB insert — failures logged but don't block 200)
    if (e164Phone) {
      try {
        const shopPhone = getPhoneNumber("shop");

        // Customer acknowledgment
        const ackBody = quoteRequestAckSMS({ firstName });
        await sendSMS({ to: e164Phone, body: ackBody, from: shopPhone });

        // Log customer SMS to messages table
        if (customerId) {
          await supabase.from("messages").insert({
            customer_id: customerId,
            channel: "sms" as const,
            direction: "out" as const,
            body: ackBody,
            phone_line: "shop",
          });
        }

        // Internal notification
        const notifyPhones = process.env.INTERNAL_NOTIFICATION_PHONES;
        if (notifyPhones) {
          const internalBody = quoteRequestInternalSMS({
            firstName,
            lastName,
            vehicleYear,
            vehicleMake,
            vehicleModel,
            services,
          });
          const phones = notifyPhones.split(",").map((p) => p.trim()).filter(Boolean);
          for (const notifyPhone of phones) {
            try {
              await sendSMS({ to: notifyPhone, body: internalBody, from: shopPhone });
            } catch (err) {
              console.error(`[Quote Request] Internal SMS to ${notifyPhone} failed:`, err);
            }
          }
        }
      } catch (err) {
        console.error("[Quote Request] SMS notification error:", err);
      }
    }

    return NextResponse.json({ success: true }, { status: 200, headers });
  } catch (err) {
    console.error("[Quote Request] Unexpected error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500, headers });
  }
}
