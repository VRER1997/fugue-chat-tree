// types.ts
import { Node } from '@xyflow/react';

export interface ChatNodeData extends Record<string, unknown> {
  id: string;
  isRoot?: boolean;
  quote?: string; // The text quoted from the parent node
  onBranch: (text: string, sourceNodeId: string) => void;
  inputText?: string;
  aiResponse?: string;
  highlights?: string[];
}

export type ChatNodeType = Node<ChatNodeData>;