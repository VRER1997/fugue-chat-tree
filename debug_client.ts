
import OpenAI from 'openai';

async function test() {
    const apiKey = 'YOUR_API_KEY_HERE';
    const modelName = 'z-ai/glm-4.5-air:free';
    const apiUrl = 'https://openrouter.ai/api/v1';

    console.log(`Testing with OpenAI SDK:
  API Key: ${apiKey.substring(0, 10)}...
  Model: ${modelName}
  URL: ${apiUrl}`);

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: apiUrl,
    });

    try {
        console.log("Initializing client...");

        console.log("Generating content...");
        const completion = await openai.chat.completions.create({
            model: modelName,
            messages: [
                { role: 'user', content: "test" }
            ],
        });

        console.log("Success!");
        console.log(JSON.stringify(completion, null, 2));

    } catch (error) {
        console.error("Error occurred:");
        console.error(error);
    }
}

test();
