import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { Terminal, Shield, Cpu, ExternalLink, Activity, ArrowRight, Github, CloudOff, Database, WifiOff } from 'lucide-react';

export default function LandingApp() {
  const [protocolMd, setProtocolMd] = useState('');

  useEffect(() => {
    fetch('/protocol.md')
      .then(res => res.text())
      .then(text => setProtocolMd(text))
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f5f4] text-[#0a0a0a] font-sans selection:bg-[#0a0a0a] selection:text-white pb-32">
      {/* Navbar overlay */}
      <nav className="fixed top-0 left-0 w-full z-50 p-6 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-3 font-semibold pointer-events-auto mix-blend-difference text-white">
          <div className="flex flex-col">
            <span className="text-xl tracking-tight hidden sm:block leading-none">Stan</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono hidden sm:block mt-0.5">SWAP Protocol</span>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          <a 
            href="https://github.com/standardwebagent/Standardized-Web-Agents-Protocol" 
            target="_blank" 
            rel="noreferrer"
            className="hidden sm:flex items-center gap-2 hover:opacity-70 transition-opacity bg-white/80 px-4 py-2 rounded-full border border-black/10 text-sm font-medium backdrop-blur-md"
          >
            <Github size={16} /> GitHub Specs
          </a>
        </div>
      </nav>

      <main className="lg:grid lg:grid-cols-2 min-h-[100vh]">
        {/* Left pane - Hero & Abstract */}
        <section className="relative px-6 pt-32 lg:p-16 xl:p-24 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-[#e5e5e5]">
          <div className="absolute top-0 left-0 w-full h-full bg-grid-black/[0.02] bg-[size:32px_32px] pointer-events-none" />
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="z-10"
          >
            <h1 className="text-6xl md:text-7xl xl:text-[88px] leading-[1.05] font-bold tracking-[-0.03em] mb-8 mt-4">
              Meet Stan. <br className="hidden sm:block" /> Your Personal Agent.
            </h1>
            
            <p className="text-xl md:text-2xl text-black/60 font-medium leading-[1.3] max-w-lg mb-12">
              A local-first, privacy-focused assistant built on the SWAP protocol. Stan runs entirely in your browser using WebAssembly and hardware acceleration, and connects to your local tools via the Model Context Protocol (MCP).
            </p>
          </motion.div>
        </section>

        {/* Right pane - The Document */}
        <section className="bg-white px-6 py-16 lg:p-16 xl:p-24 overflow-y-auto lg:h-screen sticky top-0 custom-scrollbar">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-prose mx-auto"
          >
            <div className="prose prose-lg prose-zinc prose-a:text-blue-600 hover:prose-a:text-blue-500 prose-headings:font-semibold prose-h1:text-4xl prose-h2:text-2xl prose-h3:text-lg prose-inline-code:text-orange-600 prose-inline-code:bg-orange-50 prose-inline-code:px-1.5 prose-inline-code:py-0.5 prose-inline-code:rounded">
              {protocolMd ? (
                <ReactMarkdown>{protocolMd}</ReactMarkdown>
              ) : (
                <div className="animate-pulse space-y-4">
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              )}
            </div>

            <div className="mt-20 pt-8 border-t border-black/10 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center">
              <div>
                <h4 className="font-semibold text-lg mb-1">Talk to Stan.</h4>
                <p className="text-sm text-black/60">Try the reference assistant implementation running in your browser.</p>
              </div>
              <a href="/swap-agent.html" className="group inline-flex items-center gap-2 bg-[#0a0a0a] text-white px-6 py-3 rounded-xl font-medium hover:bg-black/80 transition-all shrink-0">
                Launch Stan <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </motion.div>
        </section>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f5f5f4; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d4d4d8; 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a1a1aa; 
        }
      `}</style>
    </div>
  );
}
