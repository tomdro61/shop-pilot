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
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete", "paid"],
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
      "Create a new job. Requires a customer_id. Optionally link a vehicle, set category, assign a tech, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        customer_id: { type: "string", description: "Customer UUID (required)" },
        vehicle_id: { type: "string", description: "Vehicle UUID" },
        status: {
          type: "string",
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete", "paid"],
          description: "Job status (defaults to not_started)",
        },
        category: { type: "string", description: "Job category (e.g. 'Brake Service', 'Oil Change')" },
        assigned_tech: { type: "string", description: "Technician user UUID" },
        date_received: { type: "string", description: "Date received (YYYY-MM-DD, defaults to today)" },
        date_finished: { type: "string", description: "Date finished (YYYY-MM-DD)" },
        notes: { type: "string", description: "Job notes" },
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
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete", "paid"],
        },
        category: { type: "string" },
        assigned_tech: { type: "string" },
        date_received: { type: "string" },
        date_finished: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "update_job_status",
    description:
      "Update only the job status. Automatically sets date_finished when status is 'complete' or 'paid'. Confirm with user before setting to 'complete' or 'paid'.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Job UUID" },
        status: {
          type: "string",
          enum: ["not_started", "waiting_for_parts", "in_progress", "complete", "paid"],
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
];
