import { ToolDefinition } from "@/types/ai";

/**
 * Farm operation tools that the AI can call.
 * These map to Express backend API endpoints.
 */
export const farmTools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_flock_summary",
      description: "Get a summary of all flocks including bird count, breed, status, and mortality",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_production_data",
      description: "Get recent egg production data including eggs collected, mortality, and feed usage",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days of data to retrieve (default 7)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_financial_summary",
      description: "Get financial summary including income, expenses, and profit",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            description: "Time period: 'week', 'month', or 'year'",
            enum: ["week", "month", "year"],
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_status",
      description: "Get current inventory status including stock levels and low-stock alerts",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_worker_info",
      description: "Get information about farm workers including roles and wages",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_data",
      description: "Get recent sales data including amounts, customers, and payment status",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days of data to retrieve (default 30)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_flock",
      description: "Add a new flock to the farm",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the flock" },
          breed: { type: "string", description: "Breed of birds" },
          initialCount: { type: "number", description: "Number of birds" },
          type: { type: "string", description: "Type: layer, broiler, or breeder" },
        },
        required: ["name", "initialCount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_production",
      description: "Record daily egg production data",
      parameters: {
        type: "object",
        properties: {
          flockId: { type: "number", description: "ID of the flock" },
          eggsCollected: { type: "number", description: "Number of eggs collected" },
          mortality: { type: "number", description: "Number of bird deaths" },
          feedUsed: { type: "number", description: "Feed used in kg" },
        },
        required: ["flockId", "eggsCollected"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_expense",
      description: "Record a farm expense",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in KES" },
          category: { type: "string", description: "Category: feed, labor, medication, equipment, transport, other" },
          description: { type: "string", description: "Description of the expense" },
        },
        required: ["amount", "category", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather and forecast for the farm location",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vaccination_schedule",
      description: "Get vaccination schedule and upcoming vaccinations for flocks",
      parameters: {
        type: "object",
        properties: {
          flockId: { type: "number", description: "ID of the flock (optional, returns all if not provided)" },
        },
        required: [],
      },
    },
  },
];

/**
 * System prompt for the AI assistant.
 */
export const SYSTEM_PROMPT = `You are Wangari AI, an intelligent farm management assistant for all livestock and crop farms in Kenya — poultry, dairy and beef cattle, goats, sheep, pigs, rabbits, fish and bees.

You have access to the farmer's live data and can perform operations on their farm.
Always be helpful, concise, and provide actionable advice.

When reporting data:
- Use KES (Kenyan Shillings) for all monetary values
- Be specific with numbers and dates
- Highlight any alerts or issues that need attention
- Provide context and recommendations when appropriate

When performing operations:
- Confirm the action before executing
- Show the result after execution
- Suggest follow-up actions if relevant

Farm knowledge:
- Layer chickens typically lay 250-300 eggs per year
- Feed conversion ratio (FCR) of 1.8-2.2 is good for layers
- Mortality rate under 1% per week is acceptable
- Vaccination is critical for disease prevention
- Common vaccines: Marek's, Newcastle (NDV), Infectious Bronchitis (IB), Gumboro (IBD)
`;
