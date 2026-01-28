import OpenAI from 'openai';

const getApiConfig = () => {
    const apiKey = localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
    const baseURL = localStorage.getItem('gemini_api_url') || import.meta.env.VITE_GEMINI_API_URL || 'https://openrouter.ai/api/v1';
    const model = localStorage.getItem('gemini_model_name') || import.meta.env.VITE_GEMINI_MODEL_NAME || 'gemini-1.5-flash';

    return { apiKey, baseURL, model };
};

export async function generateCanvasTitle(conversationContent: string): Promise<string> {
    const { apiKey, baseURL, model } = getApiConfig();

    if (!apiKey) {
        console.warn('No API key configured for title generation');
        return `New Canvas - ${new Date().toLocaleTimeString()}`;
    }

    try {
        const openai = new OpenAI({
            apiKey,
            baseURL,
            dangerouslyAllowBrowser: true
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await openai.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that creates concise titles. Generate a title of 5-8 words maximum that summarizes the conversation. Only return the title text, nothing else.'
                },
                {
                    role: 'user',
                    content: `Summarize this conversation into a short title:\n\n${conversationContent.slice(0, 500)}`
                }
            ],
            max_tokens: 50,
            temperature: 0.7,
        }, {
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const title = response.choices[0]?.message?.content?.trim() || `New Canvas - ${new Date().toLocaleTimeString()}`;

        // Clean up the title (remove quotes if present)
        return title.replace(/^["']|["']$/g, '').slice(0, 60); // Max 60 chars
    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.warn('Title generation timed out');
        } else {
            console.error('Failed to generate title:', error);
        }
        return `New Canvas - ${new Date().toLocaleTimeString()}`;
    }
}
