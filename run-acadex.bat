@echo off
title Acadex Desktop Launcher
echo Starting local Ollama model configuration...

:: Set your Ollama settings
set OLLAMA_BASE_URL=http://127.0.0.1:11434
:: Set the model name you use locally (e.g., llama3, qwen2.5, phi3, etc.)
set OLLAMA_MODEL=qwen2.5:14b

echo Launching Acadex Web App at http://localhost:3000...
echo (You can close this window to stop the app)

:: Open browser automatically
start http://localhost:3000

:: Start the server locally
pnpm run dev
