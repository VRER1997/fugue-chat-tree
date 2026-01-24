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
import { LucideQuote, Download, Upload, FileJson, Settings, RotateCcw, Github, BookOpen as BookOpenIcon, MessageSquare, FileText } from 'lucide-react';
import { ChatNode } from './components/ChatNode';
import { ResearchNode } from './components/ResearchNode';
import { NoteNode } from './components/NoteNode';
import { ChatNodeData, ResearchNodeData, NoteNodeData, AppNode, ChatNodeType, ResearchNodeType, NoteNodeType } from './types';
import { SettingsModal } from './components/SettingsModal';

const nodeTypes = {
  chatNode: ChatNode,
  researchNode: ResearchNode,
  noteNode: NoteNode,
} as any;

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
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]); // Start empty
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { getNode, getNodes, getEdges, toObject, setViewport, fitView } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Node dimensions for collision detection
  const NODE_SIZES = {
    chatNode: { width: 412, height: 400 },      // Approximate ChatNode size
    researchNode: { width: 600, height: 500 },   // Approximate ResearchNode size
    noteNode: { width: 500, height: 400 }       // Approximate NoteNode size
  };

  // Helper to check if two rectangles overlap (with padding)
  const checkOverlap = (
    pos1: { x: number; y: number },
    size1: { width: number; height: number },
    pos2: { x: number; y: number },
    size2: { width: number; height: number },
    padding: number = 50 // Extra space between nodes
  ): boolean => {
    return !(
      pos1.x + size1.width + padding < pos2.x ||
      pos2.x + size2.width + padding < pos1.x ||
      pos1.y + size1.height + padding < pos2.y ||
      pos2.y + size2.height + padding < pos1.y
    );
  };

  // Helper to get a good position for a new node
  const getNewNodePosition = (nodeType: 'chatNode' | 'researchNode' | 'noteNode' = 'chatNode') => {
    const newNodeSize = NODE_SIZES[nodeType];

    // If no nodes, center it roughly
    if (nodes.length === 0) {
      return {
        x: window.innerWidth / 2 - newNodeSize.width / 2,
        y: window.innerHeight / 2 - newNodeSize.height / 2
      };
    }

    // Try to find a non-overlapping position
    // Start from the last node position and search in a spiral pattern
    const lastNode = nodes[nodes.length - 1];
    const startX = lastNode.position.x;
    const startY = lastNode.position.y;

    // Define search offsets - Priority: Down, Up, Right, Left, then diagonals and far positions
    const searchOffsets = [
      { x: 0, y: 100 },     // Down (priority 1)
      { x: 0, y: -100 },    // Up (priority 2)
      { x: 100, y: 0 },     // Right (priority 3)
      { x: -100, y: 0 },    // Left (priority 4)
      { x: 150, y: 150 },   // Diagonal down-right
      { x: -150, y: 150 },  // Diagonal down-left
      { x: 150, y: -150 },  // Diagonal up-right
      { x: -150, y: -150 }, // Diagonal up-left
      { x: 0, y: 250 },     // Far down
      { x: 0, y: -250 },    // Far up
      { x: 250, y: 0 },     // Far right
      { x: -250, y: 0 },    // Far left
      { x: 100, y: 500 },   // Very far down-right
      { x: 500, y: 100 },   // Very far right-down
    ];

    for (const offset of searchOffsets) {
      const candidatePos = {
        x: startX + offset.x,
        y: startY + offset.y
      };

      // Check if this position overlaps with any existing node
      let hasOverlap = false;
      for (const node of nodes) {
        const nodeSize = NODE_SIZES[node.type as 'chatNode' | 'researchNode'] || NODE_SIZES.chatNode;
        if (checkOverlap(candidatePos, newNodeSize, node.position, nodeSize)) {
          hasOverlap = true;
          break;
        }
      }

      if (!hasOverlap) {
        return candidatePos;
      }
    }

    // If all positions overlap, fall back to a position far to the right
    return {
      x: startX + 700,
      y: startY + Math.random() * 200 - 100 // Add some randomness
    };
  };

  const handleAddChatNode = () => {
    const id = `node-${Date.now()}`;
    const newNode: ChatNodeType = {
      id,
      type: 'chatNode',
      position: getNewNodePosition('chatNode'),
      data: {
        id,
        inputText: '',
        isRoot: true, // Independent nodes created manually act as roots? Or just standalone? Let's say true.
        isSearchEnabled: false,
        reasoningMode: 'off',
        onBranch: onBranch
      }
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const handleAddResearchNode = () => {
    const id = `research-${Date.now()}`;
    const newNode: ResearchNodeType = {
      id,
      type: 'researchNode',
      position: getNewNodePosition('researchNode'),
      data: {
        id,
        query: '',
        status: 'idle',
        steps: [],
        answer: '',
        sources: []
      }
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const handleAddNoteNode = () => {
    const id = `note-${Date.now()}`;
    const newNode: NoteNodeType = {
      id,
      type: 'noteNode',
      position: getNewNodePosition('noteNode'),
      data: {
        id,
        content: '',
        onBranch: onBranch
      }
    };
    setNodes((nds) => nds.concat(newNode));
  };




  // Implement onCollapse Function
  const onCollapse = useCallback(
    (nodeId: string, shouldCollapse: boolean) => {
      // Get FRESH state directly from ReactFlow instance
      const currentNodes = getNodes();
      const currentEdges = getEdges();

      // BFS to find all downstream nodes and edges
      const queue = [nodeId];
      const visited = new Set<string>();
      const descendantNodeIds = new Set<string>();
      const descendantEdgeIds = new Set<string>();

      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr);

        const outgoingEdges = currentEdges.filter(e => e.source === curr);
        outgoingEdges.forEach(e => {
          descendantEdgeIds.add(e.id);
          // Only add target if we haven't visited it (standard tree/DAG traversal)
          if (!visited.has(e.target)) {
            descendantNodeIds.add(e.target);
            queue.push(e.target);
          }
        });
      }

      // Update Edges
      setEdges((eds) => eds.map(e => {
        if (descendantEdgeIds.has(e.id)) {
          return { ...e, hidden: shouldCollapse };
        }
        return e;
      }));

      // Update Nodes
      setNodes((nds) => nds.map(n => {
        if (descendantNodeIds.has(n.id)) {
          return { ...n, hidden: shouldCollapse };
        }
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              collapsed: shouldCollapse,
              collapsedCount: shouldCollapse ? descendantNodeIds.size : 0
            }
          };
        }
        return n;
      }));

    },
    [getNodes, getEdges, setNodes, setEdges] // Stable dependencies
  );


  // Function to create a new branch
  const onBranch = useCallback(
    (quoteText: string, sourceNodeId: string) => {
      const sourceNode = getNode(sourceNodeId);
      if (!sourceNode) return;

      // 1. Update source node to save the highlight (Only for ChatNode)
      if (sourceNode.type === 'chatNode') {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === sourceNodeId && node.type === 'chatNode') {
              const chatNode = node as ChatNodeType;
              const currentHighlights = chatNode.data.highlights || [];
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
      }

      const newNodeId = `node-${Date.now()}`;

      // Calculate position for new node
      // Research nodes are wider (600px) than Chat nodes (412px)
      // Standard offset for Chat Node: 600px
      // Offset for Research Node: 800px
      const xOffset = sourceNode.type === 'researchNode' ? 800 : 600;

      const newPosition = {
        x: sourceNode.position.x + xOffset,
        y: sourceNode.position.y + (Math.random() * 100 - 50),
      };

      // Inherit settings from parent if available, otherwise defaults
      const parentData = sourceNode.data as (ChatNodeData | ResearchNodeData);
      // Research nodes don't have reasoningMode/isSearchEnabled properties directly mapping to ChatNode
      // So usage defaults or 'off'/false for Research parents for now.
      const inheritedReasoning = 'reasoningMode' in parentData ? parentData.reasoningMode : 'off';
      const inheritedSearch = 'isSearchEnabled' in parentData ? parentData.isSearchEnabled : false;

      const newNode: Node<ChatNodeData> = {
        id: newNodeId,
        type: 'chatNode',
        position: newPosition,
        data: {
          id: newNodeId,
          quote: quoteText,
          onBranch: onBranch, // Recursive callback passing
          onCollapse: onCollapse,
          reasoningMode: inheritedReasoning,
          isSearchEnabled: inheritedSearch,
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
    [getNode, setNodes, setEdges, onCollapse]
  );

  // Update initial nodes with the onBranch and onCollapse callback
  // This useEffect is now safe because onBranch and onCollapse are stable (impl uses getters)
  React.useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        // Only update if callbacks are missing or changed (reference check)
        // Optimization: checking if data.onCollapse is strictly equal avoids separate object creation if same
        if (node.data.onBranch === onBranch && node.data.onCollapse === onCollapse) {
          return node;
        }
        return {
          ...node,
          data: {
            ...node.data,
            onBranch: onBranch,
            onCollapse: onCollapse
          }
        };
      })
    );
  }, [onBranch, onCollapse, setNodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      // Check if this connection would create a cycle
      const { source, target } = params;

      if (!source || !target) return;

      // A connection from A to B creates a cycle if there's already a path from B to A
      // We'll use DFS to check if target can reach source through existing edges
      const currentEdges = getEdges();

      const canReach = (from: string, to: string, visited = new Set<string>()): boolean => {
        if (from === to) return true;
        if (visited.has(from)) return false;

        visited.add(from);

        // Find all outgoing edges from current node
        const outgoingEdges = currentEdges.filter(edge => edge.source === from);

        // Recursively check if any of the target nodes can reach our destination
        for (const edge of outgoingEdges) {
          if (canReach(edge.target, to, visited)) {
            return true;
          }
        }

        return false;
      };

      // Check if target can already reach source (which would create a cycle)
      if (canReach(target, source)) {
        // Show alert to user
        alert('⚠️ 无法创建连接：此操作将导致循环引用。\n\n节点之间的连接必须保持树形或有向无环图(DAG)结构。');
        return; // Abort the connection
      }

      // No cycle detected, proceed with the connection
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, getEdges]
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
              onBranch: onBranch,
              onCollapse: onCollapse
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
  }, [isLoaded, onBranch, onCollapse, setNodes, setEdges, setViewport]);

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

      setNodes([]);
      setEdges([]);

      // Reset view
      setTimeout(() => {
        setViewport({ x: 0, y: 0, zoom: 1 });
      }, 50);
    }
  }, [setNodes, setEdges, fitView]); // Removed onBranch from dependencies as unused here

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
        const flow: ReactFlowJsonObject<AppNode> = JSON.parse(result);

        if (flow) {
          const { x = 0, y = 0, zoom = 1 } = flow.viewport || {};

          // We must re-attach the current onBranch and onCollapse callback to loaded nodes
          // because functions are not serialized in JSON.
          const restoredNodes = flow.nodes.map((node) => {
            // Re-attach callback only for chat/research nodes that need it
            if (node.type === 'chatNode' || node.type === 'researchNode') {
              return {
                ...node,
                data: {
                  ...node.data,
                  onBranch: onBranch,
                  onCollapse: onCollapse
                }
              } as AppNode;
            }
            return node as AppNode;
          });

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
  }, [onBranch, onCollapse, setNodes, setEdges, setViewport]);

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full h-screen bg-slate-50 relative font-sans">
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
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#cbd5e1', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#cbd5e1',
          },
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
              Add a node to start. <span className="font-semibold text-slate-900">Highlight text</span> in answers to branch out.
            </p>
          </div>

          {/* Create Node Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleAddChatNode}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-medium shadow-sm transition-all"
            >
              <div className="flex items-center justify-center bg-white/20 p-1 rounded">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span>New Chat</span>
            </button>
            <button
              onClick={handleAddResearchNode}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg font-medium shadow-sm transition-all"
            >
              <div className="flex items-center justify-center bg-white/20 p-1 rounded">
                <BookOpenIcon className="w-4 h-4" />
              </div>
              <span>New Research</span>
            </button>
            <button
              onClick={handleAddNoteNode}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg font-medium shadow-sm transition-all"
            >
              <div className="flex items-center justify-center bg-white/20 p-1 rounded">
                <FileText className="w-4 h-4" />
              </div>
              <span>New Note</span>
            </button>
          </div>


          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClear}
              className="w-9 h-9 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="Clear Canvas"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={onSave}
              className="w-9 h-9 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="Save JSON"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={triggerFileUpload}
              className="w-9 h-9 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="Load JSON"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-9 h-9 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <a
              href="https://github.com/VRER1997/fugue-chat-tree"
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 bg-white hover:bg-slate-50 text-slate-700 hover:text-black rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="View on GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
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