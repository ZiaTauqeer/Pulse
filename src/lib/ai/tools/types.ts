export type ToolContext = {
  organizationId: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};
