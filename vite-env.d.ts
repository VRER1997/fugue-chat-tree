/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_GEMINI_MODEL_NAME: string
    readonly VITE_GEMINI_API_URL: string
    readonly VITE_SERPER_API_KEY: string
    readonly VITE_TAVILY_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
