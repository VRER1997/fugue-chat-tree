# Chat Tree

> **An infinite canvas chat interface for deep research**

<div align="center">
  <img src="asset/overall.png" alt="Chat Tree Overall Preview" width="100%">
</div>

## ✨ Features

- **Infinite Canvas**: Break free from linear chat interfaces. Visualize your thought process with an infinite, zoomable canvas.
- **Deep Branching**: Highlight any part of an AI response to create a new branch. Explore multiple angles of a topic without losing the original context.
- **Rich Context Preservation**: Each branch inherits the full conversation history of its parent, ensuring the AI understands the deep context of your research.
- **Visual Organization**: Drag, arrange, and organize conversation nodes to build a knowledge tree that makes sense to you.
- **Rich Content Support**: Full support for Markdown tables, code highlighting, and mathematical formulas (LaTeX).
- **Persistent Sessions**: Your work is automatically saved to your browser's local storage. Refresh or close the page without fear of losing data.
- **Bring Your Own Key**: Support for OpenAI-compatible APIs (OpenRouter, Gemini, DeepSeek, etc.) with custom base URLs and model names.

## 🚀 Getting Started

### Prerequisites

- Node.js installed on your machine.
- An API Key (OpenAI, Anthropic, Gemini, or OpenRouter).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chat-tree.git
   cd chat-tree
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

5. Click **Settings** in the UI to configure your API Key and Model.

## 🛠️ Tech Stack

- **Framework**: React + Vite
- **Canvas Engine**: React Flow
- **Styling**: Tailwind CSS
- **AI Integration**: OpenAI SDK

## 📄 License

AGPL-3.0
