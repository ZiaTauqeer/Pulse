import { searchCustomersTool, getCustomerTool, getCustomerFeaturesTool } from "./customers";
import {
  getChurnPredictionTool,
  getPredictionHistoryTool,
  getCustomerTimelineTool,
  getSupportHistoryTool,
  getSentimentHistoryTool,
} from "./prediction";
import { getAnalyticsTool, getModelVersionTool } from "./analytics";
import { searchSimilarCustomersTool } from "./similarity";
import { getSegmentsTool, getSegmentCustomersTool } from "./segments";
import type { ToolDefinition } from "./types";

/**
 * Every tool the AI assistant can call. Add a new tool by writing it in
 * one of the files above (or a new file) and listing it here - nothing
 * else needs to change.
 */
export const ALL_TOOLS: ToolDefinition[] = [
  searchCustomersTool,
  getCustomerTool,
  getCustomerFeaturesTool,
  getChurnPredictionTool,
  getPredictionHistoryTool,
  getCustomerTimelineTool,
  getSupportHistoryTool,
  getSentimentHistoryTool,
  getAnalyticsTool,
  getModelVersionTool,
  searchSimilarCustomersTool,
  getSegmentsTool,
  getSegmentCustomersTool,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
