import React from 'react';

export default function LandingApp() {
  return (
    <div className="bg-[#0a0b14] text-white overflow-x-hidden min-h-screen font-sans selection:bg-emerald-500/30">
      <style>{`
        .orb { position: absolute; border-radius: 50%; filter: blur(100px); pointer-events: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.6s ease forwards; }
      `}</style>
      
      {/* Background orbs (same as app) */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="orb top-[-100px] left-[-100px] w-[500px] h-[500px] bg-blue-600/20"></div>
        <div className="orb bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-purple-600/20"></div>
        <div className="orb top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-emerald-500/10" style={{ filter: 'blur(120px)' }}></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 md:p-8 fade-in">
        {/* Status badge (kept responsive) */}
        <div className="absolute top-6 right-6 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 text-xs font-medium text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live & Online
        </div>

        {/* Hero */}
        <div className="text-center w-full max-w-2xl mx-auto flex-1 flex flex-col justify-center">
          {/* Stan logo / mark */}
          <div className="mb-8 flex justify-center mt-12">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg">
              <svg className="w-10 h-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="20" y="30" width="60" height="40" rx="6" fill="white" fillOpacity="0.05" stroke="white" strokeOpacity="0.3" strokeWidth="2.5" />
                <circle cx="42" cy="50" r="5" fill="#10b981" />
                <circle cx="58" cy="50" r="5" fill="#00a3ff" />
              </svg>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Meet Stan
          </h1>
          
          <p className="text-lg md:text-xl text-white/70 mb-6 max-w-lg mx-auto leading-relaxed">
            A private, local‑first AI assistant that never phones home.
          </p>
          
          <p className="text-sm text-white/50 mb-10 max-w-md mx-auto leading-relaxed">
            Stan is a reference implementation of the Standardized Web Agents Protocol (SWAP). 
            He runs entirely in your browser – no cloud, no account, no data harvesting.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <a href="/swap-agent.html" target="_blank" rel="noreferrer"
               className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-base inline-flex items-center justify-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              Launch Stan
            </a>
            <a href="https://github.com/standardwebagent/Standardized-Web-Agents-Protocol" target="_blank" rel="noreferrer"
               className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 rounded-xl transition-all text-base inline-flex items-center justify-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              View on GitHub
            </a>
          </div>

          {/* Trust bar */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/40 mb-16">
            <span className="inline-flex items-center gap-1">📱 Works offline</span>
            <span className="inline-flex items-center gap-1">🔒 Zero data leakage</span>
            <span className="inline-flex items-center gap-1">⚡ WebGPU · WASM · WebNN</span>
            <span className="inline-flex items-center gap-1">🧠 FunctionGemma 270M</span>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-white/20 mt-auto pt-6">
          <p>Open Source · No Telemetry · No Tracking</p>
          <p className="mt-1">© 2026 Stan Systems · Built on SWAP</p>
        </footer>
      </div>
    </div>
  );
}
