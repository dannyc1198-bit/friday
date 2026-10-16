// One converter for text chat and realtime voice. Array-form tool
// parameters must keep their names, types, and required list.

export interface ToolParameterDescriptor {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[];
  items?: unknown;
}

export function parametersToJsonSchema(params: unknown): Record<string, unknown> {
  if (params && typeof params === "object" && !Array.isArray(params) && (params as { type?: string }).type === "object") {
    return params as Record<string, unknown>;
  }
  const list = Array.isArray(params) ? (params as ToolParameterDescriptor[]) : [];
  return {
    type: "object",
    properties: list.reduce<Record<string, unknown>>((acc, param) => {
      if (!param || typeof param.name !== "string") return acc;
      acc[param.name] = {
        type: param.type,
        description: param.description,
        ...(param.enum ? { enum: param.enum } : {}),
        ...(param.type === "array" ? { items: param.items ?? { type: "string" } } : {}),
      };
      return acc;
    }, {}),
    required: list.filter((param) => param?.required && param.name).map((param) => param.name),
  };
}
