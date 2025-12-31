"use client";

import { useState, useCallback } from "react";

// --- Types ---
interface SessionData {
  sessionId: string | null;
  publicKey: JsonWebKey | null;
  createdAt: number | null;
  indexedDBKey: CryptoKeyPair | null;
}

interface AttackResult {
  success: boolean;
  message: string;
  details: string;
  timestamp: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "error" | "warning";
  message: string;
}

// --- Icons (Minimalist / Technical) ---
const TerminalIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
  >
    <rect x="3" y="11" width="18" height="11" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ShieldIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

// --- Layout Components ---

const GlitchText = ({ text }: { text: string }) => {
  return (
    <span className="relative inline-block font-mono tracking-tighter group">
      <span className="relative z-10">{text}</span>
      <span className="absolute left-0 top-0 -z-10 w-full h-full text-[#ccff00] opacity-0 group-hover:opacity-70 group-hover:translate-x-[2px] transition-all duration-100 select-none">
        {text}
      </span>
      <span className="absolute left-0 top-0 -z-10 w-full h-full text-red-500 opacity-0 group-hover:opacity-70 group-hover:-translate-x-[2px] transition-all duration-100 select-none">
        {text}
      </span>
    </span>
  );
};

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionData, setSessionData] = useState<SessionData>({
    sessionId: null,
    publicKey: null,
    createdAt: null,
    indexedDBKey: null,
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null);
  const [stolenCookie, setStolenCookie] = useState<string | null>(null);

  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
    const id = Math.random().toString(36).substring(7);
    setLogs((prev) => [...prev.slice(-15), { id, timestamp, type, message }]);
  }, []);

  // --- Logic ---
  const initializeSession = async () => {
    addLog("info", "INIT_SEQUENCE_START...");
    try {
      await new Promise((r) => setTimeout(r, 400));
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false, // Non-extractable
        ["sign", "verify"]
      );
      const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
      const sessionId = crypto.randomUUID();

      setSessionData({
        sessionId,
        publicKey,
        createdAt: Date.now(),
        indexedDBKey: keyPair,
      });
      document.cookie = `session_id=${sessionId}; path=/; max-age=86400`;

      setIsLoggedIn(true);
      addLog("success", "KEYPAIR_GENERATED [NON_EXTRACTABLE]");
      addLog("success", `SESSION_ESTABLISHED: ${sessionId.split("-")[0]}...`);
    } catch (error) {
      addLog("error", `INIT_FAILED: ${error}`);
    }
  };

  const logout = () => {
    document.cookie = "session_id=; path=/; max-age=0";
    setSessionData({
      sessionId: null,
      publicKey: null,
      createdAt: null,
      indexedDBKey: null,
    });
    setIsLoggedIn(false);
    setStolenCookie(null);
    setAttackResult(null);
    addLog("info", "SESSION_TERMINATED");
  };

  const simulateXSSCookieTheft = () => {
    addLog("warning", "EXECUTING_XSS_PAYLOAD...");
    const cookies = document.cookie;
    const sessionMatch = cookies.match(/session_id=([^;]+)/);
    if (sessionMatch) {
      setStolenCookie(sessionMatch[1]);
      addLog("success", "COOKIE_EXFILTRATED");
    } else {
      addLog("error", "NO_ACTIVE_SESSION");
    }
  };

  const simulateUseStokenCookie = async () => {
    addLog("warning", "REPLAY_ATTACK_INIT...");
    if (!stolenCookie) {
      addLog("error", "NO_TARGET_CREDENTIALS");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    setAttackResult({
      success: false,
      message: "ACCESS_DENIED",
      details: "INVALID_SIGNATURE: ORIGIN_MISMATCH",
      timestamp: Date.now(),
    });
    addLog("error", "SERVER_REJECTED: 401_UNAUTHORIZED");
    addLog("success", "PAN_PROTOCOL_DEFENSE_ACTIVE");
  };

  const simulateKeyExtraction = async () => {
    addLog("warning", "ATTEMPTING_KeyExtract()...");
    if (!sessionData.indexedDBKey) {
      addLog("error", "STORAGE_EMPTY");
      return;
    }
    try {
      await crypto.subtle.exportKey("jwk", sessionData.indexedDBKey.privateKey);
      // Fail case (should not happen)
      setAttackResult({
        success: true,
        message: "CRITICAL_FAILURE",
        details: "KEY_LEAKED",
        timestamp: Date.now(),
      });
    } catch {
      setAttackResult({
        success: false,
        message: "EXTRACTION_BLOCKED",
        details: "InvalidAccessError: KEY_NOT_EXTRACTABLE",
        timestamp: Date.now(),
      });
      addLog("error", "EXCEPTION: InvalidAccessError");
      addLog("success", "HARDWARE_BACKED_SECURITY_ACTIVE");
    }
  };

  return (
    <div className="min-h-screen bg-black text-[#e0e0e0] font-sans selection:bg-[#ccff00] selection:text-black overflow-x-hidden relative">
      <div className="scanlines fixed inset-0 pointer-events-none z-50 opacity-10"></div>

      {/* Grid Pattern Background */}
      <div className="fixed inset-0 bg-grid-pattern opacity-20 pointer-events-none"></div>

      {/* Main Container */}
      <div className="relative z-10 max-w-[1400px] mx-auto p-4 md:p-8 lg:p-12 min-h-screen lg:h-screen flex flex-col">
        {/* Header */}
        <header
          className="flex flex-col md:flex-row justify-between items-start md:items-end border-b-2 border-[#222] pb-6 mb-8 group gap-4 animate-reveal"
          style={{ animationDelay: "0ms" }}
        >
          <div>
            <h1 className="text-4xl md:text-6xl font-bold uppercase tracking-tighter leading-none mb-2">
              PAN<span className="text-[#ccff00]">_</span>PROTOCOL
            </h1>
            <p className="font-mono text-xs md:text-sm text-[#666] uppercase tracking-widest">
              Partitioned Authority Sessions //{" "}
              <span className="text-[#ccff00]">v1.0.4</span> // SECURE_CONTEXT
            </p>
          </div>
          <div className="hidden md:block text-right">
            <div className="text-xs font-mono text-[#666] mb-1">
              SYSTEM_STATUS
            </div>
            <div className="flex items-center justify-end gap-2">
              <span className="w-2 h-2 bg-[#ccff00] animate-pulse"></span>
              <span className="text-[#ccff00] font-mono tracking-wider">
                OPERATIONAL
              </span>
            </div>
          </div>
        </header>

        {/* Content Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          {/* Left Panel: Control & State */}
          <div
            className="lg:col-span-4 flex flex-col gap-6 animate-reveal"
            style={{ animationDelay: "100ms" }}
          >
            {/* Login Module */}
            <div className="bg-[#0a0a0a] border border-[#222] p-1 relative group hover:border-[#333] transition-colors">
              <div className="absolute -top-1 -left-1 w-2 h-2 border-l border-t border-[#ccff00]"></div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border-r border-b border-[#ccff00]"></div>

              <div className="p-6 bg-[#050505]">
                <h3 className="font-mono text-[#ccff00] text-sm mb-6 uppercase flex items-center gap-2">
                  <LockIcon className="w-4 h-4" /> Auth_Gateway
                </h3>

                {!isLoggedIn ? (
                  <div className="space-y-4">
                    <p className="text-sm text-[#888]">
                      Initialize secure enclave generation. Establish
                      hardware-backed session identity.
                    </p>
                    <button
                      onClick={initializeSession}
                      className="w-full bg-[#ccff00] text-black font-mono font-bold py-3 uppercase hover:bg-white transition-colors tracking-tight flex items-center justify-center gap-2"
                    >
                      <TerminalIcon className="w-4 h-4" /> Initiate_Session
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-[#222] p-3 font-mono text-xs">
                      <div className="text-[#666] mb-1">SESSION_ID</div>
                      <div className="text-white break-all max-h-20 overflow-hidden text-ellipsis">
                        {sessionData.sessionId?.substring(0, 32)}...
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono text-[#ccff00]">
                      <span>ENCLAVE: ACTIVE</span>
                      <span>
                        TIME:{" "}
                        {Math.floor(
                          (Date.now() - (sessionData.createdAt || 0)) / 1000
                        )}
                        s
                      </span>
                    </div>
                    <button
                      onClick={logout}
                      className="w-full border border-[#ccff00] text-[#ccff00] font-mono py-2 uppercase hover:bg-[#ccff00] hover:text-black transition-colors text-xs"
                    >
                      TERMINATE_SESSION
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Storage Readout */}
            <div className="flex-1 bg-[#0a0a0a] border border-[#222] p-6 relative overflow-hidden">
              <h3 className="font-mono text-[#666] text-xs mb-4 uppercase flex items-center gap-2">
                <ActivityIcon className="w-3 h-3" /> Memory_Dump
              </h3>

              <div className="space-y-3 font-mono text-xs">
                <div className="grid grid-cols-[1fr_2fr] gap-2 p-2 border-b border-[#111]">
                  <span className="text-[#444]">COOKIE_STORE</span>
                  <span
                    className={
                      sessionData.sessionId ? "text-[#ccff00]" : "text-[#333]"
                    }
                  >
                    {sessionData.sessionId ? "PRESENT (PUBLIC)" : "EMPTY"}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2 p-2 border-b border-[#111]">
                  <span className="text-[#444]">INDEXED_DB</span>
                  <span
                    className={
                      sessionData.indexedDBKey
                        ? "text-[#ccff00]"
                        : "text-[#333]"
                    }
                  >
                    {sessionData.indexedDBKey ? "SECURE (PRIVATE)" : "EMPTY"}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2 p-2">
                  <span className="text-[#444]">KEY_ATTRS</span>
                  <span
                    className={
                      sessionData.indexedDBKey
                        ? "text-[#ccff00]"
                        : "text-[#333]"
                    }
                  >
                    {sessionData.indexedDBKey ? "[EXTRACTABLE: FALSE]" : "N/A"}
                  </span>
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute bottom-4 right-4 text-[10px] text-[#222] font-mono flex flex-col items-end">
                <span>MEM_ADDR: 0x84F2...</span>
                <span>HEAP: 42%</span>
              </div>
            </div>
          </div>

          {/* Center Panel: Logs / Terminal */}
          <div
            className="lg:col-span-5 flex flex-col animate-reveal"
            style={{ animationDelay: "200ms" }}
          >
            <div className="bg-black border border-[#333] flex-1 flex flex-col font-mono text-xs relative overflow-hidden group">
              {/* Terminal Scanline */}
              <div className="absolute w-full h-1 bg-[#ccff00] opacity-10 top-0 left-0 animate-[scan_3s_linear_infinite] pointer-events-none"></div>

              <div className="flex items-center justify-between p-2 border-b border-[#222] bg-[#050505]">
                <span className="text-[#666]">EVENT_LOG // STREAM</span>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#333] rounded-full"></div>
                  <div className="w-2 h-2 bg-[#333] rounded-full"></div>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-1 font-mono">
                {logs.length === 0 ? (
                  <div className="text-[#333] mt-20 text-center animate-pulse">
                    Waiting for system events...
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="grid grid-cols-[auto_1fr] gap-3"
                    >
                      <span className="text-[#444] select-none">
                        {log.timestamp}
                      </span>
                      <span
                        className={`${
                          log.type === "error"
                            ? "text-red-500"
                            : log.type === "success"
                            ? "text-[#ccff00]"
                            : log.type === "warning"
                            ? "text-orange-400"
                            : "text-[#888]"
                        }`}
                      >
                        {log.type === "success" && ">> "}
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div className="w-2 h-4 bg-[#ccff00] animate-pulse inline-block mt-2"></div>
              </div>
            </div>
          </div>

          {/* Right Panel: Attack Tools */}
          <div
            className="lg:col-span-3 flex flex-col gap-4 animate-reveal"
            style={{ animationDelay: "300ms" }}
          >
            <div className="p-4 border border-red-900/40 bg-red-950/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-50">
                <ShieldIcon className="w-12 h-12 text-red-900" />
              </div>
              <h3 className="text-red-500 font-mono text-xs uppercase mb-4 tracking-widest border-b border-red-900/30 pb-2">
                Adversary_Toolkit
              </h3>

              <div className="space-y-2">
                <button
                  onClick={simulateXSSCookieTheft}
                  disabled={!isLoggedIn}
                  className="w-full text-left p-3 border border-[#222] hover:border-red-500 text-[#666] hover:text-red-400 text-xs font-mono uppercase transition-all disabled:opacity-20 flex justify-between items-center group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">
                    XSS_INJECT
                  </span>
                  <span className="opacity-0 group-hover:opacity-100">+</span>
                </button>
                <button
                  onClick={simulateUseStokenCookie}
                  disabled={!stolenCookie}
                  className="w-full text-left p-3 border border-[#222] hover:border-red-500 text-[#666] hover:text-red-400 text-xs font-mono uppercase transition-all disabled:opacity-20 flex justify-between items-center group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">
                    REPLAY_TOKEN
                  </span>
                  <span className="opacity-0 group-hover:opacity-100">+</span>
                </button>
                <button
                  onClick={simulateKeyExtraction}
                  disabled={!isLoggedIn}
                  className="w-full text-left p-3 border border-[#222] hover:border-red-500 text-[#666] hover:text-red-400 text-xs font-mono uppercase transition-all disabled:opacity-20 flex justify-between items-center group"
                >
                  <span className="group-hover:translate-x-1 transition-transform">
                    DUMP_P_KEY
                  </span>
                  <span className="opacity-0 group-hover:opacity-100">+</span>
                </button>
              </div>
            </div>

            {attackResult && (
              <div
                className={`p-4 border ${
                  attackResult.success
                    ? "border-red-500 bg-red-500/10"
                    : "border-[#ccff00] bg-[#ccff00]/10"
                } animate-reveal`}
              >
                <div
                  className={`text-xs font-mono font-bold mb-1 ${
                    attackResult.success ? "text-red-500" : "text-[#ccff00]"
                  }`}
                >
                  {attackResult.success ? "BREACH_SUCCESSFUL" : "ACCESS_DENIED"}
                </div>
                <p className="text-[10px] font-mono text-[#888] uppercase leading-relaxed">
                  CODE: {attackResult.details}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-[#222] flex justify-between text-[10px] font-mono text-[#444] uppercase">
          <div>SECURE_KERNEL_VERSION: 4.8.2</div>
          <div>PAN_DEMO // DEEPMIND // 2026</div>
        </footer>
      </div>
    </div>
  );
}
