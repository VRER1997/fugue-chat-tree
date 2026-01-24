import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import { FileText, Trash2, GitFork } from 'lucide-react';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { NoteNodeData } from '../types';

export const NoteNode = ({ id, data, isConnectable, selected }: NodeProps<NoteNodeData>) => {
    const { deleteElements, updateNodeData, getEdges } = useReactFlow();

    const [content, setContent] = useState(data.content || '');
    const [showQuoteBtn, setShowQuoteBtn] = useState(false);
    const [selectedText, setSelectedText] = useState('');

    const contentRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Resizable functionality
    const [nodeSize, setNodeSize] = useState({
        width: data.width || 500,
        height: data.height || undefined
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
            const newWidth = Math.max(300, startWidth + deltaX);

            setNodeSize({ width: newWidth, height: nodeSize.height });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            updateNodeData(id, { width: nodeSize.width });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [nodeSize, id, updateNodeData]);

    // Sync content with data
    useEffect(() => {
        if (data.content !== undefined && data.content !== content) {
            setContent(data.content);
        }
    }, [data.content]);

    // Save content to node data
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setContent(newContent);
        updateNodeData(id, { content: newContent });
    };

    // Text selection and quote functionality
    const handleTextSelection = useCallback(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (text && contentRef.current?.contains(selection.anchorNode || null)) {
            setSelectedText(text);
            setShowQuoteBtn(true);
        } else {
            setShowQuoteBtn(false);
            setSelectedText('');
        }
    }, []);

    useEffect(() => {
        document.addEventListener('selectionchange', handleTextSelection);
        return () => document.removeEventListener('selectionchange', handleTextSelection);
    }, [handleTextSelection]);

    // Branch from selected text
    const handleQuoteClick = () => {
        if (selectedText && data.onBranch) {
            data.onBranch(selectedText, id);
            setShowQuoteBtn(false);
            setSelectedText('');
            window.getSelection()?.removeAllRanges();
        }
    };

    // Delete functionality
    const handleDelete = () => {
        const edges = getEdges();
        const connectedEdges = edges.filter(edge => edge.source === id || edge.target === id);
        deleteElements({
            nodes: [{ id }],
            edges: connectedEdges
        });
    };

    return (
        <div
            ref={nodeRef}
            className={`bg-white rounded-xl shadow-lg border flex flex-col transition-all duration-200 hover:shadow-xl relative group ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'} ${isResizing ? 'select-none' : ''}`}
            style={{
                width: `${nodeSize.width}px`,
                height: nodeSize.height ? `${nodeSize.height}px` : 'auto',
                minHeight: '200px'
            }}
        >
            {/* Target Handle */}
            <Handle
                type="target"
                position={Position.Left}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-slate-400"
            />

            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
                <FileText className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-slate-700">Note</span>
            </div>

            {/* Top Right Controls */}
            <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {showQuoteBtn && (
                    <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleQuoteClick}
                        className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors nodrag flex items-center gap-1 font-medium text-xs animate-in fade-in slide-in-from-top-1"
                        title="Branch from selected text"
                    >
                        <GitFork className="w-3 h-3" />
                        Branch
                    </button>
                )}
                <button
                    onClick={handleDelete}
                    className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors nodrag"
                    title="Delete note"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>

            {/* Content Area */}
            <div
                className="flex-1 overflow-auto p-4"
                onWheel={(e) => {
                    const element = e.currentTarget;
                    const hasScrollbar = element.scrollHeight > element.clientHeight;

                    if (!hasScrollbar) {
                        // No scrollbar, allow canvas panning
                        return;
                    }

                    // Check if at scroll boundary
                    const isScrollingDown = e.deltaY > 0;
                    const isAtTop = element.scrollTop === 0;
                    const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;

                    // Only stop propagation if we're scrolling within bounds
                    if ((isScrollingDown && !isAtBottom) || (!isScrollingDown && !isAtTop)) {
                        e.stopPropagation();
                    }
                }}
            >
                {/* Textarea for editing */}
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleContentChange}
                    placeholder="Write your notes here... (supports Markdown)"
                    className="w-full min-h-[150px] p-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none font-sans text-sm text-slate-700 leading-relaxed"
                    style={{ height: 'auto' }}
                />

                {/* Markdown Preview */}
                {content && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="text-xs font-semibold text-slate-400 mb-2">PREVIEW</div>
                        <div
                            ref={contentRef}
                            className="prose prose-sm max-w-none prose-slate prose-headings:text-slate-800 prose-p:text-slate-600 prose-a:text-blue-600 prose-code:text-pink-600 prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200"
                        >
                            <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                            >
                                {content}
                            </ReactMarkdown>
                        </div>
                    </div>
                )}
            </div>

            {/* Collapse Button */}
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
                {data.collapsed && data.collapsedCount && data.collapsedCount > 0 && (
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                        {data.collapsedCount}
                    </span>
                )}
            </div>

            {/* Source Handle */}
            <Handle
                type="source"
                position={Position.Right}
                isConnectable={isConnectable}
                className="w-3 h-3 bg-slate-400"
            />

            {/* Resize Handle */}
            <div
                onMouseDown={handleResizeStart}
                className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-12 cursor-ew-resize opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity nodrag bg-slate-400 rounded-l-sm"
                title="拖拽调整宽度"
            />
        </div>
    );
};
