import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
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
import {
  MessageSquare,
  FileText,
  BookOpen as BookOpenIcon,
  Settings,
  Download,
  Upload,
  RotateCcw,
  Quote as LucideQuote,
  Plus,
  Github,
  GitBranch,
  Search,
  X,
  Undo2,
  Redo2,
  Focus,
  List
} from 'lucide-react';
import { ChatNode } from './components/ChatNode';
import { ResearchNode } from './components/ResearchNode';
import { NoteNode } from './components/NoteNode';
import { ChatNodeData, ResearchNodeData, NoteNodeData, AppNode, ChatNodeType, ResearchNodeType, NoteNodeType, Canvas } from './types';
import { SettingsModal } from './components/SettingsModal';
import { CanvasList } from './components/CanvasList';
import { ContextPanel } from './components/ContextPanel';
import { generateCanvasTitle } from './services/titleGenerator';
import { fileSystemService } from './services/fileSystem';

const nodeTypes = {
  chatNode: ChatNode,
  researchNode: ResearchNode,
  noteNode: NoteNode,
} as any;

const STORAGE_KEY = 'chat-tree-canvases';
const OLD_STORAGE_KEY = 'chat-tree-state'; // For migration

// Storage mode type
type StorageMode = 'localStorage' | 'fileSystem';

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
  const { getNode, getNodes, getEdges, toObject, setViewport, fitView, getZoom, setCenter } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Track newly created nodes for highlight effect
  const [newlyCreatedNodeId, setNewlyCreatedNodeId] = React.useState<string | null>(null);

  // Multi-canvas state
  const [canvases, setCanvases] = React.useState<Canvas[]>([]);
  const [activeCanvasId, setActiveCanvasId] = React.useState<string>('');
  const [isCanvasListCollapsed, setIsCanvasListCollapsed] = React.useState(false);
  const [titleGenerationAttempted, setTitleGenerationAttempted] = React.useState<Set<string>>(new Set());

  // Storage mode state
  const [storageMode, setStorageMode] = React.useState<StorageMode>('localStorage');
  const [hasFileSystemAccess, setHasFileSystemAccess] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<Array<{ nodeId: string; type: string; content: string; field: string }>>([]);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Undo/Redo state
  const [history, setHistory] = React.useState<Array<{ nodes: AppNode[]; edges: Edge[] }>>([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const isUndoRedoAction = React.useRef(false);
  const historyDebounceRef = React.useRef<NodeJS.Timeout | null>(null);

  // Focus Mode state
  const [focusMode, setFocusMode] = React.useState(false);
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null);

  // Context Panel state
  const [isContextPanelOpen, setIsContextPanelOpen] = React.useState(false);

  // Node dimensions for collision detection
  // Heights updated to match actual initial rendered size (min-height) to prevent large gaps
  const NODE_SIZES = {
    chatNode: { width: 412, height: 200 },
    researchNode: { width: 600, height: 330 },
    noteNode: { width: 500, height: 200 }
  };

  // Helper to check if two rectangles overlap (with padding)
  const checkOverlap = (
    pos1: { x: number; y: number },
    size1: { width: number; height: number },
    pos2: { x: number; y: number },
    size2: { width: number; height: number },
    padding: number = 100 // Extra space between nodes
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

    // If no nodes, center it relative to viewport or window center (simplified)
    if (nodes.length === 0) {
      return {
        x: window.innerWidth / 2 - newNodeSize.width / 2,
        y: window.innerHeight / 2 - newNodeSize.height / 2
      };
    }

    // Prioritize selected node, otherwise use last node
    const selectedNode = nodes.find(n => n.selected);
    const referenceNode = selectedNode || nodes[nodes.length - 1];

    const startX = referenceNode.position.x;
    const startY = referenceNode.position.y;

    // Fixed spacing in canvas coordinates for consistent visual distance
    const spacing = 100;

    const refWidth = NODE_SIZES[referenceNode.type as keyof typeof NODE_SIZES]?.width || 400;
    const refHeight = NODE_SIZES[referenceNode.type as keyof typeof NODE_SIZES]?.height || 400;

    const searchOffsets = [
      // Prioritize right and bottom (natural reading flow)
      { x: refWidth + spacing, y: 0 },                        // Right
      { x: refWidth + spacing, y: refHeight + spacing },      // Bottom-right diagonal
      { x: 0, y: refHeight + spacing },                       // Below
      { x: refWidth + spacing, y: -(newNodeSize.height + spacing) }, // Top-right
      { x: -(newNodeSize.width + spacing), y: 0 },            // Left
      { x: 0, y: -(newNodeSize.height + spacing) },           // Above
    ];

    for (const offset of searchOffsets) {
      const candidatePos = {
        x: startX + offset.x,
        y: startY + offset.y
      };

      let hasOverlap = false;
      for (const node of nodes) {
        const nodeSize = NODE_SIZES[node.type as keyof typeof NODE_SIZES] || NODE_SIZES.chatNode;
        if (checkOverlap(candidatePos, newNodeSize, node.position, nodeSize)) {
          hasOverlap = true;
          break;
        }
      }

      if (!hasOverlap) {
        return candidatePos;
      }
    }

    // Fallback position if all preferred positions are occupied
    return {
      x: startX + refWidth + 20,
      y: startY
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
        isRoot: true,
        isSearchEnabled: false,
        reasoningMode: 'off',
        onBranch: onBranch
      },
      selected: true  // Auto-select new node
    };

    // Deselect all other nodes
    setNodes((nds) => [...nds.map(n => ({ ...n, selected: false })), newNode]);

    // Track for highlight effect
    setNewlyCreatedNodeId(id);
    setTimeout(() => setNewlyCreatedNodeId(null), 2100); // Clear after animation

    // Auto-focus on new node (with slight delay for smooth transition)
    setTimeout(() => {
      setCenter(newNode.position.x + 200, newNode.position.y + 200, {
        zoom: getZoom(),
        duration: 400
      });
    }, 100);
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
      },
      selected: true
    };

    setNodes((nds) => [...nds.map(n => ({ ...n, selected: false })), newNode]);
    setNewlyCreatedNodeId(id);
    setTimeout(() => setNewlyCreatedNodeId(null), 2100);

    setTimeout(() => {
      setCenter(newNode.position.x + 200, newNode.position.y + 200, {
        zoom: getZoom(),
        duration: 400
      });
    }, 100);
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
      },
      selected: true
    };

    setNodes((nds) => [...nds.map(n => ({ ...n, selected: false })), newNode]);
    setNewlyCreatedNodeId(id);
    setTimeout(() => setNewlyCreatedNodeId(null), 2100);

    setTimeout(() => {
      setCenter(newNode.position.x + 200, newNode.position.y + 150, {
        zoom: getZoom(),
        duration: 400
      });
    }, 100);
  };

  // Search functionality
  const handleSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results: Array<{ nodeId: string; type: string; content: string; field: string }> = [];

    nodes.forEach(node => {
      const nodeData = node.data;

      // Search in ChatNode
      if (node.type === 'chatNode') {
        const chatData = nodeData as ChatNodeData;
        if (chatData.inputText && String(chatData.inputText).toLowerCase().includes(lowerQuery)) {
          results.push({ nodeId: node.id, type: 'Chat', content: String(chatData.inputText).slice(0, 100), field: '问题' });
        }
        if (chatData.aiResponse && String(chatData.aiResponse).toLowerCase().includes(lowerQuery)) {
          results.push({ nodeId: node.id, type: 'Chat', content: String(chatData.aiResponse).slice(0, 100), field: '回答' });
        }
      }

      // Search in NoteNode
      if (node.type === 'noteNode') {
        const noteData = nodeData as NoteNodeData;
        if (noteData.content && String(noteData.content).toLowerCase().includes(lowerQuery)) {
          results.push({ nodeId: node.id, type: 'Note', content: String(noteData.content).slice(0, 100), field: '内容' });
        }
      }

      // Search in ResearchNode
      if (node.type === 'researchNode') {
        const researchData = nodeData as ResearchNodeData;
        if (researchData.query && String(researchData.query).toLowerCase().includes(lowerQuery)) {
          results.push({ nodeId: node.id, type: 'Research', content: String(researchData.query).slice(0, 100), field: '查询' });
        }
        if (researchData.answer && String(researchData.answer).toLowerCase().includes(lowerQuery)) {
          results.push({ nodeId: node.id, type: 'Research', content: String(researchData.answer).slice(0, 100), field: '答案' });
        }
      }
    });

    setSearchResults(results);
  }, [nodes]);

  // Navigate to search result
  const handleSearchResultClick = useCallback((nodeId: string) => {
    const node = getNode(nodeId);
    if (node) {
      setCenter(node.position.x + 200, node.position.y + 150, {
        zoom: getZoom(),
        duration: 400
      });
      // Select the node
      setNodes(nds => nds.map(n => ({ ...n, selected: n.id === nodeId })));
    }
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [getNode, setCenter, getZoom, setNodes]);

  // Keyboard shortcut for search (Cmd+F / Ctrl+F)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Save snapshot to history (debounced)
  const saveSnapshot = useCallback(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    if (historyDebounceRef.current) {
      clearTimeout(historyDebounceRef.current);
    }

    historyDebounceRef.current = setTimeout(() => {
      const currentNodes = getNodes();
      const currentEdges = getEdges();

      // Don't save if state is effectively empty
      if (currentNodes.length === 0) return;

      setHistory(prev => {
        // Remove any future states if we're in the middle of history
        const newHistory = prev.slice(0, historyIndex + 1);
        // Add current state
        newHistory.push({
          nodes: JSON.parse(JSON.stringify(currentNodes)),
          edges: JSON.parse(JSON.stringify(currentEdges))
        });
        // Limit history size to 50 entries
        if (newHistory.length > 50) {
          newHistory.shift();
          return newHistory;
        }
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
    }, 500);
  }, [getNodes, getEdges, historyIndex]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;

    isUndoRedoAction.current = true;
    const newIndex = historyIndex - 1;
    const prevState = history[newIndex];

    if (prevState) {
      // Restore nodes - callbacks will be added by existing useEffect
      setNodes(prevState.nodes as AppNode[]);
      setEdges(prevState.edges);
      setHistoryIndex(newIndex);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;

    isUndoRedoAction.current = true;
    const newIndex = historyIndex + 1;
    const nextState = history[newIndex];

    if (nextState) {
      // Restore nodes - callbacks will be added by existing useEffect
      setNodes(nextState.nodes as AppNode[]);
      setEdges(nextState.edges);
      setHistoryIndex(newIndex);
    }
  }, [history, historyIndex, setNodes, setEdges]);

  // Keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleUndoRedoKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleUndoRedoKey);
    return () => window.removeEventListener('keydown', handleUndoRedoKey);
  }, [handleUndo, handleRedo]);

  // Get nodes in the current branch (ancestors + descendants of focused node)
  const getNodesInBranch = useCallback((nodeId: string): Set<string> => {
    const branchNodes = new Set<string>();

    // Add the focused node itself
    branchNodes.add(nodeId);

    // Get ancestors (traverse up)
    let currentId = nodeId;
    while (true) {
      const parentEdge = edges.find(e => e.target === currentId);
      if (!parentEdge) break;
      branchNodes.add(parentEdge.source);
      currentId = parentEdge.source;
    }

    // Get descendants (traverse down using BFS)
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const childEdges = edges.filter(e => e.source === current);
      for (const edge of childEdges) {
        if (!branchNodes.has(edge.target)) {
          branchNodes.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    return branchNodes;
  }, [edges]);

  // Track selected node for focus mode
  React.useEffect(() => {
    const selectedNode = nodes.find(n => n.selected);
    if (selectedNode) {
      setFocusedNodeId(selectedNode.id);
    }
  }, [nodes]);

  // Keyboard shortcut for focus mode (F key)
  React.useEffect(() => {
    const handleFocusKey = (e: KeyboardEvent) => {
      // Only trigger if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'f' || e.key === 'F') {
        setFocusMode(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleFocusKey);
    return () => window.removeEventListener('keydown', handleFocusKey);
  }, []);

  // Calculate branch nodes for focus mode
  const branchNodeIds = React.useMemo(() => {
    if (!focusMode || !focusedNodeId) return new Set<string>();
    return getNodesInBranch(focusedNodeId);
  }, [focusMode, focusedNodeId, getNodesInBranch]);

  // Apply focus mode styles dynamically
  React.useEffect(() => {
    // Create or update style element
    let styleEl = document.getElementById('focus-mode-styles') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'focus-mode-styles';
      document.head.appendChild(styleEl);
    }

    if (focusMode && branchNodeIds.size > 0) {
      // Generate CSS to fade non-branch nodes
      const fadedNodeSelectors = nodes
        .filter(n => !branchNodeIds.has(n.id))
        .map(n => `.react-flow__node[data-id="${n.id}"]`)
        .join(', ');

      if (fadedNodeSelectors) {
        styleEl.textContent = `
          ${fadedNodeSelectors} {
            opacity: 0.25 !important;
            transition: opacity 0.3s ease;
          }
          .react-flow__node {
            transition: opacity 0.3s ease;
          }
        `;
      } else {
        styleEl.textContent = '';
      }
    } else {
      styleEl.textContent = '';
    }

    return () => {
      // Cleanup on unmount
      const el = document.getElementById('focus-mode-styles');
      if (el) el.textContent = '';
    };
  }, [focusMode, branchNodeIds, nodes]);

  // Save snapshots on node/edge changes
  React.useEffect(() => {
    saveSnapshot();
  }, [nodes, edges]);

  const handleStorageModeChange = useCallback(async (mode: StorageMode) => {
    console.log('[Storage] Changing storage mode to:', mode);

    if (mode === 'fileSystem' && !hasFileSystemAccess) {
      // Need to request access first
      const success = await fileSystemService.requestDirectoryAccess();
      if (success) {
        setHasFileSystemAccess(true);
        setStorageMode('fileSystem');
        localStorage.setItem('storageMode', 'fileSystem'); // Persist to localStorage
        console.log('[Storage] File system access granted and mode saved');
        // Save metadata
        await fileSystemService.saveMetadata({ activeCanvasId });
      } else {
        console.log('[Storage] File system access denied');
      }
    } else {
      setStorageMode(mode);
      localStorage.setItem('storageMode', mode); // Persist to localStorage
      console.log('[Storage] Storage mode saved:', mode);
    }
  }, [hasFileSystemAccess, activeCanvasId]);

  const handleRequestFileSystemAccess = useCallback(async () => {
    console.log('[Storage] Requesting file system access...');
    const success = await fileSystemService.requestDirectoryAccess();
    if (success) {
      setHasFileSystemAccess(true);
      setStorageMode('fileSystem');
      localStorage.setItem('storageMode', 'fileSystem'); // Persist to localStorage
      console.log('[Storage] File system enabled, migrating existing data...');
      // Optional: migrate existing data
      if (canvases.length > 0) {
        for (const canvas of canvases) {
          await fileSystemService.saveCanvas(canvas);
        }
        await fileSystemService.saveMetadata({ activeCanvasId });
        console.log('[Storage] Migrated', canvases.length, 'canvases to file system');
      }
    }
    return success;
  }, [canvases, activeCanvasId]);


  // Canvas Management Functions
  const saveCurrentCanvas = useCallback(() => {
    if (!activeCanvasId) return;

    const flow = toObject();
    setCanvases(prev => prev.map(canvas => {
      if (canvas.id === activeCanvasId) {
        const updatedCanvas = {
          ...canvas,
          nodes: flow.nodes as AppNode[],
          edges: flow.edges,
          viewport: flow.viewport || { x: 0, y: 0, zoom: 1 },
          updatedAt: Date.now()
        };

        // If using file system, save this canvas
        if (storageMode === 'fileSystem' && hasFileSystemAccess) {
          fileSystemService.saveCanvas(updatedCanvas).catch(err => {
            console.error('Failed to save canvas to file system:', err);
            setSaveStatus('error');
          });
        }

        return updatedCanvas;
      }
      return canvas;
    }));
  }, [activeCanvasId, toObject, storageMode, hasFileSystemAccess]);

  const handleNewCanvas = useCallback(() => {
    // Save current canvas before creating new one
    if (activeCanvasId) {
      saveCurrentCanvas();
    }

    const newCanvasId = `canvas-${Date.now()}`;
    const now = Date.now();

    const newCanvas: Canvas = {
      id: newCanvasId,
      title: `New Canvas - ${new Date().toLocaleTimeString()}`,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now
    };

    setCanvases(prev => [...prev, newCanvas]);
    setActiveCanvasId(newCanvasId);

    // Clear current view
    setNodes([]);
    setEdges([]);
    setViewport({ x: 0, y: 0, zoom: 1 });
  }, [activeCanvasId, saveCurrentCanvas, setNodes, setEdges, setViewport]);

  const handleSelectCanvas = useCallback((canvasId: string) => {
    if (canvasId === activeCanvasId) return;

    // Save current canvas state
    if (activeCanvasId) {
      saveCurrentCanvas();
    }

    // Load selected canvas
    const selectedCanvas = canvases.find(c => c.id === canvasId);
    if (selectedCanvas) {
      const restoredNodes = selectedCanvas.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onBranch: onBranch,
          onCollapse: onCollapse
        }
      })) as AppNode[];

      setNodes(restoredNodes);
      setEdges(selectedCanvas.edges);
      setViewport(selectedCanvas.viewport);
      setActiveCanvasId(canvasId);
    }
  }, [activeCanvasId, canvases, saveCurrentCanvas, setNodes, setEdges, setViewport]);

  const handleDeleteCanvas = useCallback((canvasId: string) => {
    if (canvases.length <= 1) {
      return; // Don't delete last canvas
    }

    setCanvases(prev => {
      const newCanvases = prev.filter(c => c.id !== canvasId);

      // If deleting the active canvas, switch to the first available canvas
      if (canvasId === activeCanvasId) {
        const newActiveCanvas = newCanvases[0];
        setActiveCanvasId(newActiveCanvas.id);

        // Load the new active canvas
        const restoredNodes = newActiveCanvas.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            onBranch: onBranch,
            onCollapse: onCollapse
          }
        })) as AppNode[];

        setNodes(restoredNodes);
        setEdges(newActiveCanvas.edges);
        setViewport(newActiveCanvas.viewport);
      }

      return newCanvases;
    });
  }, [canvases.length, activeCanvasId, setNodes, setEdges, setViewport]);

  const handleRenameCanvas = useCallback((canvasId: string, newTitle: string) => {
    setCanvases(prev => prev.map(canvas =>
      canvas.id === canvasId
        ? { ...canvas, title: newTitle, updatedAt: Date.now() }
        : canvas
    ));
  }, []);

  // Auto-title generation when root node gets first response
  React.useEffect(() => {
    if (!activeCanvasId || !canvases) return;

    const activeCanvas = canvases.find(c => c.id === activeCanvasId);
    if (!activeCanvas) return;

    // Check if title is still default and we haven't attempted generation for this canvas
    if (activeCanvas.title.startsWith('New Canvas') && !titleGenerationAttempted.has(activeCanvasId)) {
      // Find root node with AI response
      const rootNode = nodes.find(n => n.type === 'chatNode' && n.data.isRoot && n.data.aiResponse);

      if (rootNode && rootNode.type === 'chatNode') {
        const chatNodeData = rootNode.data as ChatNodeData;
        const conversationContent = `User: ${chatNodeData.inputText || ''}\nAI: ${chatNodeData.aiResponse || ''}`;

        // Mark as attempted to avoid multiple calls
        setTitleGenerationAttempted(prev => new Set(prev).add(activeCanvasId));

        // Generate title asynchronously
        generateCanvasTitle(conversationContent).then(title => {
          setCanvases(prev => prev.map(canvas => {
            if (canvas.id === activeCanvasId) {
              return { ...canvas, title, updatedAt: Date.now() };
            }
            return canvas;
          }));
        });
      }
    }
  }, [nodes, activeCanvasId, canvases, titleGenerationAttempted]);



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

      // Calculate position for new node based on actual node size
      const sourceNodeWidth = NODE_SIZES[sourceNode.type as keyof typeof NODE_SIZES]?.width || 412;
      const xOffset = sourceNodeWidth + 100; // Place to the right with 100px spacing

      const newPosition = {
        x: sourceNode.position.x + xOffset,
        y: sourceNode.position.y, // Align horizontally, no vertical offset
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

  // --- Load from localStorage on mount with migration ---
  const [isLoaded, setIsLoaded] = React.useState(false);
  React.useEffect(() => {
    if (isLoaded) return;

    const loadData = async () => {
      console.log('[Init] Starting data load...');

      // Load saved storage mode preference
      const savedMode = localStorage.getItem('storageMode') as StorageMode | null;
      console.log('[Init] Saved storage mode:', savedMode);

      // Check if file system access was previously granted
      if (fileSystemService.isSupported()) {
        const hasAccess = await fileSystemService.hasDirectoryAccess();
        setHasFileSystemAccess(hasAccess);
        console.log('[Init] File system access:', hasAccess);

        // If user had selected fileSystem mode and has access, try loading from it
        if (hasAccess && (savedMode === 'fileSystem' || savedMode === null)) {
          // Try loading from file system first
          try {
            const { canvases: fsCanvases, activeCanvasId: fsActiveId } = await fileSystemService.loadAllCanvases();

            if (fsCanvases.length > 0) {
              console.log('[Init] Loaded', fsCanvases.length, 'canvases from file system');
              setStorageMode('fileSystem');
              localStorage.setItem('storageMode', 'fileSystem');
              setCanvases(fsCanvases);
              setActiveCanvasId(fsActiveId || fsCanvases[0].id);

              // Load active canvas
              const activeCanvas = fsCanvases.find(c => c.id === (fsActiveId || fsCanvases[0].id));
              if (activeCanvas) {
                const restoredNodes = activeCanvas.nodes.map((node) => ({
                  ...node,
                  data: {
                    ...node.data,
                    onBranch: onBranch,
                    onCollapse: onCollapse
                  }
                }));
                setNodes(restoredNodes);
                setEdges(activeCanvas.edges || []);
                const { x = 0, y = 0, zoom = 1 } = activeCanvas.viewport || {};
                setViewport({ x, y, zoom });
              }
              setIsLoaded(true);
              return; // Successfully loaded from file system
            }
          } catch (error) {
            console.error('Failed to load from file system:', error);
            // Fall through to localStorage
          }
        }
      }

      // Fall back to localStorage (or if user explicitly chose localStorage mode)
      console.log('[Init] Loading from localStorage...');
      const savedCanvases = localStorage.getItem(STORAGE_KEY);
      if (savedCanvases) {
        try {
          const canvasListState = JSON.parse(savedCanvases);
          if (canvasListState && canvasListState.canvases && canvasListState.canvases.length > 0) {
            setCanvases(canvasListState.canvases);
            setActiveCanvasId(canvasListState.activeCanvasId);

            // Load active canvas
            const activeCanvas = canvasListState.canvases.find((c: Canvas) => c.id === canvasListState.activeCanvasId);
            if (activeCanvas) {
              const restoredNodes = activeCanvas.nodes.map((node: Node) => ({
                ...node,
                data: {
                  ...node.data,
                  onBranch: onBranch,
                  onCollapse: onCollapse
                }
              }));
              setNodes(restoredNodes);
              setEdges(activeCanvas.edges || []);
              const { x = 0, y = 0, zoom = 1 } = activeCanvas.viewport || {};
              setViewport({ x, y, zoom });
            }
            setIsLoaded(true);
            return;
          }
        } catch (error) {
          console.error('Failed to load new format from localStorage:', error);
        }
      }

      // Migration: Try loading old single-canvas format
      const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);
      if (oldSaved) {
        try {
          const flow = JSON.parse(oldSaved);
          if (flow && flow.nodes) {
            const migratedCanvasId = `canvas-${Date.now()}`;
            const now = Date.now();

            const migratedCanvas: Canvas = {
              id: migratedCanvasId,
              title: 'Migrated Canvas',
              nodes: flow.nodes as AppNode[],
              edges: flow.edges || [],
              viewport: flow.viewport || { x: 0, y: 0, zoom: 1 },
              createdAt: now,
              updatedAt: now
            };

            setCanvases([migratedCanvas]);
            setActiveCanvasId(migratedCanvasId);

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

            // Remove old storage key
            localStorage.removeItem(OLD_STORAGE_KEY);

            setIsLoaded(true);
            return;
          }
        } catch (error) {
          console.error('Failed to migrate from old format:', error);
        }
      }

      // No saved state, create initial canvas
      const initialCanvasId = `canvas-${Date.now()}`;
      const now = Date.now();
      const initialCanvas: Canvas = {
        id: initialCanvasId,
        title: `New Canvas - ${new Date().toLocaleTimeString()}`,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        createdAt: now,
        updatedAt: now
      };

      setCanvases([initialCanvas]);
      setActiveCanvasId(initialCanvasId);
      setIsLoaded(true);
    };

    loadData();
  }, [isLoaded, onBranch, onCollapse, setNodes, setEdges, setViewport]);

  // --- Save to localStorage on change ---
  React.useEffect(() => {
    if (!isLoaded || !activeCanvasId) return; // Don't save during initial load

    // Save current canvas state before persisting
    saveCurrentCanvas();
  }, [nodes, edges, isLoaded, activeCanvasId, saveCurrentCanvas]);

  // Save all canvases to localStorage whenever canvases array changes
  React.useEffect(() => {
    if (!isLoaded || canvases.length === 0) return;

    const canvasListState = {
      canvases,
      activeCanvasId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(canvasListState));
  }, [canvases, activeCanvasId, isLoaded]);

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

  // --- Save Functionality (Export All Canvases) ---
  const onSave = useCallback(() => {
    // Save current canvas state first
    if (activeCanvasId) {
      saveCurrentCanvas();
    }

    // Export all canvases
    const exportData = {
      version: '2.0', // Multi-canvas format
      canvases: canvases,
      activeCanvasId: activeCanvasId,
      exportedAt: new Date().toISOString()
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chat-tree-all-canvases-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [canvases, activeCanvasId, saveCurrentCanvas]);

  // --- Load Functionality (Import Multi-Canvas or Single Canvas) ---
  const onRestore = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== 'string') return;

      try {
        const importedData: any = JSON.parse(result);

        // Check if it's the new multi-canvas format (v2.0)
        if (importedData.version === '2.0' && importedData.canvases) {
          // Multi-canvas format - restore all canvases
          const importedCanvases = importedData.canvases as Canvas[];
          const importedActiveId = importedData.activeCanvasId as string;

          // Confirm with user before replacing all canvases
          const confirmed = confirm(
            `此文件包含 ${importedCanvases.length} 个画布。\n导入将替换所有当前画布。\n\n确定要继续吗？`
          );

          if (!confirmed) return;

          setCanvases(importedCanvases);
          setActiveCanvasId(importedActiveId);

          // Load the active canvas
          const activeCanvas = importedCanvases.find(c => c.id === importedActiveId);
          if (activeCanvas) {
            const restoredNodes = activeCanvas.nodes.map((node: any) => ({
              ...node,
              data: {
                ...node.data,
                onBranch: onBranch,
                onCollapse: onCollapse
              }
            })) as AppNode[];

            setNodes(restoredNodes);
            setEdges(activeCanvas.edges || []);
            const { x = 0, y = 0, zoom = 1 } = activeCanvas.viewport || {};
            setViewport({ x, y, zoom });
          }

          alert(`成功导入 ${importedCanvases.length} 个画布！`);
        } else if (importedData.nodes) {
          // Legacy single-canvas format - import as a new canvas
          const flow: ReactFlowJsonObject<AppNode> = importedData;

          const confirmed = confirm(
            '检测到旧版单画布格式。\n将作为新画布添加到列表中。\n\n确定要导入吗？'
          );

          if (!confirmed) return;

          const { x = 0, y = 0, zoom = 1 } = flow.viewport || {};

          // Restore node callbacks
          const restoredNodes = flow.nodes.map((node) => {
            if (node.type === 'chatNode' || node.type === 'researchNode' || node.type === 'noteNode') {
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

          // Create a new canvas from imported data
          const newCanvasId = `canvas-${Date.now()}`;
          const now = Date.now();
          const newCanvas: Canvas = {
            id: newCanvasId,
            title: `导入的画布 - ${new Date().toLocaleTimeString()}`,
            nodes: restoredNodes,
            edges: flow.edges || [],
            viewport: { x, y, zoom },
            createdAt: now,
            updatedAt: now
          };

          setCanvases(prev => [...prev, newCanvas]);
          setActiveCanvasId(newCanvasId);
          setNodes(restoredNodes);
          setEdges(flow.edges || []);
          setViewport({ x, y, zoom });

          alert('成功导入为新画布！');
        } else {
          alert('无效的文件格式');
        }
      } catch (error) {
        console.error('Failed to parse JSON:', error);
        alert('文件解析失败，请检查文件格式');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again
    event.target.value = '';
  }, [onBranch, onCollapse, setNodes, setEdges, setViewport, setCanvases, setActiveCanvasId]);

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };


  return (
    <div className="w-full h-screen flex bg-slate-50 relative font-sans">
      {/* Canvas List Sidebar */}
      <CanvasList
        canvases={canvases}
        activeCanvasId={activeCanvasId}
        isCollapsed={isCanvasListCollapsed}
        onToggleCollapse={() => setIsCanvasListCollapsed(!isCanvasListCollapsed)}
        onSelectCanvas={handleSelectCanvas}
        onDeleteCanvas={handleDeleteCanvas}
        onRenameCanvas={handleRenameCanvas}
        onNewCanvas={handleNewCanvas}
        storageMode={storageMode}
        fileSystemPath={fileSystemService.getDirectoryPath()}
      />

      {/* Main Canvas Area */}
      <div className="flex-1 relative">
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
          <MiniMap
            nodeColor={(node) => {
              switch (node.type) {
                case 'chatNode': return '#3b82f6';
                case 'researchNode': return '#8b5cf6';
                case 'noteNode': return '#f59e0b';
                default: return '#64748b';
              }
            }}
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-lg"
            style={{ width: 150, height: 100 }}
          />

          {/* Create Node Buttons */}
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <button
              onClick={handleAddChatNode}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-3 py-2 rounded-lg font-medium shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="flex items-center justify-center bg-white/20 p-1 rounded">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span>New Chat</span>
            </button>
            <button
              onClick={handleAddResearchNode}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-3 py-2 rounded-lg font-medium shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="flex items-center justify-center bg-white/20 p-1 rounded">
                <BookOpenIcon className="w-4 h-4" />
              </div>
              <span>New Research</span>
            </button>
            <button
              onClick={handleAddNoteNode}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white px-3 py-2 rounded-lg font-medium shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            >
              <div className="flex items-center justify-center bg-white/20 p-1 rounded">
                <FileText className="w-4 h-4" />
              </div>
              <span>New Note</span>
            </button>
          </div>

          <div className="absolute top-4 left-4 mt-14 z-50 flex gap-2">
            <button
              onClick={onClear}
              className="w-9 h-9 bg-white hover:bg-red-50 text-slate-700 hover:text-red-600 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="Clear Canvas"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`w-9 h-9 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors ${historyIndex <= 0 ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-50 text-slate-700'}`}
              title="Undo (⌘Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className={`w-9 h-9 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors ${historyIndex >= history.length - 1 ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-50 text-slate-700'}`}
              title="Redo (⌘⇧Z)"
            >
              <Redo2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                setIsSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
              className="w-9 h-9 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm border border-slate-200 flex items-center justify-center transition-colors"
              title="Search (⌘F)"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              onClick={() => setFocusMode(prev => !prev)}
              className={`w-9 h-9 rounded-lg shadow-sm border flex items-center justify-center transition-colors ${focusMode
                ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              title={`Focus Mode (F) - ${focusMode ? 'ON' : 'OFF'}`}
            >
              <Focus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsContextPanelOpen(prev => !prev)}
              className={`w-9 h-9 rounded-lg shadow-sm border flex items-center justify-center transition-colors ${isContextPanelOpen
                ? 'bg-green-500 text-white border-green-600 hover:bg-green-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              title="Context Panel"
            >
              <List className="w-5 h-5" />
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

        </ReactFlow>

        {/* Modern Chat Tree Logo */}
        <div className="absolute top-4 right-4 z-50">
          <div className="flex flex-col items-center gap-1 bg-white/80 backdrop-blur-md px-4 py-3 rounded-2xl shadow-lg border border-white/20 transition-all duration-300 hover:shadow-xl hover:bg-white/90">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <GitBranch className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-slate-800 text-sm">Chat Tree</span>
            </div>
            <p className="text-xs text-slate-500 italic">Infinite canvas for deep thinker</p>
          </div>
        </div>

        {/* Search Panel */}
        {isSearchOpen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-[500px] max-w-[90vw]">
            <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 p-3 border-b border-slate-100">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    handleSearch(e.target.value);
                  }}
                  placeholder="搜索节点内容... (Esc 关闭)"
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 placeholder:text-slate-400"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="p-1 hover:bg-slate-100 rounded"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="max-h-[300px] overflow-y-auto">
                  {searchResults.map((result, idx) => (
                    <button
                      key={`${result.nodeId}-${idx}`}
                      onClick={() => handleSearchResultClick(result.nodeId)}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b border-slate-50 last:border-none transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">
                          {result.type}
                        </span>
                        <span className="text-[10px] text-slate-400">{result.field}</span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{result.content}...</p>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery && searchResults.length === 0 && (
                <div className="p-4 text-center text-sm text-slate-400">
                  未找到匹配结果
                </div>
              )}
            </div>
          </div>
        )}


        <ContextPanel
          isOpen={isContextPanelOpen}
          onClose={() => setIsContextPanelOpen(false)}
          nodeId={focusedNodeId}
          nodes={nodes}
          edges={edges}
        />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          storageMode={storageMode}
          hasFileSystemAccess={hasFileSystemAccess}
          onStorageModeChange={handleStorageModeChange}
          onRequestFileSystemAccess={handleRequestFileSystemAccess}
          fileSystemPath={fileSystemService.getDirectoryPath()}
        />
      </div >
    </div >
  );
};

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}