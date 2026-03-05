const QUO_API_BASE = "https://api.openphone.com/v1";

interface QuoContactResult {
  success: boolean;
  contactId?: string;
}

/**
 * Create or update a contact in Quo (OpenPhone).
 * Uses externalId = phone number for dedup (Quo API doesn't support phone search).
 * If found by externalId, updates name. If not, creates with name + phone + email.
 * Fails gracefully — never throws, returns { success: false } on error.
 */
export async function createOrUpdateQuoContact({
  phone,
  firstName,
  lastName,
  email,
}: {
  phone: string;
  firstName: string;
  lastName: string;
  email?: string;
}): Promise<QuoContactResult> {
  const apiKey = process.env.QUO_API_KEY;
  if (!apiKey) {
    console.log("[Quo Contacts] No API key — skipping contact creation");
    return { success: false };
  }

  // Use phone number as externalId for dedup
  const externalId = phone;

  try {
    // Search for existing contact by externalId
    const searchRes = await fetch(
      `${QUO_API_BASE}/contacts?externalIds=${encodeURIComponent(externalId)}&maxResults=1`,
      {
        headers: { Authorization: apiKey },
      }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const existing = searchData.data?.[0];

      if (existing) {
        // Update existing contact name
        const patchRes = await fetch(`${QUO_API_BASE}/contacts/${existing.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiKey,
          },
          body: JSON.stringify({
            defaultFields: {
              firstName,
              lastName,
            },
          }),
        });

        if (!patchRes.ok) {
          const text = await patchRes.text();
          console.error("[Quo Contacts] Update failed:", patchRes.status, text);
          return { success: false };
        }

        console.log(`[Quo Contacts] Updated contact ${existing.id} for ${firstName} ${lastName}`);
        return { success: true, contactId: existing.id };
      }
    }

    // Create new contact
    const createRes = await fetch(`${QUO_API_BASE}/contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        externalId,
        source: "ShopPilot",
        defaultFields: {
          firstName,
          lastName,
          phoneNumbers: [{ name: "mobile", value: phone }],
          emails: email ? [{ name: "personal", value: email }] : [],
        },
      }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error("[Quo Contacts] Create failed:", createRes.status, text);
      return { success: false };
    }

    const createData = await createRes.json();
    console.log(`[Quo Contacts] Created contact for ${firstName} ${lastName}`);
    return { success: true, contactId: createData.data?.id };
  } catch (err) {
    console.error("[Quo Contacts] Unexpected error:", err);
    return { success: false };
  }
}
