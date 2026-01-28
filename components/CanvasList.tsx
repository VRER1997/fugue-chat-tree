import React from 'react';
import { ChevronLeft, ChevronRight, Trash2, FileText, Plus } from 'lucide-react';
import { Canvas } from '../types';

interface CanvasListProps {
    canvases: Canvas[];
    activeCanvasId: string;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onSelectCanvas: (canvasId: string) => void;
    onDeleteCanvas: (canvasId: string) => void;
    onRenameCanvas: (canvasId: string, newTitle: string) => void;
    onNewCanvas: () => void;
}

export const CanvasList: React.FC<CanvasListProps> = ({
    canvases,
    activeCanvasId,
    isCollapsed,
    onToggleCollapse,
    onSelectCanvas,
    onDeleteCanvas,
    onRenameCanvas,
    onNewCanvas
}) => {
    const [hoveredCanvasId, setHoveredCanvasId] = React.useState<string | null>(null);
    const [editingCanvasId, setEditingCanvasId] = React.useState<string | null>(null);
    const [editingTitle, setEditingTitle] = React.useState<string>('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const handleDelete = (e: React.MouseEvent, canvasId: string) => {
        e.stopPropagation(); // Prevent canvas selection

        if (canvases.length <= 1) {
            alert('Cannot delete the last canvas');
            return;
        }

        if (confirm('Are you sure you want to delete this canvas? This action cannot be undone.')) {
            onDeleteCanvas(canvasId);
        }
    };

    const handleStartEdit = (e: React.MouseEvent, canvas: Canvas) => {
        e.stopPropagation();
        setEditingCanvasId(canvas.id);
        setEditingTitle(canvas.title);
        // Focus input on next render
        setTimeout(() => inputRef.current?.select(), 0);
    };

    const handleSaveEdit = (canvasId: string) => {
        if (editingTitle.trim() && editingTitle !== canvases.find(c => c.id === canvasId)?.title) {
            onRenameCanvas(canvasId, editingTitle.trim());
        }
        setEditingCanvasId(null);
    };

    const handleCancelEdit = () => {
        setEditingCanvasId(null);
        setEditingTitle('');
    };

    const handleKeyDown = (e: React.KeyboardEvent, canvasId: string) => {
        if (e.key === 'Enter') {
            handleSaveEdit(canvasId);
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    // Auto-focus input when editing starts
    React.useEffect(() => {
        if (editingCanvasId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingCanvasId]);

    return (
        <div
            className={`relative bg-white border-r border-slate-200 flex flex-col transition-all duration-200 ease-in-out ${isCollapsed ? 'w-12' : 'w-[280px]'
                }`}
            style={{ height: '100vh' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
                {!isCollapsed && (
                    <h2 className="text-sm font-semibold text-slate-700">Canvases</h2>
                )}
                <div className="flex items-center gap-1">
                    {!isCollapsed && (
                        <button
                            onClick={onNewCanvas}
                            className="p-1.5 hover:bg-blue-50 rounded-md transition-colors text-blue-600 hover:text-blue-700"
                            title="New Canvas"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={onToggleCollapse}
                        className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"
                        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                        ) : (
                            <ChevronLeft className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* Canvas List */}
            <div className="flex-1 overflow-y-auto">
                {isCollapsed ? (
                    // Collapsed view - show icon-only items
                    <div className="flex flex-col gap-1 p-1">
                        {canvases.map((canvas) => (
                            <button
                                key={canvas.id}
                                onClick={() => onSelectCanvas(canvas.id)}
                                className={`w-full p-2 rounded-md transition-colors ${canvas.id === activeCanvasId
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'hover:bg-slate-100 text-slate-600'
                                    }`}
                                title={canvas.title}
                            >
                                <FileText className="w-5 h-5 mx-auto" />
                            </button>
                        ))}
                    </div>
                ) : (
                    // Expanded view - show full canvas items
                    <div className="flex flex-col">
                        {canvases.length === 0 ? (
                            <div className="p-4 text-center text-sm text-slate-500">
                                No canvases yet
                            </div>
                        ) : (
                            canvases.map((canvas, index) => (
                                <div
                                    key={canvas.id}
                                    onClick={() => onSelectCanvas(canvas.id)}
                                    onMouseEnter={() => setHoveredCanvasId(canvas.id)}
                                    onMouseLeave={() => setHoveredCanvasId(null)}
                                    className={`relative px-3 py-4 border-b border-slate-100 cursor-pointer transition-all duration-200 animate-fadeIn ${canvas.id === activeCanvasId
                                        ? 'bg-blue-50 border-l-4 border-l-blue-600 shadow-sm'
                                        : 'hover:bg-slate-50 hover:shadow-sm'
                                        }`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            {editingCanvasId === canvas.id ? (
                                                <input
                                                    ref={inputRef}
                                                    type="text"
                                                    value={editingTitle}
                                                    onChange={(e) => setEditingTitle(e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, canvas.id)}
                                                    onBlur={() => handleSaveEdit(canvas.id)}
                                                    className="w-full px-2 py-1 text-sm font-medium border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            ) : (
                                                <h3
                                                    onDoubleClick={(e) => handleStartEdit(e, canvas)}
                                                    className={`text-sm font-medium truncate cursor-text ${canvas.id === activeCanvasId
                                                        ? 'text-blue-900'
                                                        : 'text-slate-800'
                                                        }`}
                                                    title="Double-click to rename"
                                                >
                                                    {canvas.title}
                                                </h3>
                                            )}
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {formatDate(canvas.updatedAt)}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                {canvas.nodes.length} node{canvas.nodes.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>

                                        {/* Delete button - always visible with opacity */}
                                        <button
                                            onClick={(e) => handleDelete(e, canvas.id)}
                                            className={`p-1.5 hover:bg-red-100 rounded-md transition-all duration-200 flex-shrink-0 ${hoveredCanvasId === canvas.id
                                                ? 'text-red-600 opacity-100'
                                                : 'text-slate-400 opacity-40 hover:opacity-100'
                                                }`}
                                            title="Delete canvas"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
