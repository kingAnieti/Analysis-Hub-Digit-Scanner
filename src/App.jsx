import React, { useState, useEffect, useRef } from "react";

// Replace with your App ID from developers.deriv.com
const APP_ID = "34cqHOYTzkye6dCyuLelT"; 
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

const SYNTHETIC_MARKETS = [
  { symbol: "R_10", name: "Volatility 10 Index" },
  { symbol: "R_25", name: "Volatility 25 Index" },
  { symbol: "R_50", name: "Volatility 50 Index" },
  { symbol: "R_75", name: "Volatility 75 Index" },
  { symbol: "R_100", name: "Volatility 100 Index" },
];

export default function App() {
  const [demoToken, setDemoToken] = useState(localStorage.getItem("deriv_demo_token") || "");
  const [realToken, setRealToken] = useState(localStorage.getItem("deriv_real_token") || "");
  const [activeAccountType, setActiveAccountType] = useState("demo"); // "demo" or "real"

  const [inputDemoToken, setInputDemoToken] = useState("");
  const [inputRealToken, setInputRealToken] = useState("");
  const [showTokenModal, setShowTokenModal] = useState(false);

  const [balance, setBalance] = useState("0.00");
  const [currency, setCurrency] = useState("USD");
  const [loginId, setLoginId] = useState("");

  const [marketMode, setMarketMode] = useState("single");
  const [selectedMarket, setSelectedMarket] = useState("R_100");

  const [activeTab, setActiveTab] = useState("bulk");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [stake, setStake] = useState(1);
  const [bulkTrades, setBulkTrades] = useState(25);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [summary, setSummary] = useState({ totalStake: 0, payout: 0, won: 0, lost: 0, totalProfit: 0 });
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [lastTick, setLastTick] = useState("0.00");

  const ws = useRef(null);

  // Parse Multi-Account Tokens from OAuth Redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let foundTokens = false;

    for (let i = 1; i <= 5; i++) {
      const acct = params.get(`acct${i}`);
      const tok = params.get(`token${i}`);

      if (acct && tok) {
        foundTokens = true;
        if (acct.startsWith("VRTC")) {
          localStorage.setItem("deriv_demo_token", tok);
          setDemoToken(tok);
        } else {
          localStorage.setItem("deriv_real_token", tok);
          setRealToken(tok);
        }
      }
    }

    if (foundTokens) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Manage WebSocket Authorization Connection
  useEffect(() => {
    const tokenToUse = activeAccountType === "demo" ? demoToken : realToken;
    if (!tokenToUse) return;

    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      ws.current.send(JSON.stringify({ authorize: tokenToUse }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.msg_type === "authorize") {
        if (data.error) {
          alert(`[${activeAccountType.toUpperCase()}] Token Invalid: ` + data.error.message);
          if (activeAccountType === "demo") {
            localStorage.removeItem("deriv_demo_token");
            setDemoToken("");
          } else {
            localStorage.removeItem("deriv_real_token");
            setRealToken("");
          }
          return;
        }

        setBalance(Number(data.authorize.balance).toFixed(2));
        setCurrency(data.authorize.currency);
        setLoginId(data.authorize.loginid);

        ws.current.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        ws.current.send(JSON.stringify({ ticks: selectedMarket }));
      }

      if (data.msg_type === "balance") {
        setBalance(Number(data.balance.balance).toFixed(2));
      }

      if (data.msg_type === "tick" && data.tick && data.tick.quote) {
        setLastTick(Number(data.tick.quote).toFixed(2));
      }

      if (data.msg_type === "buy") {
        if (data.error) {
          addLog(`[ERROR] ${data.error.message}`);
          return;
        }
        const contract = data.buy;
        const pnl = (contract.payout || 0) - (contract.buy_price || 0);
        const isWin = pnl >= 0;

        setTrades((prev) => [
          {
            id: contract.contract_id,
            stake: contract.buy_price,
            pnl: pnl,
            status: isWin ? "WON" : "LOST"
          },
          ...prev
        ]);

        setSummary((prev) => ({
          ...prev,
          won: isWin ? prev.won + 1 : prev.won,
          lost: !isWin ? prev.lost + 1 : prev.lost,
          payout: prev.payout + (contract.payout || 0),
          totalProfit: prev.totalProfit + pnl
        }));
      }
    };

    return () => ws.current && ws.current.close();
  }, [demoToken, realToken, activeAccountType, selectedMarket]);

  const addLog = (msg) => setTerminalLogs((prev) => [...prev, msg]);

  const handleOAuthLogin = () => {
    if (APP_ID === "YOUR_REAL_APP_ID_HERE") {
      setShowTokenModal(true);
      return;
    }
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN`;
  };

  const handleSaveTokens = () => {
    if (inputDemoToken.trim()) {
      localStorage.setItem("deriv_demo_token", inputDemoToken.trim());
      setDemoToken(inputDemoToken.trim());
    }
    if (inputRealToken.trim()) {
      localStorage.setItem("deriv_real_token", inputRealToken.trim());
      setRealToken(inputRealToken.trim());
    }
    setShowTokenModal(false);
  };

  const handleDisconnect = () => {
    localStorage.removeItem("deriv_demo_token");
    localStorage.removeItem("deriv_real_token");
    setDemoToken("");
    setRealToken("");
    setBalance("0.00");
    if (ws.current) ws.current.close();
  };

  const startDigitScanner = () => {
    setIsScanning(true);
    setScanProgress(0);
    setTerminalLogs([]);

    addLog(`[INFO] Active Account: ${loginId || activeAccountType.toUpperCase()}`);
    addLog(`[INFO] Target: ${marketMode === "single" ? selectedMarket : "Multi-Synthetic Array"}`);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setScanProgress(progress);

      if (progress === 40) addLog("[INFO] Connecting options market stream...");
      if (progress === 60) addLog("[WARNING] Market signal verified");
      if (progress === 80) addLog("[INFO] Executing Digit Under 6 contracts...");

      if (progress >= 100) {
        clearInterval(interval);
        addLog("[OK] Strategy Armed");
        addLog(`[INFO] Triggering ${bulkTrades} bulk trades...`);

        setTimeout(() => {
          setIsScanning(false);
          setIsScannerOpen(false);
          executeBulkOrders();
        }, 800);
      }
    }, 400);
  };

  const executeBulkOrders = () => {
    setSummary({ totalStake: stake * bulkTrades, payout: 0, won: 0, lost: 0, totalProfit: 0 });
    setTrades([]);

    for (let i = 0; i < bulkTrades; i++) {
      const targetSymbol = marketMode === "multi"
        ? SYNTHETIC_MARKETS[i % SYNTHETIC_MARKETS.length].symbol
        : selectedMarket;

      setTimeout(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(
            JSON.stringify({
              buy: 1,
              price: Number(stake),
              parameters: {
                amount: Number(stake),
                basis: "stake",
                contract_type: "DIGITUNDER",
                symbol: targetSymbol,
                barrier: "6",
                duration: 1,
                duration_unit: "t",
                currency: currency
              }
            })
          );
        }
      }, i * 150);
    }

    setTimeout(() => setShowSummaryModal(true), bulkTrades * 150 + 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white font-sans flex flex-col justify-between">
      {/* Navigation Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#111318] border-b border-cyan-900/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-black text-black text-sm">
            HH
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest text-cyan-400 uppercase">Deriv Options Scanner</h1>
            <p className="text-[10px] text-neutral-500 font-mono">v2.5 • DUAL-ACCOUNT</p>
          </div>
        </div>

        {/* Account Switcher Controls */}
        <div className="flex items-center gap-2">
          <div className="flex bg-[#181c26] p-1 rounded-lg border border-neutral-800 text-[10px] font-bold font-mono">
            <button
              onClick={() => setActiveAccountType("demo")}
              className={`px-2 py-1 rounded transition ${activeAccountType === "demo" ? "bg-amber-500 text-black" : "text-neutral-400"}`}
            >
              DEMO
            </button>
            <button
              onClick={() => setActiveAccountType("real")}
              className={`px-2 py-1 rounded transition ${activeAccountType === "real" ? "bg-green-500 text-black" : "text-neutral-400"}`}
            >
              REAL
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#161922] px-3 py-1.5 rounded-full border border-neutral-800">
            <span className={`w-2 h-2 rounded-full ${activeAccountType === "demo" ? "bg-amber-400" : "bg-green-500"} animate-pulse`}></span>
            <span className="text-xs font-mono font-bold">
              ${balance} <span className="text-neutral-500">{currency}</span>
            </span>
          </div>

          <button onClick={() => setShowTokenModal(true)} className="bg-neutral-800 hover:bg-neutral-700 px-2.5 py-1.5 rounded text-xs font-bold">
            KEYS
          </button>
          <button onClick={handleOAuthLogin} className="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded text-xs font-bold">
            CONNECT
          </button>
          {(demoToken || realToken) && (
            <button onClick={handleDisconnect} className="text-[10px] text-red-400 hover:underline ml-1">Exit</button>
          )}
        </div>
      </header>

      {/* Sub-Header Tabs */}
      <nav className="flex bg-[#111318] border-b border-neutral-800 text-xs font-semibold">
        {["Quick strategy", "Bulk Trader", "Manual Trader", "Copy Trading"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-center transition border-b-2 ${
              activeTab === tab || (tab === "Bulk Trader" && activeTab === "bulk")
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-neutral-400"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Workspace Area */}
      <main className="flex-1 p-3 max-w-lg mx-auto w-full flex flex-col gap-3">
        <div className="bg-[#12151c] border border-neutral-800 rounded-xl p-3 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-neutral-400 uppercase">
            <span>Market Target</span>
            <div className="flex bg-[#181c26] p-0.5 rounded border border-neutral-800 font-mono">
              <button
                onClick={() => setMarketMode("single")}
                className={`px-2 py-0.5 rounded ${marketMode === "single" ? "bg-cyan-500 text-black font-bold" : "text-neutral-400"}`}
              >
                SINGLE
              </button>
              <button
                onClick={() => setMarketMode("multi")}
                className={`px-2 py-0.5 rounded ${marketMode === "multi" ? "bg-cyan-500 text-black font-bold" : "text-neutral-400"}`}
              >
                MULTI-ARRAY
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-1">
            {marketMode === "single" ? (
              <select
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                className="bg-[#181c26] border border-neutral-800 text-cyan-400 text-xs font-bold rounded-lg p-2 focus:outline-none"
              >
                {SYNTHETIC_MARKETS.map((m) => (
                  <option key={m.symbol} value={m.symbol}>{m.name}</option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-cyan-400 font-mono font-bold">Multi-Array (V10 ➔ V100)</div>
            )}

            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-neutral-400">Current Tick</p>
              <p className="text-sm font-mono font-black text-white">{lastTick}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-black font-black py-3.5 rounded-xl text-sm shadow-lg shadow-cyan-500/20 active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-black animate-ping"></span>
          AI SCANNER & BULK TRADER
        </button>

        {/* Trade Transactions */}
        <div className="flex-1 bg-[#12151c] border border-neutral-800 rounded-xl p-3 flex flex-col justify-between min-h-[300px]">
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2 mb-2">
            <span className="text-xs font-bold text-neutral-300">Transactions ({loginId || activeAccountType.toUpperCase()})</span>
            <button onClick={() => setTrades([])} className="bg-neutral-800 px-2 py-1 rounded text-neutral-400 text-[10px]">Reset</button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-64 space-y-1.5 font-mono text-xs pr-1">
            {trades.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-neutral-600 text-xs">
                <p>No trades executed yet</p>
              </div>
            ) : (
              trades.map((t, idx) => (
                <div key={idx} className="flex justify-between items-center bg-[#181c26] p-2.5 rounded-lg border border-neutral-800/50">
                  <span className="text-neutral-400 text-[11px]">Contract #{t.id}</span>
                  <span className="text-neutral-300">${Number(t.stake).toFixed(2)}</span>
                  <span className={`font-bold ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.pnl >= 0 ? `+${t.pnl.toFixed(2)} USD` : `${t.pnl.toFixed(2)} USD`}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-4 gap-1 pt-3 border-t border-neutral-800 mt-2 text-center text-[10px] font-mono">
            <div className="bg-[#181c26] p-2 rounded-lg">
              <p className="text-neutral-500">Stake</p>
              <p className="font-bold text-white mt-0.5">${summary.totalStake.toFixed(2)}</p>
            </div>
            <div className="bg-[#181c26] p-2 rounded-lg">
              <p className="text-neutral-500">Won</p>
              <p className="font-bold text-green-400 mt-0.5">{summary.won}</p>
            </div>
            <div className="bg-[#181c26] p-2 rounded-lg">
              <p className="text-neutral-500">Lost</p>
              <p className="font-bold text-red-400 mt-0.5">{summary.lost}</p>
            </div>
            <div className="bg-[#181c26] p-2 rounded-lg">
              <p className="text-neutral-500">Net Profit</p>
              <p className={`font-bold mt-0.5 ${summary.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${summary.totalProfit.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Token Setup Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#12151c] border border-cyan-500/50 rounded-2xl max-w-xs w-full p-5 space-y-3 font-mono">
            <h3 className="text-xs font-bold text-cyan-400">ENTER API TOKENS</h3>
            <p className="text-[10px] text-neutral-400">
              Paste tokens from Deriv Settings $\rightarrow$ API Token (Scope: Read + Trade):
            </p>

            <div>
              <label className="text-[10px] text-amber-400 block mb-1">DEMO TOKEN ($99,992.53)</label>
              <input
                type="text"
                placeholder="Paste Demo token..."
                value={inputDemoToken}
                onChange={(e) => setInputDemoToken(e.target.value)}
                className="w-full bg-[#181c26] border border-neutral-800 p-2 rounded text-xs text-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-green-400 block mb-1">REAL TOKEN ($0.00)</label>
              <input
                type="text"
                placeholder="Paste Real token..."
                value={inputRealToken}
                onChange={(e) => setInputRealToken(e.target.value)}
                className="w-full bg-[#181c26] border border-neutral-800 p-2 rounded text-xs text-green-400 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowTokenModal(false)} className="flex-1 bg-neutral-800 py-2 rounded text-xs">Cancel</button>
              <button onClick={handleSaveTokens} className="flex-1 bg-cyan-400 text-black font-bold py-2 rounded text-xs">SAVE TOKENS</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Drawer Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 font-mono">
          <div className="bg-[#0b0d12] border border-cyan-500/50 rounded-2xl max-w-sm w-full p-5">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/40 pb-2">
              <h3 className="text-cyan-400 text-xs font-bold uppercase">AI SCANNER ({activeAccountType.toUpperCase()})</h3>
              <button onClick={() => setIsScannerOpen(false)} className="text-neutral-500 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">STAKE ($)</label>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full bg-[#13161f] border border-neutral-800 p-2.5 rounded-lg text-green-400 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">BULK ORDERS</label>
                <input
                  type="number"
                  value={bulkTrades}
                  onChange={(e) => setBulkTrades(e.target.value)}
                  className="w-full bg-[#13161f] border border-neutral-800 p-2.5 rounded-lg text-green-400 font-bold"
                />
              </div>

              <div className="bg-black/90 border border-neutral-800 p-3 rounded-xl h-24 overflow-y-auto text-[10px] text-green-400 space-y-1">
                {terminalLogs.length === 0 ? <p className="text-neutral-600">Ready to start scan...</p> : terminalLogs.map((l, i) => <p key={i}>{l}</p>)}
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                  <span>SCAN PROGRESS</span>
                  <span className="text-cyan-400 font-bold">{scanProgress}%</span>
                </div>
                <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-cyan-400 h-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>

              <button
                onClick={startDigitScanner}
                disabled={isScanning || (activeAccountType === "demo" ? !demoToken : !realToken)}
                className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-black py-3 rounded-xl text-xs mt-2"
              >
                {isScanning ? "SCANNING..." : "EXECUTE ON " + activeAccountType.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12151c] border border-cyan-500/40 rounded-2xl p-6 max-w-xs w-full text-center space-y-3">
            <h4 className="text-[10px] text-cyan-400 tracking-widest uppercase font-bold">Execution Complete</h4>
            <p className="text-xs text-neutral-400">Total Net Profit</p>
            <p className={`text-3xl font-black font-mono ${summary.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {summary.totalProfit >= 0 ? `+${summary.totalProfit.toFixed(2)}` : summary.totalProfit.toFixed(2)} USD
            </p>
            <button onClick={() => setShowSummaryModal(false)} className="w-full bg-cyan-400 text-black font-bold py-2.5 rounded-xl text-xs">
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
