import React, { useState, useEffect } from 'react';
import { X, ChevronRight, MessageSquare, BookOpen, FileText } from 'lucide-react';
import { ChatNodeData, ResearchNodeData, NoteNodeData, AppNode } from '../types';
import { Edge } from '@xyflow/react';

interface ContextPanelProps {
    isOpen: boolean;
    onClose: () => void;
    nodeId: string | null;
    nodes: AppNode[];
    edges: Edge[];
}

interface ContextItem {
    id: string;
    type: 'chatNode' | 'researchNode' | 'noteNode';
    content: {
        input?: string;
        output?: string;
    };
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
    isOpen,
    onClose,
    nodeId,
    nodes,
    edges
}) => {
    const [contextChain, setContextChain] = useState<ContextItem[]>([]);
    const [estimatedTokens, setEstimatedTokens] = useState(0);

    // Build context chain when nodeId changes
    useEffect(() => {
        if (!nodeId) {
            setContextChain([]);
            setEstimatedTokens(0);
            return;
        }

        const chain: ContextItem[] = [];
        let currentId = nodeId;
        let totalChars = 0;

        // Traverse up to root
        while (true) {
            const node = nodes.find(n => n.id === currentId);
            if (!node) break;

            let item: ContextItem;

            if (node.type === 'chatNode') {
                const data = node.data as ChatNodeData;
                const input = data.inputText ? String(data.inputText) : '';
                const output = data.aiResponse ? String(data.aiResponse) : '';
                item = {
                    id: node.id,
                    type: 'chatNode',
                    content: {
                        input: data.quote ? `"${data.quote}"\n${input}` : input,
                        output
                    }
                };
                totalChars += input.length + output.length;
            } else if (node.type === 'researchNode') {
                const data = node.data as ResearchNodeData;
                item = {
                    id: node.id,
                    type: 'researchNode',
                    content: {
                        input: data.query || '',
                        output: data.answer || ''
                    }
                };
                totalChars += (data.query?.length || 0) + (data.answer?.length || 0);
            } else {
                const data = node.data as NoteNodeData;
                item = {
                    id: node.id,
                    type: 'noteNode',
                    content: {
                        input: data.content || ''
                    }
                };
                totalChars += (data.content?.length || 0);
            }

            chain.unshift(item);

            // Find parent
            const parentEdge = edges.find(e => e.target === currentId);
            if (!parentEdge) break;
            currentId = parentEdge.source;
        }

        setContextChain(chain);
        setEstimatedTokens(Math.ceil(totalChars / 3));
    }, [nodeId, nodes, edges]);

    if (!isOpen) return null;

    const getIcon = (type: string) => {
        switch (type) {
            case 'chatNode': return <MessageSquare className="w-4 h-4" />;
            case 'researchNode': return <BookOpen className="w-4 h-4" />;
            case 'noteNode': return <FileText className="w-4 h-4" />;
            default: return null;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'chatNode': return 'Chat';
            case 'researchNode': return 'Research';
            case 'noteNode': return 'Note';
            default: return '';
        }
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'chatNode': return 'bg-blue-100 text-blue-600';
            case 'researchNode': return 'bg-purple-100 text-purple-600';
            case 'noteNode': return 'bg-amber-100 text-amber-600';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    return (
        <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-2xl border-l border-slate-200 z-[100] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <div>
                    <h2 className="font-semibold text-slate-800">上下文视图</h2>
                    <p className="text-xs text-slate-400">AI 接收的完整对话历史</p>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>

            {/* Token estimate */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className="text-xs text-slate-500">预估 Token:</span>
                <span className={`text-xs font-medium ${estimatedTokens > 8000 ? 'text-red-500' : estimatedTokens > 4000 ? 'text-amber-500' : 'text-green-500'}`}>
                    {estimatedTokens.toLocaleString()}
                </span>
                {estimatedTokens > 8000 && (
                    <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">⚠️ 可能超限</span>
                )}
            </div>

            {/* Context chain */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {contextChain.length === 0 ? (
                    <div className="text-center text-slate-400 text-sm py-8">
                        选择一个节点查看上下文
                    </div>
                ) : (
                    contextChain.map((item, idx) => (
                        <div key={item.id} className="relative">
                            {/* Connector line */}
                            {idx < contextChain.length - 1 && (
                                <div className="absolute left-5 top-full w-0.5 h-3 bg-slate-200" />
                            )}

                            <div className={`rounded-lg border ${idx === contextChain.length - 1 ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                                {/* Item header */}
                                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                                    <span className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full ${getTypeColor(item.type)}`}>
                                        {getIcon(item.type)}
                                        {getTypeLabel(item.type)}
                                    </span>
                                    {idx === contextChain.length - 1 && (
                                        <span className="text-[10px] text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">当前</span>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="p-3 space-y-2">
                                    {item.content.input && (
                                        <div>
                                            <div className="text-[10px] text-slate-400 mb-1">输入</div>
                                            <div className="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-2 rounded">
                                                {item.content.input}
                                            </div>
                                        </div>
                                    )}
                                    {item.content.output && (
                                        <div>
                                            <div className="text-[10px] text-slate-400 mb-1">输出</div>
                                            <div className="text-xs text-slate-600 line-clamp-3 bg-green-50 p-2 rounded">
                                                {item.content.output}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
