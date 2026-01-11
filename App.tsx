import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  MarkerType,
  BackgroundVariant,
  Node,
  useReactFlow,
  ReactFlowProvider,
  ReactFlowJsonObject,
} from '@xyflow/react';
import { LucideQuote, Download, Upload, FileJson, Settings, RotateCcw } from 'lucide-react';
import { ChatNode } from './components/ChatNode';
import { ChatNodeData } from './types';
import { SettingsModal } from './components/SettingsModal';

const nodeTypes = {
  chatNode: ChatNode,
};

const STORAGE_KEY = 'chat-tree-state';

// Initial Root Node
const initialNodes: Node<ChatNodeData>[] = [
  {
    id: 'root',
    type: 'chatNode',
    position: { x: 0, y: 0 },
    data: {
      id: 'root',
      isRoot: true,
      onBranch: () => { } // Will be overwritten in component
    },
  },
];

const Flow = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { getNode, toObject, setViewport, fitView } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Function to create a new branch
  const onBranch = useCallback(
    (quoteText: string, sourceNodeId: string) => {
      const sourceNode = getNode(sourceNodeId);
      if (!sourceNode) return;

      // 1. Update source node to save the highlight
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === sourceNodeId) {
            const currentHighlights = node.data.highlights || [];
            if (!currentHighlights.includes(quoteText)) {
              return {
                ...node,
                data: {
                  ...node.data,
                  highlights: [...currentHighlights, quoteText]
                }
              };
            }
          }
          return node;
        })
      );

      const newNodeId = `node-${Date.now()}`;

      // Calculate position for new node (to the right of source)
      // Increased offset to 600 to accommodate 550px wide nodes
      const newPosition = {
        x: sourceNode.position.x + 600,
        y: sourceNode.position.y + (Math.random() * 100 - 50),
      };

      const newNode: Node<ChatNodeData> = {
        id: newNodeId,
        type: 'chatNode',
        position: newPosition,
        data: {
          id: newNodeId,
          quote: quoteText,
          onBranch: onBranch, // Recursive callback passing
        },
      };

      const newEdge: Edge = {
        id: `e-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#94a3b8',
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [getNode, setNodes, setEdges]
  );

  // Update initial nodes with the onBranch callback
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onBranch: onBranch
        }
      }))
    );
  }, [onBranch, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // --- Load from localStorage on mount ---
  const [isLoaded, setIsLoaded] = React.useState(false);
  React.useEffect(() => {
    if (isLoaded) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const flow = JSON.parse(saved);
        if (flow && flow.nodes && flow.nodes.length > 0) {
          const restoredNodes = flow.nodes.map((node: Node) => ({
            ...node,
            data: {
              ...node.data,
              onBranch: onBranch
            }
          }));
          setNodes(restoredNodes);
          setEdges(flow.edges || []);
          const { x = 0, y = 0, zoom = 1 } = flow.viewport || {};
          setViewport({ x, y, zoom });
        }
      } catch (error) {
        console.error('Failed to load from localStorage:', error);
      }
    }
    setIsLoaded(true);
  }, [isLoaded, onBranch, setNodes, setEdges, setViewport]);

  // --- Save to localStorage on change ---
  React.useEffect(() => {
    if (!isLoaded) return; // Don't save during initial load
    const flow = toObject();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
  }, [nodes, edges, toObject, isLoaded]);

  // --- Clear Functionality ---
  const onClear = useCallback(() => {
    if (confirm('确定要清空画布吗？所有对话将被删除。')) {
      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      const freshRoot: Node<ChatNodeData> = {
        id: 'root',
        type: 'chatNode',
        position: { x: 0, y: 0 },
        data: {
          id: 'root',
          isRoot: true,
          onBranch: onBranch,
          inputText: '',
          aiResponse: '',
          highlights: [],
        },
      };
      setNodes([freshRoot]);
      setEdges([]);
      // Use fitView with a small delay to center the node after state updates
      setTimeout(() => {
        fitView({ padding: 0.5, duration: 200 });
      }, 50);
    }
  }, [onBranch, setNodes, setEdges, fitView]);

  // --- Save Functionality ---
  const onSave = useCallback(() => {
    const flow = toObject();
    const jsonString = JSON.stringify(flow, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-tree-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [toObject]);

  // --- Load Functionality ---
  const onRestore = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string') return;

      try {
        const flow: ReactFlowJsonObject<ChatNodeData> = JSON.parse(result);

        if (flow) {
          const { x = 0, y = 0, zoom = 1 } = flow.viewport || {};

          // We must re-attach the current onBranch callback to loaded nodes
          // because functions are not serialized in JSON.
          const restoredNodes = flow.nodes.map((node) => ({
            ...node,
            data: {
              ...node.data,
              onBranch: onBranch, // Re-bind the active callback
            },
          }));

          setNodes(restoredNodes);
          setEdges(flow.edges || []);
          setViewport({ x, y, zoom });
        }
      } catch (error) {
        console.error('Failed to parse JSON:', error);
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
    event.target.value = '';
  }, [onBranch, setNodes, setEdges, setViewport]);

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full h-screen bg-slate-50 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#cbd5e1', strokeWidth: 2 }
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#cbd5e1"
        />
        <Controls className="bg-white shadow-lg border border-slate-200 rounded-lg overflow-hidden text-slate-600" />

        {/* Instructions & Actions Overlay */}
        <div className="absolute top-4 left-4 z-50 flex flex-col gap-3">
          {/* Title & Info */}
          <div className="bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-slate-200 max-w-sm pointer-events-none select-none">
            <h1 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <LucideQuote className="w-5 h-5 text-blue-600" />
              Chat Tree
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Generate an AI response, then <span className="font-semibold text-slate-900">highlight any text</span> in the answer to branch out a new conversation node.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClear}
              className="bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 text-sm font-medium py-2 px-3 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center gap-2 transition-colors"
              title="Clear Canvas"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onSave}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Save JSON
            </button>
            <button
              onClick={triggerFileUpload}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Load
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 px-3 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center gap-2 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={onRestore}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>
      </ReactFlow>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}