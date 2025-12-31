"use client";

import { useState, useEffect, useCallback } from "react";

// Types
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
}

interface LogEntry {
  timestamp: string;
  type: "info" | "success" | "error" | "warning";
  message: string;
}

// PAN Demo Application
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
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-19), { timestamp, type, message }]);
  }, []);

  // Simulate signing iframe initialization
  const initializeSession = async () => {
    addLog("info", "Generating ECDSA key pair in isolated context...");

    try {
      // Generate key pair (simulating signing iframe)
      const keyPair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false, // Non-extractable!
        ["sign", "verify"]
      );

      const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
      const sessionId = crypto.randomUUID();

      // Store in IndexedDB (simulating)
      setSessionData({
        sessionId,
        publicKey,
        createdAt: Date.now(),
        indexedDBKey: keyPair,
      });

      // Set session cookie
      document.cookie = `session_id=${sessionId}; path=/; max-age=86400`;

      setIsLoggedIn(true);
      addLog("success", "Key pair generated with non-extractable flag");
      addLog("success", `Session established: ${sessionId.substring(0, 8)}...`);
      addLog("info", "Public key registered with server (simulated)");
    } catch (error) {
      addLog("error", `Failed to initialize: ${error}`);
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
    addLog("info", "Session cleared");
  };

  // Attack simulations
  const simulateXSSCookieTheft = () => {
    addLog("warning", "🔴 ATTACK: Simulating XSS cookie theft...");

    const cookies = document.cookie;
    const sessionMatch = cookies.match(/session_id=([^;]+)/);

    if (sessionMatch) {
      setStolenCookie(sessionMatch[1]);
      addLog(
        "warning",
        `Attacker stole cookie: ${sessionMatch[1].substring(0, 8)}...`
      );
      addLog(
        "info",
        "Cookie was stolen, but attacker still cannot make authenticated requests"
      );
    } else {
      addLog("error", "No session cookie found");
    }
  };

  const simulateUseStokenCookie = async () => {
    addLog("warning", "🔴 ATTACK: Attempting to use stolen cookie...");

    if (!stolenCookie) {
      addLog("error", "No stolen cookie available");
      return;
    }

    // Simulate making a request with just the stolen cookie
    addLog("info", "Making request with stolen session token...");
    addLog(
      "info",
      'Request headers: { X-Session-ID: "' +
        stolenCookie.substring(0, 8) +
        '..." }'
    );

    // Simulate server response
    await new Promise((resolve) => setTimeout(resolve, 500));

    setAttackResult({
      success: false,
      message: "❌ ATTACK FAILED",
      details:
        "Server response: 401 Unauthorized - Missing X-Signature and X-Interaction-Proof headers",
    });

    addLog("error", "Server rejected request: Missing signature!");
    addLog(
      "success",
      "✅ PAN Protection: Token alone is worthless without signature from isolated context"
    );
  };

  const simulateKeyExtraction = async () => {
    addLog("warning", "🔴 ATTACK: Attempting to extract private key...");

    if (!sessionData.indexedDBKey) {
      addLog("error", "No key pair in memory");
      return;
    }

    try {
      // Try to export the private key
      addLog("info", "Calling crypto.subtle.exportKey on private key...");
      await crypto.subtle.exportKey("jwk", sessionData.indexedDBKey.privateKey);

      // This should never happen
      setAttackResult({
        success: true,
        message: "⚠️ KEY EXTRACTED",
        details: "This should not happen with non-extractable keys!",
      });
    } catch (error) {
      setAttackResult({
        success: false,
        message: "❌ EXTRACTION BLOCKED",
        details: "InvalidAccessError: The key is not extractable",
      });
      addLog("error", "WebCrypto blocked key extraction: InvalidAccessError");
      addLog(
        "success",
        "✅ PAN Protection: Private key is non-extractable by design"
      );
    }
  };

  const simulateCrossOriginAccess = () => {
    addLog("warning", "🔴 ATTACK: Simulating cross-origin iframe access...");
    addLog("info", "Attacker XSS tries to access signing iframe content...");

    // Simulate Same-Origin Policy blocking
    setTimeout(() => {
      setAttackResult({
        success: false,
        message: "❌ ACCESS DENIED",
        details:
          "SecurityError: Blocked by Same-Origin Policy. Cannot access cross-origin frame.",
      });
      addLog("error", "Browser blocked: Same-Origin Policy violation");
      addLog(
        "success",
        "✅ PAN Protection: Signing iframe is on different origin, inaccessible to attacker"
      );
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl">
              🔐
            </div>
            <div>
              <h1 className="font-bold text-lg">PAN Security Demo</h1>
              <p className="text-xs text-gray-500">
                Partitioned Authority Sessions
              </p>
            </div>
          </div>
          <a
            href="https://github.com/AaryanBansal-dev/Partitioned-Authority-Sessions"
            target="_blank"
            className="text-gray-400 hover:text-white transition"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Session & Storage */}
          <div className="lg:col-span-2 space-y-6">
            {/* Login/Session Panel */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    isLoggedIn ? "bg-green-500" : "bg-gray-600"
                  }`}
                ></span>
                Session Status
              </h2>

              {!isLoggedIn ? (
                <div className="space-y-4">
                  <p className="text-gray-400">
                    Click login to create a PAN-protected session with isolated
                    cryptographic keys.
                  </p>
                  <button
                    onClick={initializeSession}
                    className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-medium hover:opacity-90 transition"
                  >
                    🔑 Login & Generate Keys
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <p className="text-green-400 font-medium">
                      ✓ Session Active
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      Try the attacks below to see how PAN protects you
                    </p>
                  </div>
                  <button
                    onClick={logout}
                    className="w-full py-3 bg-gray-800 rounded-xl font-medium hover:bg-gray-700 transition"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>

            {/* What's Stored Panel */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">
                📦 What's Stored On Your Device
              </h2>

              <div className="space-y-4">
                {/* Cookie Storage */}
                <div className="p-4 bg-gray-800/50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-orange-400">
                      🍪 Session Cookie
                    </h3>
                    <span className="text-xs text-gray-500">
                      HttpOnly in production
                    </span>
                  </div>
                  <code className="text-sm text-gray-300 break-all">
                    {sessionData.sessionId
                      ? `session_id=${sessionData.sessionId.substring(
                          0,
                          16
                        )}...`
                      : "No cookie set"}
                  </code>
                  <p className="text-xs text-gray-500 mt-2">
                    ⚠️ This is just an identifier - grants ZERO authority alone
                  </p>
                </div>

                {/* IndexedDB Storage */}
                <div className="p-4 bg-gray-800/50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-purple-400">
                      💾 IndexedDB (Signing Origin)
                    </h3>
                    <span className="text-xs text-gray-500">
                      Origin-isolated
                    </span>
                  </div>
                  {sessionData.indexedDBKey ? (
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-gray-500">Private Key: </span>
                        <span className="text-red-400">[NON-EXTRACTABLE]</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">Algorithm: </span>
                        <span className="text-gray-300">ECDSA P-256</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">Created: </span>
                        <span className="text-gray-300">
                          {sessionData.createdAt
                            ? new Date(
                                sessionData.createdAt
                              ).toLocaleTimeString()
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <code className="text-sm text-gray-500">
                      No keys stored
                    </code>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    ✅ Private key can NEVER be exported, even with full JS
                    execution
                  </p>
                </div>

                {/* Public Key (Server) */}
                <div className="p-4 bg-gray-800/50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-cyan-400">
                      🔑 Public Key (Registered on Server)
                    </h3>
                  </div>
                  {sessionData.publicKey ? (
                    <code className="text-xs text-gray-400 break-all block">
                      {JSON.stringify(sessionData.publicKey).substring(0, 100)}
                      ...
                    </code>
                  ) : (
                    <code className="text-sm text-gray-500">
                      No key registered
                    </code>
                  )}
                </div>
              </div>
            </div>

            {/* Try In Another Browser */}
            <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 rounded-2xl border border-yellow-500/30 p-6">
              <h2 className="text-lg font-semibold mb-2 text-yellow-400">
                🧪 Try This Experiment
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                <li>Login to create a session above</li>
                <li>
                  Copy your session cookie value:{" "}
                  <code className="text-yellow-400">
                    {sessionData.sessionId?.substring(0, 16) || "..."}
                  </code>
                </li>
                <li>
                  Open a <strong>different browser</strong> (or incognito
                  window)
                </li>
                <li>
                  Set the same cookie using DevTools: <br />
                  <code className="text-xs text-gray-500">
                    document.cookie = "session_id=PASTE_HERE"
                  </code>
                </li>
                <li>Try to make an authenticated request</li>
              </ol>
              <div className="mt-4 p-3 bg-black/30 rounded-lg">
                <p className="text-sm text-yellow-300 font-medium">
                  Result: ❌ The session will be rejected because the new
                  browser doesn't have the private key in IndexedDB!
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Attack Simulation */}
          <div className="space-y-6">
            {/* Attack Panel */}
            <div className="bg-gray-900 rounded-2xl border border-red-500/30 p-6">
              <h2 className="text-lg font-semibold mb-4 text-red-400">
                ⚔️ Attack Simulations
              </h2>

              <div className="space-y-3">
                <button
                  onClick={simulateXSSCookieTheft}
                  disabled={!isLoggedIn}
                  className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-xl font-medium hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  1. Steal Session Cookie (XSS)
                </button>

                <button
                  onClick={simulateUseStokenCookie}
                  disabled={!stolenCookie}
                  className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-xl font-medium hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  2. Use Stolen Cookie
                </button>

                <button
                  onClick={simulateKeyExtraction}
                  disabled={!isLoggedIn}
                  className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-xl font-medium hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  3. Extract Private Key
                </button>

                <button
                  onClick={simulateCrossOriginAccess}
                  disabled={!isLoggedIn}
                  className="w-full py-3 bg-red-500/20 border border-red-500/30 rounded-xl font-medium hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  4. Access Signing Iframe
                </button>
              </div>

              {/* Attack Result */}
              {attackResult && (
                <div
                  className={`mt-4 p-4 rounded-xl ${
                    attackResult.success
                      ? "bg-red-500/20 border border-red-500"
                      : "bg-green-500/20 border border-green-500"
                  }`}
                >
                  <p className="font-bold">{attackResult.message}</p>
                  <p className="text-sm text-gray-300 mt-1">
                    {attackResult.details}
                  </p>
                </div>
              )}

              {stolenCookie && (
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                  <p className="text-xs text-yellow-400 font-medium">
                    Stolen Cookie:
                  </p>
                  <code className="text-xs text-gray-300 break-all">
                    {stolenCookie}
                  </code>
                </div>
              )}
            </div>

            {/* Activity Log */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">📋 Activity Log</h2>
              <div className="h-64 overflow-y-auto space-y-1 font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500">No activity yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      className={`py-1 ${
                        log.type === "error"
                          ? "text-red-400"
                          : log.type === "success"
                          ? "text-green-400"
                          : log.type === "warning"
                          ? "text-yellow-400"
                          : "text-gray-400"
                      }`}
                    >
                      <span className="text-gray-600">[{log.timestamp}]</span>{" "}
                      {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Security Summary */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-4">
                🛡️ Why Attacks Fail
              </h2>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Cookie is just an ID, not authority</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Private key is non-extractable (WebCrypto)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Signing origin is isolated (Same-Origin Policy)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Actions need real human interaction proof</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <span>Nonces prevent replay attacks</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center text-gray-500 text-sm">
          <p>
            Partitioned Authority Sessions (PAN) - Making session hijacking
            impossible
          </p>
          <p className="mt-2">
            <a
              href="https://github.com/AaryanBansal-dev/Partitioned-Authority-Sessions"
              className="text-cyan-400 hover:underline"
            >
              View on GitHub
            </a>
            {" • "}
            <a
              href="https://www.npmjs.com/package/partitioned-authority-sessions"
              className="text-cyan-400 hover:underline"
            >
              npm package
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
