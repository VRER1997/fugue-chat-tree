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

export interface NoteNodeData extends Record<string, unknown> {
  id: string;
  content?: string;
  onBranch?: (text: string, sourceId: string) => void;
  collapsed?: boolean;
  collapsedCount?: number;
  onCollapse?: (id: string, shouldCollapse: boolean) => void;
  width?: number;
  height?: number;
}

export type ChatNodeType = Node<ChatNodeData, 'chatNode'>;
export type ResearchNodeType = Node<ResearchNodeData, 'researchNode'>;
export type NoteNodeType = Node<NoteNodeData, 'noteNode'>;

export type AppNode = ChatNodeType | ResearchNodeType | NoteNodeType;

// Canvas Management Types
export interface Canvas {
  id: string;
  title: string;
  nodes: AppNode[];
  edges: any[]; // Using any[] to match Edge type from @xyflow/react
  viewport: { x: number; y: number; zoom: number };
  createdAt: number;
  updatedAt: number;
}

export interface CanvasListState {
  canvases: Canvas[];
  activeCanvasId: string;
}
