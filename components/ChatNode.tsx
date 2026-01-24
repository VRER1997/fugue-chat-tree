import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Handle, Position, NodeProps, useReactFlow } from '@xyflow/react';
import { MessageSquareQuote, Send, Sparkles, Trash2, ChevronsDown, ChevronsUp, GitFork, Globe, Brain } from 'lucide-react';
import OpenAI from 'openai';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { visit } from 'unist-util-visit';
import 'katex/dist/katex.min.css';
import { ChatNodeData, ResearchNodeData } from '../types';

export const ChatNode = ({ id, data, isConnectable, selected }: NodeProps<ChatNodeData>) => {
  const { deleteElements, updateNodeData, getNodes, getEdges } = useReactFlow();

  // Initialize state from data if available, to persist across re-renders/mounts
  const [inputText, setInputText] = useState((data.inputText as string) || '');
  const [response, setResponse] = useState<string | null>((data.aiResponse as string) || null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isResponseCollapsed, setIsResponseCollapsed] = useState(false);
  const [isSearchEnabled, setIsSearchEnabled] = useState(data.isSearchEnabled || false);
  const [reasoningMode, setReasoningMode] = useState<NonNullable<ChatNodeData['reasoningMode']>>((data.reasoningMode as any) || 'off');
  const [showReasoningMenu, setShowReasoningMenu] = useState(false);

  // Selection State
  const [showQuoteBtn, setShowQuoteBtn] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const responseRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const reasoningMenuRef = useRef<HTMLDivElement>(null);
  const reasoningToggleRef = useRef<HTMLButtonElement>(null);

  // Resizable functionality
  const [nodeSize, setNodeSize] = useState({
    width: data.width || 412,
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
      const newWidth = Math.max(300, startWidth + deltaX); // Min width 300px

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


  // Sync State with Data Props (Crucial for Loading from JSON)
  useEffect(() => {
    if (data.reasoningMode !== undefined) {
      setReasoningMode(prev => prev !== data.reasoningMode ? (data.reasoningMode as any) : prev);
    }
  }, [data.reasoningMode]);

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

  // Handle click outside reasoning menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showReasoningMenu &&
        reasoningMenuRef.current &&
        !reasoningMenuRef.current.contains(event.target as Node) &&
        reasoningToggleRef.current &&
        !reasoningToggleRef.current.contains(event.target as Node)
      ) {
        setShowReasoningMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showReasoningMenu]);

  // Real AI generation
  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    setIsGenerating(true);
    setResponse(""); // Clear previous
    setIsResponseCollapsed(false); // Auto expand on new generation
    setShowQuoteBtn(false);

    // Sync input text to node data for future context
    updateNodeData(id, {
      inputText: inputText,
      reasoningMode: reasoningMode,
      isSearchEnabled: isSearchEnabled
    });

    try {
      const storedKey = localStorage.getItem('gemini_api_key');
      const apiKey = storedKey || import.meta.env.VITE_GEMINI_API_KEY;

      const storedModel = localStorage.getItem('gemini_model_name');
      const modelName = storedModel || import.meta.env.VITE_GEMINI_MODEL_NAME;

      const storedUrl = localStorage.getItem('gemini_api_url');
      const apiUrl = storedUrl || import.meta.env.VITE_GEMINI_API_URL;

      // Initialize OpenAI Client
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiUrl,
        dangerouslyAllowBrowser: true
      });

      // 1. Traverse ancestors to build context history
      // We need to typecase broadly to support both node types for traversal
      const nodes = getNodes();
      const edges = getEdges();
      const ancestorChain: (ChatNodeData | ResearchNodeData)[] = [];
      let currentId = id;

      while (true) {
        const parentEdge = edges.find(e => e.target === currentId);
        if (!parentEdge) break;
        const parentNode = nodes.find(n => n.id === parentEdge.source);
        if (!parentNode) break;

        // Add to beginning of list to maintain chronological order later via unshift
        ancestorChain.unshift(parentNode.data as (ChatNodeData | ResearchNodeData));
        currentId = parentNode.id;
      }

      // 2. Format history for OpenAI
      const historyMessages: any[] = ancestorChain.flatMap(node => {
        const msgs = [];

        // Check if it's a Research Node (has 'query' and 'answer' instead of 'inputText' and 'aiResponse')
        if ('query' in node && 'answer' in node) {
          const researchNode = node as ResearchNodeData;
          // Research Query -> User
          if (researchNode.query) {
            msgs.push({ role: 'user', content: researchNode.query });
          }
          // Research Answer -> Assistant
          if (researchNode.answer) {
            msgs.push({ role: 'assistant', content: researchNode.answer });
          }
        } else {
          // Chat Node
          const chatNode = node as ChatNodeData;
          // User turn
          if (chatNode.inputText) {
            let text = chatNode.inputText as string;
            if (chatNode.quote) {
              text = `Regarding the text "${chatNode.quote}":\n${text}`;
            }
            msgs.push({ role: 'user', content: text });
          }

          // Assistant turn
          if (chatNode.aiResponse) {
            msgs.push({ role: 'assistant', content: chatNode.aiResponse as string });
          }
        }
        return msgs;
      });

      // 3. Current turn
      const currentPromptText = data.quote
        ? `Regarding the text "${data.quote}":\n${inputText}`
        : inputText;

      let systemPrompt = "You are an expert researcher. Guidelines:\nBe Direct: Start the answer immediately. No filler phrases like 'Here is the answer' or 'That's a great question'.\nHigh Density: Use bullet points and bold text for key concepts.\nNo Repetition: Do not repeat the user's question or the quoted context.\nConcise: Keep the response under 200 words unless explicitly asked for a long explanation.\nContext Aware: Since the user quoted specific text, focus ONLY on that specific part, do not explain the whole concept again.\nLanguage: Respond in the same language as the user's question.";

      if (isSearchEnabled) {
        systemPrompt += `\n\nCRITICAL: You MUST perform an online internet search to answer this request with the latest, real-time information. Do not rely solely on your internal training data.\nCurrent Date and Time: ${new Date().toLocaleString()}`;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: currentPromptText }
      ];

      // Prepare completion params
      const completionParams: any = {
        model: modelName,
        messages: messages,
        stream: true,
      };

      // Add Reasoning Parameters (Simulated via extra_body for OpenRouter/DeepSeek/etc)
      if (reasoningMode !== 'off') {
        const budgetMap = {
          'light': 1024,
          'medium': 4096,
          'heavy': 16384,
          'auto': 0 // 0 might mean auto or let provider decide
        };

        const budget = budgetMap[reasoningMode];

        if (!completionParams.extra_body) completionParams.extra_body = {};

        if (reasoningMode === 'auto') {
          completionParams.extra_body = {
            ...completionParams.extra_body,
            include_reasoning: true
          };
        } else {
          completionParams.extra_body = {
            ...completionParams.extra_body,
            top_k: 50, // Example param
            thinking: {
              budget: budget,
              type: "enabled"
            },
            include_reasoning: true
          };
        }
      }

      // Add Gemini-specific search tool if search is enabled
      if (isSearchEnabled) {
        completionParams.tools = [{
          type: 'function',
          function: {
            name: 'web_search',
            description: 'Search the internet using Bing Search',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query to find the latest information'
                }
              },
              required: ['query']
            }
          }
        }];
        completionParams.tool_choice = 'auto';
      }

      const stream = await openai.chat.completions.create(completionParams) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      let fullText = "";
      let toolCallArgs = "";
      let toolCallName = "";
      let toolCallId = "";
      let isToolCall = false;

      for await (const chunk of stream) {
        // Handle Content
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          setResponse(fullText);
        }

        // Handle Tool Calls (Accumulate args)
        const toolCalls = chunk.choices[0]?.delta?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          isToolCall = true;
          const toolCall = toolCalls[0];
          if (toolCall.id) toolCallId = toolCall.id;
          if (toolCall.function?.name) toolCallName = toolCall.function.name;
          if (toolCall.function?.arguments) toolCallArgs += toolCall.function.arguments;
        }

        // Handle Finish (Execute Tool if needed)
        if (chunk.choices[0]?.finish_reason === 'tool_calls' || (isToolCall && chunk.choices[0]?.finish_reason === 'stop')) {
          setResponse(fullText + "\n\n*Searching online...*");

          // Execute Client-Side Search
          console.log(`Executing Tool: ${toolCallName} with args: ${toolCallArgs}`);

          let searchResult = "Unconfigured Search Provider.";
          try {
            const args = JSON.parse(toolCallArgs);
            const query = args.query || args.q || "latest info";
            const serperKey = localStorage.getItem('serper_api_key') || import.meta.env.VITE_SERPER_API_KEY;

            if (serperKey) {
              setResponse(fullText + `\n\n*Searching Google for "${query}"...*`);
              // Call Serper.dev API
              const myHeaders = new Headers();
              myHeaders.append("X-API-KEY", serperKey);
              myHeaders.append("Content-Type", "application/json");

              const raw = JSON.stringify({
                "q": query
              });

              const requestOptions: any = {
                method: 'POST',
                headers: myHeaders,
                body: raw,
                redirect: 'follow'
              };

              const response = await fetch("https://google.serper.dev/search", requestOptions);
              const result = await response.json();

              // Format results for AI
              if (result.organic) {
                searchResult = `Search Results for "${query}":\n` +
                  result.organic.slice(0, 5).map((item: any, index: number) =>
                    `${index + 1}. [${item.title}](${item.link}): ${item.snippet}`
                  ).join('\n');
              } else {
                searchResult = `No results found for "${query}".`;
              }

            } else {
              // Fallback to Mock if no key
              searchResult = `[SYSTEM MESSAGE]: This is a simulated search result. Real search is disabled because no 'Serper API Key' was found in settings.
Current System Time: ${new Date().toLocaleString()}
User Query: "${query}"

INSTRUCTIONS:
1. Inform the user that they need to add a "Serper API Key" in Settings to enable real internet search.
2. Answering based on your internal knowledge only.`;
            }

          } catch (e) {
            console.error("Tool Execution Error", e);
            searchResult = `Error executing search: ${e}`;
          }

          // Append Tool Result to History
          const newMessages = [
            ...messages,
            {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: toolCallId || "call_" + Math.random().toString(36).substr(2, 9),
                type: 'function',
                function: {
                  name: toolCallName || "web_search",
                  arguments: toolCallArgs
                }
              }]
            },
            {
              role: 'tool',
              tool_call_id: toolCallId || "call_" + Math.random().toString(36).substr(2, 9),
              name: toolCallName || "bing_search",
              content: searchResult
            }
          ];

          // Second Call: Get Final Answer
          const secondStream = await openai.chat.completions.create({
            model: modelName,
            messages: newMessages,
            stream: true
          }) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

          for await (const chunk2 of secondStream) {
            const content2 = chunk2.choices[0]?.delta?.content || "";
            if (content2) {
              fullText += content2;
              setResponse(fullText);
            }
          }
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
    if (selectedText && data.onBranch) {
      data.onBranch(selectedText, data.id);
      window.getSelection()?.removeAllRanges();
      setShowQuoteBtn(false);
    }
  };

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
      {/* Target Handle (Input) - Not for root */}
      {/* Target Handle (Input) */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-slate-400"
      />

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

        {(response || isGenerating) && (
          <button
            onClick={() => setIsResponseCollapsed(!isResponseCollapsed)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors nodrag"
            title={isResponseCollapsed ? "Expand Response" : "Collapse Response"}
          >
            {isResponseCollapsed ? <ChevronsDown className="w-4 h-4" /> : <ChevronsUp className="w-4 h-4" />}
          </button>
        )}

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
        <div className="bg-slate-50 p-3 pr-24 border-b border-slate-100 flex gap-2 items-start text-xs text-slate-600 italic rounded-t-xl">
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
        <div className="flex gap-2 items-center relative">
          {/* Reasoning Menu */}
          {showReasoningMenu && (
            <div
              ref={reasoningMenuRef}
              className="absolute bottom-12 left-0 bg-white border border-slate-200 shadow-xl rounded-lg p-0.5 flex flex-col w-28 z-50 animate-in fade-in zoom-in-95 duration-200"
            >
              {(['off', 'auto', 'light', 'medium', 'heavy'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setReasoningMode(mode);
                    setShowReasoningMenu(false);
                  }}
                  className={`flex items-center gap-1 px-1.5 py-1 text-[10px] rounded-md transition-colors text-left capitalize ${reasoningMode === mode
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  {mode === 'off' && <span className="w-1.5 h-1.5 rounded-full bg-slate-100" />}
                  {mode === 'auto' && <Sparkles className="w-3 h-3 text-purple-400" />}
                  {(mode === 'light' || mode === 'medium' || mode === 'heavy') && <Brain className="w-3 h-3 text-blue-400" />}
                  {mode.replace('light', 'Light R.').replace('medium', 'Medium R.').replace('heavy', 'Heavy R.')}
                </button>
              ))}
            </div>
          )}

          <button
            ref={reasoningToggleRef}
            onClick={() => setShowReasoningMenu(!showReasoningMenu)}
            className={`p-2 rounded-lg transition-all duration-200 border nodrag ${reasoningMode !== 'off'
              ? 'bg-purple-50 text-purple-600 border-purple-200 shadow-sm'
              : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
              }`}
            title="Model Reasoning / Thinking"
          >
            <Brain className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              const newVal = !isSearchEnabled;
              setIsSearchEnabled(newVal);
              updateNodeData(id, { isSearchEnabled: newVal });
            }}
            className={`p-2 rounded-lg transition-all duration-200 border nodrag ${isSearchEnabled
              ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm'
              : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
              }`}
            title={isSearchEnabled ? "Online Search Enabled" : "Enable Online Search"}
          >
            <Globe className={`w-4 h-4 ${isSearchEnabled ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={handleGenerate}
            disabled={!inputText.trim() || isGenerating}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${inputText.trim() && !isGenerating
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              } nodrag`}
          >
            {isGenerating ? (
              <Sparkles className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white/90" />
            )}
            {isGenerating ? 'Thinking...' : 'Generate Answer'}
          </button>
        </div>
      </div>

      {/* Footer: Response Section */}
      {(response || isGenerating) && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 relative rounded-b-xl">
          <div
            ref={responseRef}
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
                  visit(tree, 'text', (node, index, parent) => {
                    if (!parent || !node.value) return;
                    let text = node.value;
                    for (const highlight of data.highlights || []) { // Added defensive check
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

                        parent.children.splice(index!, 1, ...newNodes);
                        return;
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