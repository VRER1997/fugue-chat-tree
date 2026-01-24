import { Node } from '@xyflow/react';

export interface ChatNodeData extends Record<string, unknown> {
  id: string;
  inputText?: string;
  aiResponse?: string;
  isSearchEnabled?: boolean;
  reasoningMode?: 'off' | 'auto' | 'light' | 'medium' | 'heavy';
  quote?: string;
  isRoot?: boolean;
  onBranch?: (text: string, sourceId: string) => void;
  highlights?: string[];
  collapsed?: boolean;
  collapsedCount?: number;
  onCollapse?: (id: string, shouldCollapse: boolean) => void;
  width?: number;
  height?: number;
}

export type ResearchStepStatus = 'pending' | 'running' | 'done';

export interface ResearchStep {
  id: string;
  label: string;
  status: ResearchStepStatus;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  content?: string;
}

export interface ResearchNodeData extends Record<string, unknown> {
  id: string;
  query: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  steps: ResearchStep[];
  answer: string;
  sources: Source[];
  error?: string;
  // Callback for consistency, though maybe not used directly in research
  onBranch?: (text: string, sourceId: string) => void;
  collapsed?: boolean;
  collapsedCount?: number;
  onCollapse?: (id: string, shouldCollapse: boolean) => void;
  width?: number;
  height?: number;
}

export type ChatNodeType = Node<ChatNodeData, 'chatNode'>;
export type ResearchNodeType = Node<ResearchNodeData, 'researchNode'>;

export type AppNode = ChatNodeType | ResearchNodeType;
