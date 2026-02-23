import type Anthropic from "@anthropic-ai/sdk";

export const tools: Anthropic.Tool[] = [
  // ── Customer tools ──────────────────────────────────────────────
  {
    name: "search_customers",
    description:
      "Search customers by name, phone, or email. Returns a list of matching customers. Pass an empty search string to list all customers.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: {
          type: "string",
          description: "Search query — matches against first name, last name, phone, or email",
        },
      },
      required: [],
    },
  },
  {
    name: "get_customer",
    description: "Get full details for a single customer by their ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Customer UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer. First name and last name are required.",
    input_schema: {
      type: "object" as const,
      properties: {
        first_name: { type: "string", description: "First name (required)" },
        last_name: { type: "string", description: "Last name (required)" },
        phone: { type: "string", description: "Phone number" },
        email: { type: "string", description: "Email address" },
        address: { type: "string", description: "Street address" },
        notes: { type: "string", description: "Notes about the customer" },
        customer_type: {
          type: "string",
          enum: ["retail", "fleet"],
          description: "Customer type (defaults to retail)",
        },
        fleet_account: { type: "string", description: "Fleet account name (e.g. 'Hertz', 'Sixt', 'DriveWhip') — only for fleet customers" },
      },
      required: ["first_name", "last_name"],
    },
  },
  {
    name: "update_customer",
    description: "Update an existing customer's information. Only pass fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Customer UUID" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        address: { type: "string" },
        notes: { type: "string" },
        customer_type: { type: "string", enum: ["retail", "fleet"] },
        fleet_account: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_customer",
    description:
      "Delete a customer. Will fail if the customer has active jobs (not_started, waiting_for_parts, in_progress). Always confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Customer UUID" },
      },
      required: ["id"],
    },
  },

  // ── Vehicle tools ───────────────────────────────────────────────
  {
    name: "get_vehicles_for_customer",
    description: "Get all vehicles belonging to a customer.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer UUID" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "get_vehicle",
    description: "Get full details for a single vehicle by its ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Vehicle UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_vehicle",
    description: "Create a new vehicle for a customer.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer UUID (required)" },
        year: { type: "number", description: "Model year" },
        make: { type: "string", description: "Manufacturer (e.g. Honda, Toyota)" },
        model: { type: "string", description: "Model name (e.g. Civic, Camry)" },
        vin: { type: "string", description: "Vehicle Identification Number" },
        license_plate: { type: "string", description: "License plate number" },
        mileage: { type: "number", description: "Current mileage" },
        color: { type: "string", description: "Vehicle color" },
        notes: { type: "string", description: "Notes about the vehicle" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "update_vehicle",
    description: "Update an existing vehicle. Only pass fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Vehicle UUID" },
        customer_id: { type: "string", description: "Customer UUID (required for routing)" },
        year: { type: "number" },
        make: { type: "string" },
        model: { type: "string" },
        vin: { type: "string" },
        license_plate: { type: "string" },
        mileage: { type: "number" },
        color: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "customer_id"],
    },
  },
  {
    name: "delete_vehicle",
    description: "Delete a vehicle. Always confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Vehicle UUID" },
        customer_id: { type: "string", description: "Customer UUID (required for routing)" },
      },
      required: ["id", "customer_id"],
    },
  },

  // ── Job tools ───────────────────────────────────────────────────
  {
    name: "search_jobs",
    description:
      "Search jobs by customer name, vehicle, category, or notes. Can also filter by status and/or category. Returns jobs with customer and vehicle info.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string", description: "Free-text search" },
        status: {
          type: "string",
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete"],
          description: "Filter by job status",
        },
        category: { type: "string", description: "Filter by job category" },
      },
      required: [],
    },
  },
  {
    name: "get_job",
    description:
      "Get full details for a single job including customer, vehicle, technician, and all line items.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Job UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_job_categories",
    description: "Get a list of all job categories that have been used.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_job",
    description:
      "Create a new job. Requires a customer_id. Optionally link a vehicle, set title, category, assign a tech, etc. Title is a free-text description of the full scope of work (e.g. 'Brake job and coolant filter'). Category is for reporting/filtering (e.g. 'Brake Service').",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer UUID (required)" },
        vehicle_id: { type: "string", description: "Vehicle UUID" },
        status: {
          type: "string",
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete"],
          description: "Job status (defaults to not_started)",
        },
        title: { type: "string", description: "Free-text job title describing the full scope of work (e.g. 'Brake job and coolant filter')" },
        category: { type: "string", description: "Job category for reporting (e.g. 'Brake Service', 'Oil Change')" },
        assigned_tech: { type: "string", description: "Technician user UUID" },
        date_received: { type: "string", description: "Date received (YYYY-MM-DD, defaults to today)" },
        date_finished: { type: "string", description: "Date finished (YYYY-MM-DD)" },
        notes: { type: "string", description: "Job notes" },
        payment_status: {
          type: "string",
          enum: ["unpaid", "invoiced", "paid", "waived"],
          description: "Payment status (defaults to unpaid)",
        },
        payment_method: {
          type: "string",
          enum: ["stripe", "cash", "check", "ach"],
          description: "Payment method",
        },
        mileage_in: { type: "number", description: "Vehicle mileage at time of service" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "update_job",
    description: "Update an existing job. Only pass fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Job UUID" },
        customer_id: { type: "string", description: "Customer UUID" },
        vehicle_id: { type: "string", description: "Vehicle UUID" },
        status: {
          type: "string",
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete"],
        },
        title: { type: "string", description: "Free-text job title" },
        category: { type: "string" },
        assigned_tech: { type: "string" },
        date_received: { type: "string" },
        date_finished: { type: "string" },
        notes: { type: "string" },
        payment_status: {
          type: "string",
          enum: ["unpaid", "invoiced", "paid", "waived"],
        },
        payment_method: {
          type: "string",
          enum: ["stripe", "cash", "check", "ach"],
        },
        mileage_in: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_job_status",
    description:
      "Update only the job status. Automatically sets date_finished when status is 'complete'. Confirm with user before setting to 'complete'.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Job UUID" },
        status: {
          type: "string",
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete"],
          description: "New job status",
        },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "delete_job",
    description: "Delete a job and all its line items. Always confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Job UUID" },
      },
      required: ["id"],
    },
  },

  // ── Job Line Item tools ─────────────────────────────────────────
  {
    name: "create_line_item",
    description: "Add a line item (labor or part) to a job.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job UUID (required)" },
        type: { type: "string", enum: ["labor", "part"], description: "Line item type (required)" },
        description: { type: "string", description: "Description of the work or part (required)" },
        quantity: { type: "number", description: "Quantity (required)" },
        unit_cost: { type: "number", description: "Cost per unit in dollars (required)" },
        part_number: { type: "string", description: "Part number (optional, for parts)" },
      },
      required: ["job_id", "type", "description", "quantity", "unit_cost"],
    },
  },
  {
    name: "update_line_item",
    description: "Update an existing job line item.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Line item UUID" },
        job_id: { type: "string", description: "Job UUID (required for routing)" },
        type: { type: "string", enum: ["labor", "part"] },
        description: { type: "string" },
        quantity: { type: "number" },
        unit_cost: { type: "number" },
        part_number: { type: "string" },
      },
      required: ["id", "job_id"],
    },
  },
  {
    name: "delete_line_item",
    description: "Delete a job line item. Always confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Line item UUID" },
        job_id: { type: "string", description: "Job UUID (required for routing)" },
      },
      required: ["id", "job_id"],
    },
  },

  // ── Estimate tools ──────────────────────────────────────────────
  {
    name: "create_estimate_from_job",
    description:
      "Create a new estimate for a job by copying the job's line items. Will fail if an estimate already exists for the job. Confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job UUID" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "get_estimate",
    description: "Get full estimate details including line items and related job/customer/vehicle info.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Estimate UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_estimate_for_job",
    description: "Get the estimate associated with a job (if any).",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job UUID" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "send_estimate",
    description:
      "Send a draft estimate to the customer. Generates an approval link. Only works on draft estimates. Confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Estimate UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_estimate_line_item",
    description:
      "Add a line item to a draft estimate. Will fail if the estimate is not in 'draft' status.",
    input_schema: {
      type: "object" as const,
      properties: {
        estimate_id: { type: "string", description: "Estimate UUID (required)" },
        type: { type: "string", enum: ["labor", "part"], description: "Line item type (required)" },
        description: { type: "string", description: "Description (required)" },
        quantity: { type: "number", description: "Quantity (required)" },
        unit_cost: { type: "number", description: "Cost per unit in dollars (required)" },
        part_number: { type: "string", description: "Part number (optional)" },
      },
      required: ["estimate_id", "type", "description", "quantity", "unit_cost"],
    },
  },
  {
    name: "update_estimate_line_item",
    description:
      "Update a line item on a draft estimate. Will fail if the estimate is not in 'draft' status.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Estimate line item UUID" },
        estimate_id: { type: "string", description: "Estimate UUID (required for routing)" },
        type: { type: "string", enum: ["labor", "part"] },
        description: { type: "string" },
        quantity: { type: "number" },
        unit_cost: { type: "number" },
        part_number: { type: "string" },
      },
      required: ["id", "estimate_id"],
    },
  },
  {
    name: "delete_estimate_line_item",
    description:
      "Delete a line item from a draft estimate. Will fail if estimate is not in 'draft' status. Always confirm with the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Estimate line item UUID" },
        estimate_id: { type: "string", description: "Estimate UUID (required for routing)" },
      },
      required: ["id", "estimate_id"],
    },
  },

  // ── Invoice tools ───────────────────────────────────────────────
  {
    name: "create_invoice_from_job",
    description:
      "Create a Stripe invoice from a completed job. Job must have status 'complete', a customer with an email, and at least one line item. Confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job UUID" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "get_invoice_for_job",
    description: "Get the invoice associated with a job (if any).",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job UUID" },
      },
      required: ["job_id"],
    },
  },

  // ── Team tools ──────────────────────────────────────────────────
  {
    name: "get_technicians",
    description: "Get a list of all technicians (users with role 'tech'). Useful for assigning jobs.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_team_members",
    description: "Get all team members (managers and technicians).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ── Reports tool ────────────────────────────────────────────────
  {
    name: "get_report_data",
    description:
      "Get shop performance data: completed job count, revenue, breakdowns by category and technician, and average ticket. Specify a date range or set is_all_time to true.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: {
          type: "string",
          description: "Start date (YYYY-MM-DD). Required unless is_all_time is true.",
        },
        to: {
          type: "string",
          description: "End date (YYYY-MM-DD). Required unless is_all_time is true.",
        },
        is_all_time: {
          type: "boolean",
          description: "Set to true to get all-time data (ignores from/to)",
        },
      },
      required: [],
    },
  },

  // ── Payment tools ─────────────────────────────────────────────
  {
    name: "record_payment",
    description:
      "Record a payment on a job. Sets the payment method and payment status. Confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        job_id: { type: "string", description: "Job UUID (required)" },
        payment_method: {
          type: "string",
          enum: ["stripe", "cash", "check", "ach"],
          description: "Payment method (required)",
        },
        payment_status: {
          type: "string",
          enum: ["unpaid", "invoiced", "paid", "waived"],
          description: "Payment status (defaults to 'paid')",
        },
      },
      required: ["job_id", "payment_method"],
    },
  },

  // ── Fleet / AR tools ──────────────────────────────────────────
  {
    name: "get_ar_summary",
    description:
      "Get outstanding accounts receivable summary for fleet customers. Shows unpaid/invoiced jobs grouped by fleet account with aging buckets (0-30, 31-60, 60+ days).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_daily_summary",
    description:
      "Get a summary of today's shop activity: jobs worked on, revenue by payment method, and technician activity.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ── Messaging tools ─────────────────────────────────────────
  {
    name: "send_sms",
    description:
      "Send an SMS text message to a customer. Requires the customer's ID and message body. The customer must have a valid phone number on file. Confirm with the user before calling this.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer UUID (required)" },
        body: { type: "string", description: "The text message to send (required)" },
        job_id: { type: "string", description: "Job UUID to link this message to (optional)" },
      },
      required: ["customer_id", "body"],
    },
  },
  {
    name: "get_customer_messages",
    description:
      "Get the SMS/email message history for a customer. Returns the last 50 messages in reverse chronological order.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer UUID (required)" },
      },
      required: ["customer_id"],
    },
  },
];
