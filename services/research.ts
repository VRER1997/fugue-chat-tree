import OpenAI from 'openai';
import { ResearchStep, Source } from '../types';

interface ResearchCallbacks {
    onStepUpdate: (steps: ResearchStep[]) => void;
    onAnswerUpdate: (answer: string) => void;
    onSourcesUpdate: (sources: Source[]) => void;
    onError: (error: string) => void;
}

const getApiKeys = () => {
    const openaiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
    const openaiBaseUrl = localStorage.getItem('gemini_api_url') || import.meta.env.VITE_GEMINI_API_URL || 'https://openrouter.ai/api/v1';
    const openaiModel = localStorage.getItem('gemini_model_name') || import.meta.env.VITE_GEMINI_MODEL_NAME || 'gemini-1.5-flash';
    const tavilyKey = localStorage.getItem('tavily_api_key') || import.meta.env.VITE_TAVILY_API_KEY || '';

    return { openaiKey, openaiBaseUrl, openaiModel, tavilyKey };
};

export const executeDeepResearch = async (
    userQuery: string,
    callbacks: ResearchCallbacks
) => {
    const { openaiKey, openaiBaseUrl, openaiModel, tavilyKey } = getApiKeys();

    if (!openaiKey) {
        callbacks.onError("Missing OpenAI/Gemini API Key. Please configure it in Settings.");
        return;
    }

    if (!tavilyKey) {
        callbacks.onError("Missing Tavily API Key. Please configure it in Settings -> Search Configuration.");
        return;
    }

    // Initialize OpenAI
    const openai = new OpenAI({
        apiKey: openaiKey,
        baseURL: openaiBaseUrl,
        dangerouslyAllowBrowser: true
    });

    // Initial Steps
    const steps: ResearchStep[] = [
        { id: '1', label: '🔍 Analyzing intent and generating queries', status: 'running' },
        { id: '2', label: '🌐 Searching the web', status: 'pending' },
        { id: '3', label: '📖 Reading and aggregating sources', status: 'pending' },
        { id: '4', label: '✍️ Synthesizing final answer', status: 'pending' },
    ];
    callbacks.onStepUpdate([...steps]);

    try {
        // --- Step 1: Query Expansion ---
        console.log("Step 1: Query Expansion");
        const queries = await generateSearchQueries(openai, openaiModel, userQuery);

        steps[0].status = 'done';
        steps[1].status = 'running';
        steps[1].label = `🌐 Searching: ${queries.join(', ')}`;
        callbacks.onStepUpdate([...steps]);


        // --- Step 2: Parallel Search ---
        console.log("Step 2: Searching", queries);
        const searchResults = await performSearch(queries, tavilyKey);

        steps[1].status = 'done';
        steps[2].status = 'running';
        steps[2].label = `📖 Processing ${searchResults.length} sources`;
        callbacks.onStepUpdate([...steps]);


        // --- Step 3: Aggregation ---
        console.log("Step 3: Aggregation");
        const { context, sources } = aggregateContext(searchResults);
        callbacks.onSourcesUpdate(sources);

        steps[2].status = 'done';
        steps[3].status = 'running';
        callbacks.onStepUpdate([...steps]);


        // --- Step 4: Synthesis ---
        console.log("Step 4: Synthesis");
        await synthesizeAnswer(openai, openaiModel, userQuery, context, callbacks.onAnswerUpdate);

        steps[3].status = 'done';
        callbacks.onStepUpdate([...steps]);

    } catch (error: any) {
        console.error("Research Error:", error);
        callbacks.onError(error.message || "An unexpected error occurred during research.");
    }
};

// --- Helper Functions ---

async function generateSearchQueries(openai: OpenAI, model: string, query: string): Promise<string[]> {
    const response = await openai.chat.completions.create({
        model: model, // Use configured model
        messages: [
            { role: 'system', content: 'You are a research assistant. Generate 3 distinct, optimized search queries to broadly cover the user\'s request. Return ONLY a JSON array of strings, e.g., ["query1", "query2", "query3"].' },
            { role: 'user', content: query }
        ],
        response_format: { type: "json_object" }
    });

    try {
        const content = response.choices[0].message.content || '{"queries": []}';
        const json = JSON.parse(content);
        const queries = json.queries || json.items || [];
        return queries.slice(0, 3);
    } catch (e) {
        console.warn("Failed to parse queries JSON, using raw query", e);
        return [query];
    }
}

async function performSearch(queries: string[], apiKey: string): Promise<any[]> {
    // No mock data allowed.
    if (!apiKey) {
        throw new Error("Tavily API Key is missing");
    }

    // Real Tavily Call (Parallel)
    const promises = queries.map(async (q) => {
        try {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: q,
                    search_depth: "advanced",
                    include_raw_content: false,
                    max_results: 5
                })
            });
            const data = await response.json();
            return data.results || [];
        } catch (e) {
            console.error(`Search failed for ${q}`, e);
            return [];
        }
    });

    const results = await Promise.all(promises);
    return results.flat();
}

function aggregateContext(searchResults: any[]): { context: string, sources: Source[] } {
    const uniqueUrls = new Set();
    const sources: Source[] = [];
    let context = "";

    for (const result of searchResults) {
        if (uniqueUrls.has(result.url)) continue;
        uniqueUrls.add(result.url);

        const source: Source = {
            id: (sources.length + 1).toString(),
            title: result.title || "Untitled",
            url: result.url,
            // Try to get a favicon or default
            favicon: `https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}`,
            content: result.content
        };
        sources.push(source);

        context += `[Source ${source.id}] Title: ${source.title}\nURL: ${source.url}\nContent: ${result.content?.slice(0, 500)}...\n\n`;
    }

    return { context, sources };
}

async function synthesizeAnswer(
    openai: OpenAI,
    model: string,
    query: string,
    context: string,
    onUpdate: (chunk: string) => void
) {
    const stream = await openai.chat.completions.create({
        model: model, // Main reasoning model
        messages: [
            {
                role: 'system',
                content: `You are an academic researcher. Answer the verified user query based ONLY on the provided context.
        
Context:
${context}

Constraints:
- Use [1], [2] format for citations at the end of relevant sentences.
- Do not make up sources.
- Be comprehensive and structured.
- Use Markdown.
`
            },
            { role: 'user', content: query }
        ],
        stream: true
    });

    let fullText = "";
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
            fullText += content;
            onUpdate(fullText);
        }
    }
}
