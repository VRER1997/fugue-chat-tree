
import React, { useState, useEffect } from 'react';
import { X, Save, Bot } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
    const [activeTab, setActiveTab] = useState('model');
    const [apiKey, setApiKey] = useState('');
    const [modelName, setModelName] = useState('gemini-1.5-flash');
    const [apiUrl, setApiUrl] = useState('');

    // Load from localStorage on open
    useEffect(() => {
        if (isOpen) {
            const storedKey = localStorage.getItem('gemini_api_key') || '';
            const storedModel = localStorage.getItem('gemini_model_name') || 'gemini-1.5-flash';
            const storedUrl = localStorage.getItem('gemini_api_url') || '';
            setApiKey(storedKey);
            setModelName(storedModel);
            setApiUrl(storedUrl);
        }
    }, [isOpen]);

    const handleSave = () => {
        localStorage.setItem('gemini_api_key', apiKey.trim());
        localStorage.setItem('gemini_model_name', modelName.trim());
        localStorage.setItem('gemini_api_url', apiUrl.trim());
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh] h-auto md:h-[600px]">
                {/* Sidebar */}
                <div className="w-full md:w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col gap-2">
                    <div className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider px-2">Settings</div>

                    <button
                        onClick={() => setActiveTab('model')}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${activeTab === 'model'
                            ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                    >
                        <Bot className="w-4 h-4" />
                        Model Configuration
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-800">
                            {activeTab === 'model' && 'Model Configuration'}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-1 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {activeTab === 'model' && (
                            <div className="space-y-6">
                                {/* API Key */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        API Key
                                    </label>
                                    <div className="text-xs text-slate-500 mb-2 leading-relaxed">
                                        Required for authentication. If using the official Gemini API, get your key from Google AI Studio.
                                    </div>
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="Enter your API Key"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>

                                {/* API URL */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        API Base URL
                                    </label>
                                    <div className="text-xs text-slate-500 mb-2 leading-relaxed">
                                        Optional override for the API endpoint (e.g., if using a proxy).
                                        Leave blank to use the default Google GenAI endpoint.
                                    </div>
                                    <input
                                        type="text"
                                        value={apiUrl}
                                        onChange={(e) => setApiUrl(e.target.value)}
                                        placeholder="https://generativelanguage.googleapis.com"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>

                                {/* Model Name */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Model Name
                                    </label>
                                    <div className="text-xs text-slate-500 mb-2 leading-relaxed">
                                        The specific model version to use for generation.
                                    </div>
                                    <input
                                        type="text"
                                        value={modelName}
                                        onChange={(e) => setModelName(e.target.value)}
                                        placeholder="gemini-1.5-flash"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
