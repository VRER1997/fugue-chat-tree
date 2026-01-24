import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NodeProps, useReactFlow, Handle, Position } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { BookOpen, AlertCircle, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Loader2, Globe, FileText, Send, GitFork, Trash2 } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { ResearchNodeData, ResearchStep, Source } from '../types';
import { executeDeepResearch } from '../services/research';

export const ResearchNode = ({ id, data, isConnectable, selected }: NodeProps<ResearchNodeData>) => {
    const { updateNodeData, deleteElements } = useReactFlow();

    // Local state handling often provides smoother updates for complex objects than useReactFlow hook alone
    const [query, setQuery] = useState(data.query || '');
    const [status, setStatus] = useState<ResearchNodeData['status']>(data.status || 'idle');
    const [steps, setSteps] = useState<ResearchStep[]>(data.steps || []);
    const [answer, setAnswer] = useState(data.answer || '');
    const [sources, setSources] = useState<Source[]>(data.sources || []);
    const [error, setError] = useState(data.error);

    // UI State
    const [isThinkingOpen, setIsThinkingOpen] = useState(true);
    const [isResponseCollapsed, setIsResponseCollapsed] = useState(false);
    const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);

    // Selection State
    const [showQuoteBtn, setShowQuoteBtn] = useState(false);
    const [selectedText, setSelectedText] = useState('');
    const answerRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Resizable functionality
    const [nodeSize, setNodeSize] = useState({
        width: data.width || 600,
        height: data.height || undefined // undefined = auto height
    });
    const [isResizing, setIsResizing] = useState(false);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = nodeSize.width;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newWidth = Math.max(400, startWidth + deltaX); // Min width 400px for research node

            setNodeSize({ width: newWidth, height: nodeSize.height });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            // Save size to node data
            updateNodeData(id, { width: nodeSize.width });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [nodeSize, id, updateNodeData]);


    // Sync prop changes (e.g. from JSON load) to local state
    useEffect(() => {
        if (data.status && data.status !== status) setStatus(data.status);
        if (data.steps && JSON.stringify(data.steps) !== JSON.stringify(steps)) setSteps(data.steps);
        if (data.answer && data.answer !== answer) setAnswer(data.answer);
        if (data.sources && JSON.stringify(data.sources) !== JSON.stringify(sources)) setSources(data.sources);
    }, [data]);

    // Handle Text Selection
    const handleSelection = useCallback(() => {
        const selection = window.getSelection();

        // Basic validation
        if (!selection || selection.isCollapsed || !answerRef.current) {
            setShowQuoteBtn(false);
            return;
        }

        // Check if selection is within our answer div
        if (!answerRef.current.contains(selection.anchorNode)) {
            setShowQuoteBtn(false);
            return;
        }

        const text = selection.toString().trim();
        if (text.length < 5) return;

        setSelectedText(text);
        setShowQuoteBtn(true);
    }, []);

    // Listen for selection changes inside the document
    useEffect(() => {
        document.addEventListener('selectionchange', handleSelection);
        return () => {
            document.removeEventListener('selectionchange', handleSelection);
        };
    }, [handleSelection]);

    const handleQuoteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        // Cast data to ResearchNodeData to ensure TS knows onBranch exists
        const nodeData = data as ResearchNodeData;
        if (selectedText && nodeData.onBranch) {
            nodeData.onBranch(selectedText, nodeData.id);
            window.getSelection()?.removeAllRanges();
            setShowQuoteBtn(false);
        }
    };

    const handleDelete = () => {
        // Explicitly remove connected edges to ensure cleanup
        const edges = useReactFlow().getEdges(); // Use getEdges from hook directly if needed, or destructured above
        const connectedEdges = edges.filter(edge => edge.source === id || edge.target === id);
        deleteElements({
            nodes: [{ id }],
            edges: connectedEdges
        });
    };

    const handleSearch = async () => {
        if (!query.trim()) return;

        setStatus('running');
        setSteps([]);
        setAnswer('');
        setSources([]);
        setError(undefined);
        setIsThinkingOpen(true);

        // Update Flow Data
        updateNodeData(id, {
            query,
            status: 'running',
            steps: [],
            answer: '',
            sources: []
        });

        await executeDeepResearch(query, {
            onStepUpdate: (updatedSteps) => {
                setSteps(updatedSteps);
                updateNodeData(id, { steps: updatedSteps });
            },
            onAnswerUpdate: (updatedAnswer) => {
                setAnswer(updatedAnswer);
                updateNodeData(id, { answer: updatedAnswer });
                // Auto-collapse thinking when answer starts streaming nicely
                if (updatedAnswer.length > 50 && isThinkingOpen) { // Keep thinking open for a bit
                    // Optional: could auto-collapse here
                }
            },
            onSourcesUpdate: (updatedSources) => {
                setSources(updatedSources);
                updateNodeData(id, { sources: updatedSources });
            },
            onError: (errMsg) => {
                setError(errMsg);
                setStatus('error');
                updateNodeData(id, { error: errMsg, status: 'error' });
            }
        });

        setStatus('completed');
        updateNodeData(id, { status: 'completed' });
        setIsThinkingOpen(false); // Collapse thinking on completion
    };

    return (
        <div
            ref={nodeRef}
            className={`flex flex-col bg-white rounded-xl shadow-xl border overflow-hidden font-sans transition-all duration-300 hover:shadow-2xl relative group ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'} ${isResizing ? 'select-none' : ''}`}
            style={{
                width: `${nodeSize.width}px`,
                height: nodeSize.height ? `${nodeSize.height}px` : 'auto',
                minHeight: '300px'
            }}
        >
            {/* Handles */}
            <Handle type="target" position={Position.Left} className="!bg-slate-300 !w-3 !h-3" isConnectable={isConnectable} />

            {/* Collapse Button - Positioned Above Source Handle */}
            <div className="absolute right-0 top-[30%] -translate-y-1/2 translate-x-[50%] flex flex-col items-center gap-1 z-50">
                {data.onCollapse && (
                    <button
                        onClick={() => data.onCollapse?.(data.id, !data.collapsed)}
                        className={`
                            w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-md border-2
                            ${data.collapsed
                                ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600 hover:shadow-lg'
                                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600'}
                        `}
                        title={data.collapsed ? `展开 ${data.collapsedCount} 个节点` : "折叠子节点"}
                    >
                        {data.collapsed ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        )}
                    </button>
                )}
                {data.collapsed && data.collapsedCount > 0 && (
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                        {data.collapsedCount}
                    </span>
                )}
            </div>
            <Handle type="source" position={Position.Right} className="!bg-slate-300 !w-3 !h-3" isConnectable={isConnectable} />

            {/* Top Right Controls */}
            <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {showQuoteBtn && (
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleQuoteClick}
                        className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors nodrag flex items-center gap-1 font-medium text-xs animate-in fade-in slide-in-from-top-1"
                        title="Branch from selected text"
                    >
                        <GitFork className="w-4 h-4" />
                        <span className="mr-1">Branch</span>
                    </button>
                )}
                {(answer || status === 'running') && (
                    <button
                        onClick={() => setIsResponseCollapsed(!isResponseCollapsed)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors nodrag"
                        title={isResponseCollapsed ? "Expand Response" : "Collapse Response"}
                    >
                        {isResponseCollapsed ? <ChevronsDown className="w-4 h-4" /> : <ChevronsUp className="w-4 h-4" />}
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors nodrag"
                    title="Delete Node"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>


            {/* Header */}
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600">
                    <BookOpen className="w-4 h-4" />
                </div>
                <div className="font-semibold text-slate-700">Deep Research</div>

            </div>

            {/* Content */}
            <div className="p-0">

                {/* Input Phase */}
                {status === 'idle' && (
                    <div className="p-6 flex flex-col gap-4">
                        <div className="text-sm text-slate-500">
                            Enter a topic to conduct a comprehensive academic analysis with citations.
                        </div>
                        <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="e.g., 'Impact of solid state batteries on EV market 2026'..."
                            rows={4}
                            className="w-full resize-none p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSearch();
                                }
                            }}
                        />
                        <button
                            onClick={handleSearch}
                            disabled={!query.trim()}
                            className="self-end bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium shadow-sm shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send className="w-4 h-4" />
                            Start Research
                        </button>
                    </div>
                )}

                {/* Research Running/Done View */}
                {status !== 'idle' && (
                    <div className="flex flex-col">

                        {/* Thinking / Status Section */}
                        <div className={`border-b border-slate-100 transition-all duration-300 ${!isThinkingOpen ? 'bg-white' : 'bg-slate-50/50'}`}>
                            <button
                                onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                                className="w-full flex items-center justify-between px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" /> : <BookOpen className="w-3.5 h-3.5" />}
                                    {status === 'running' ? 'Research in progress...' : 'Research complete'}
                                </div>
                                {isThinkingOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {isThinkingOpen && (
                                <div className="px-5 pb-4 space-y-3 animate-in slide-in-from-top-2 fade-in duration-200">
                                    {steps.map((step) => (
                                        <div key={step.id} className="flex items-center gap-3 text-sm">
                                            <div className={`
                         w-6 h-6 rounded-full flex items-center justify-center shrink-0 border
                         ${step.status === 'done' ? 'bg-green-100 border-green-200 text-green-600' :
                                                    step.status === 'running' ? 'bg-blue-100 border-blue-200 text-blue-600 animate-pulse' :
                                                        'bg-slate-100 border-slate-200 text-slate-400'}
                       `}>
                                                {step.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                                    step.status === 'done' ? <span className="text-[10px]">✓</span> :
                                                        <span className="text-[10px]">{step.id}</span>}
                                            </div>
                                            <span className={`${step.status === 'pending' ? 'text-slate-400' : 'text-slate-700'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    ))}
                                    {status === 'error' && (
                                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex gap-2 items-start border border-red-100">
                                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                            {error || 'An unknown error occurred.'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {answer && (
                            <div className="bg-white min-h-[150px] relative animate-in fade-in duration-500 border-t border-slate-100 relative">
                                <div className="absolute top-0 right-0 p-2 opacity-5 pointer-events-none">
                                    <BookOpen className="w-32 h-32" />
                                </div>

                                <div
                                    ref={answerRef}
                                    onWheel={(e) => e.stopPropagation()}
                                    className={`
                                        p-6 text-xs leading-normal text-slate-700 select-text cursor-text nodrag prose prose-slate max-w-none 
                                        prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-slate-800
                                        prose-p:leading-normal prose-p:text-slate-600
                                        prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                                        prose-strong:text-slate-900 prose-strong:font-semibold
                                        prose-ul:my-2 prose-li:my-0.5
                                        [&_.citation]:cursor-pointer [&_.citation]:text-blue-600 [&_.citation]:font-bold [&_.citation]:bg-blue-50 [&_.citation]:px-1 [&_.citation]:rounded
                                        transition-all duration-300 custom-scrollbar
                                        ${isResponseCollapsed ? 'max-h-72 overflow-y-auto' : 'max-h-[700px] overflow-y-auto'}
                                    `}
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkMath, remarkGfm]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            p: ({ children }) => {
                                                return <p>{children}</p>
                                            }
                                        }}
                                    >
                                        {answer}
                                    </ReactMarkdown>
                                </div>
                                {isResponseCollapsed && (
                                    <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
                                )}
                            </div>
                        )}

                        {/* Sources Grid */}
                        {sources.length > 0 && (
                            <div className="bg-slate-50 border-t border-slate-100 p-5">
                                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Globe className="w-3 h-3" />
                                    Sources
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {sources.map((source, idx) => (
                                        <a
                                            key={source.id}
                                            href={source.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`
                        group flex items-center gap-3 p-2 rounded-lg border bg-white transition-all
                        hover:border-blue-300 hover:shadow-md
                        ${highlightedSourceId === source.id ? 'ring-2 ring-blue-500 border-transparent shadow-lg scale-[1.02]' : 'border-slate-200'}
                      `}
                                            onMouseEnter={() => setHighlightedSourceId(source.id)}
                                            onMouseLeave={() => setHighlightedSourceId(null)}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                                                {source.favicon ? (
                                                    <img src={source.favicon} alt="" className="w-4 h-4 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                                                ) : (
                                                    <FileText className="w-4 h-4 text-slate-400" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                                                    {source.title}
                                                </div>
                                                <div className="text-[10px] text-slate-400 truncate">
                                                    {new URL(source.url).hostname}
                                                </div>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-300 group-hover:text-blue-300 w-5 text-right">
                                                #{idx + 1}
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={handleResizeStart}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-12 cursor-ew-resize opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity nodrag bg-slate-400 rounded-l-sm"
                title="拖拽调整宽度"
            />
        </div>
    );
};
