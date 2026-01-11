import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import { MessageSquareQuote, Send, Sparkles, Trash2, ChevronsDown, ChevronsUp, GitFork } from 'lucide-react';
import OpenAI from 'openai';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { visit } from 'unist-util-visit';
import 'katex/dist/katex.min.css';
import { ChatNodeData } from '../types';

export const ChatNode = ({ id, data, isConnectable }: NodeProps<ChatNodeData>) => {
  const { deleteElements, updateNodeData, getNodes, getEdges } = useReactFlow();

  // Initialize state from data if available, to persist across re-renders/mounts
  const [inputText, setInputText] = useState((data.inputText as string) || '');
  const [response, setResponse] = useState<string | null>((data.aiResponse as string) || null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isResponseCollapsed, setIsResponseCollapsed] = useState(false);

  // Selection State
  const [showQuoteBtn, setShowQuoteBtn] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const responseRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Sync State with Data Props (Crucial for Loading from JSON)
  // When loading a new JSON, the 'data' prop updates, but the component might not unmount.
  // We need to sync the props to the local state.
  useEffect(() => {
    if (data.inputText !== undefined) {
      setInputText(prev => prev !== data.inputText ? (data.inputText as string) : prev);
    }
  }, [data.inputText]);

  useEffect(() => {
    if (data.aiResponse !== undefined) {
      setResponse(prev => prev !== data.aiResponse ? (data.aiResponse as string) : prev);
    }
  }, [data.aiResponse]);

  // Real AI generation
  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    setIsGenerating(true);
    setResponse(""); // Clear previous
    setIsResponseCollapsed(false); // Auto expand on new generation
    setShowQuoteBtn(false);

    // Sync input text to node data for future context
    updateNodeData(id, { inputText: inputText });

    try {
      const storedKey = localStorage.getItem('gemini_api_key');
      const apiKey = storedKey || process.env.API_KEY || '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';

      const storedModel = localStorage.getItem('gemini_model_name');
      const modelName = storedModel || 'z-ai/glm-4.5-air:free';

      const storedUrl = localStorage.getItem('gemini_api_url');
      const apiUrl = storedUrl || 'https://openrouter.ai/api/v1';

      // Initialize OpenAI Client
      // Note: "dangerouslyAllowBrowser: true" is required because we are calling from frontend.
      // In production, you should call a backend proxy.
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiUrl,
        dangerouslyAllowBrowser: true
      });

      // 1. Traverse ancestors to build context history
      const nodes = getNodes();
      const edges = getEdges();
      const ancestorChain: ChatNodeData[] = [];
      let currentId = id;

      while (true) {
        const parentEdge = edges.find(e => e.target === currentId);
        if (!parentEdge) break;
        const parentNode = nodes.find(n => n.id === parentEdge.source);
        if (!parentNode) break;

        ancestorChain.unshift(parentNode.data); // Add to beginning
        currentId = parentNode.id;
      }

      // 2. Format history for OpenAI
      const historyMessages: any[] = ancestorChain.flatMap(node => {
        const msgs = [];

        // User turn
        if (node.inputText) {
          let text = node.inputText as string;
          if (node.quote) {
            text = `Regarding the text "${node.quote}":\n${text}`;
          }
          msgs.push({ role: 'user', content: text });
        }

        // Assistant turn (was 'model' in Gemini)
        if (node.aiResponse) {
          msgs.push({ role: 'assistant', content: node.aiResponse as string });
        }
        return msgs;
      });

      // 3. Current turn
      const currentPromptText = data.quote
        ? `Regarding the text "${data.quote}":\n${inputText}`
        : inputText;

      const messages = [
        { role: 'system', content: "You are an expert researcher. Guidelines:\nBe Direct: Start the answer immediately. No filler phrases like 'Here is the answer' or 'That's a great question'.\nHigh Density: Use bullet points and bold text for key concepts.\nNo Repetition: Do not repeat the user's question or the quoted context.\nConcise: Keep the response under 200 words unless explicitly asked for a long explanation.\nContext Aware: Since the user quoted specific text, focus ONLY on that specific part, do not explain the whole concept again.\nLanguage: Respond in the same language as the user's question." },
        ...historyMessages,
        { role: 'user', content: currentPromptText }
      ];

      const stream = await openai.chat.completions.create({
        model: modelName,
        messages: messages,
        stream: true,
      });

      let fullText = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          setResponse(fullText);
        }
      }

      // Sync response to node data
      updateNodeData(id, { aiResponse: fullText });

    } catch (error) {
      console.error("AI Error:", error);
      setResponse("Error generating response. Please check your API key and configuration.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Sync draft text on blur
  const handleBlur = () => {
    updateNodeData(id, { inputText: inputText });
  };

  // Handle Text Selection
  const handleSelection = useCallback(() => {
    const selection = window.getSelection();

    // Basic validation
    if (!selection || selection.isCollapsed || !responseRef.current) {
      setShowQuoteBtn(false);
      return;
    }

    // Check if selection is within our response div
    if (!responseRef.current.contains(selection.anchorNode)) {
      setShowQuoteBtn(false);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 5) { // Minimum length constraint
      setShowQuoteBtn(false);
      return;
    }

    setSelectedText(text);
    // Button is now in the header, so we just set state to show it
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
    e.stopPropagation(); // Prevent drag start on node
    e.preventDefault();
    if (selectedText && data.onBranch) {
      data.onBranch(selectedText, data.id);

      // Clear selection
      window.getSelection()?.removeAllRanges();
      setShowQuoteBtn(false);
    }
  };

  const handleDelete = () => {
    deleteElements({ nodes: [{ id }] });
  };

  return (
    <div
      ref={nodeRef}
      className="bg-white rounded-xl shadow-lg border border-slate-200 w-[412px] overflow-hidden flex flex-col transition-shadow duration-200 hover:shadow-xl relative group"
    >
      {/* Target Handle (Input) - Not for root */}
      {!data.isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={isConnectable}
          className="w-3 h-3 bg-slate-400"
        />
      )}

      {/* Top Right Controls */}
      <div className="absolute top-2 right-2 flex gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">

        {/* Branch Button (Only when text selected in this node) */}
        {showQuoteBtn && (
          <button
            onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
            onClick={handleQuoteClick}
            className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors nodrag flex items-center gap-1 font-medium text-xs animate-in fade-in slide-in-from-top-1"
            title="Branch from selected text"
          >
            <GitFork className="w-4 h-4" />
            <span className="mr-1">Branch</span>
          </button>
        )}

        {/* Collapse/Expand Button (Only when response exists) */}
        {(response || isGenerating) && (
          <button
            onClick={() => setIsResponseCollapsed(!isResponseCollapsed)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors nodrag"
            title={isResponseCollapsed ? "Expand Response" : "Collapse Response"}
          >
            {isResponseCollapsed ? <ChevronsDown className="w-4 h-4" /> : <ChevronsUp className="w-4 h-4" />}
          </button>
        )}

        {/* Delete Button (Not for root) */}
        {!data.isRoot && (
          <button
            onClick={handleDelete}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors nodrag"
            title="Delete Node"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Header: Quote Section (if exists) */}
      {data.quote && (
        <div className="bg-slate-50 p-3 pr-24 border-b border-slate-100 flex gap-2 items-start text-xs text-slate-600 italic">
          <MessageSquareQuote className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div className="line-clamp-3">"{data.quote}"</div>
        </div>
      )}

      {/* Body: Input Section */}
      <div className="p-4 flex flex-col gap-3">
        <textarea
          className="w-full resize-none bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 nodrag"
          rows={3}
          placeholder={data.isRoot ? "Start a conversation..." : "Ask follow up..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              if (e.nativeEvent.isComposing) return;
              e.preventDefault();
              handleGenerate();
            }
          }}
        />
        <button
          onClick={handleGenerate}
          disabled={!inputText.trim() || isGenerating}
          className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${inputText.trim() && !isGenerating
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            } nodrag`}
        >
          {isGenerating ? (
            <Sparkles className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {isGenerating ? 'Generating...' : 'Generate Answer'}
        </button>
      </div>

      {/* Footer: Response Section */}
      {(response || isGenerating) && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 relative">
          <div
            ref={responseRef}
            onWheel={(e) => e.stopPropagation()}
            className={`text-xs leading-normal text-slate-700 select-text cursor-text nodrag transition-all duration-300 ${isResponseCollapsed
              ? 'max-h-72 overflow-y-auto custom-scrollbar'
              : 'max-h-[700px] overflow-y-auto custom-scrollbar'
              }`}
          >
            <ReactMarkdown
              className="prose prose-slate max-w-none text-xs [&_p]:leading-normal"
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[
                rehypeKatex,
                () => (tree) => {
                  if (!data.highlights || data.highlights.length === 0) return;
                  // console.log("Rendering ChatNode with highlights:", data.highlights);
                  visit(tree, 'text', (node, index, parent) => {
                    if (!parent || !node.value) return;
                    let text = node.value;
                    // console.log("Visiting text node:", text);
                    let hasHighlight = false;
                    const ranges: { start: number, end: number }[] = [];

                    // Simple check for highlighting
                    // This is a naive implementation; for production robust substring matching is needed.
                    // Here we handle exact string matches in text nodes.
                    data.highlights?.forEach(h => {
                      if (text.includes(h)) {
                        hasHighlight = true;
                        // We are not strictly splitting nodes here for simplicity in this edit, 
                        // just wrapping the *whole* text node if it exactly matches or we rely on 'rehype-react' style replacements which is harder.
                        // Better approach for simple substring highlight in rehype:
                        // We will replace the text node with a span if it contains highlight? No, that breaks partials.
                      }
                    });

                    // Actually, a safer way for ReactMarkdown without writing complex AST transformations manually 
                    // is to use a library or just rely on the fact that these are specific quotes.
                    // Let's implement a simpler AST transform:
                    if (!data.highlights) return;

                    // We will look for ONE match to keep it simple and avoid infinite loops or complex overlaps
                    for (const highlight of data.highlights) {
                      const idx = text.indexOf(highlight);
                      if (idx !== -1) {
                        const before = text.slice(0, idx);
                        const match = text.slice(idx, idx + highlight.length);
                        const after = text.slice(idx + highlight.length);

                        const newNodes: any[] = [];
                        if (before) newNodes.push({ type: 'text', value: before });
                        newNodes.push({
                          type: 'element',
                          tagName: 'span',
                          properties: { className: 'bg-yellow-200 dark:bg-yellow-800' },
                          children: [{ type: 'text', value: match }]
                        });
                        if (after) newNodes.push({ type: 'text', value: after });

                        parent.children.splice(index, 1, ...newNodes);
                        return; // Stop after first match to be safe
                      }
                    }
                  });
                }
              ]}
            >
              {response}
            </ReactMarkdown>
          </div>

          {/* Gradient Overlay when collapsed */}
          {isResponseCollapsed && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
          )}
        </div>
      )}

      {/* Source Handle (Output) */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-slate-400"
      />
    </div>
  );
};