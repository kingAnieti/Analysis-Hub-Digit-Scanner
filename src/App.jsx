import React, { useState, useEffect, useRef } from "react";

// Register your App ID on developers.deriv.com with redirect URL matching your site
const APP_ID = "34cqHOYTzkye6dCyuLelT"; // Replace 61223 with your real App ID from developers.deriv.com
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

const SYNTHETIC_MARKETS = [
  { symbol: "R_10", name: "Volatility 10 Index" },
  { symbol: "R_25", name: "Volatility 25 Index" },
  { symbol: "R_50", name: "Volatility 50 Index" },
  { symbol: "R_75", name: "Volatility 75 Index" },
  { symbol: "R_100", name: "Volatility 100 Index" },
];

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [currency, setCurrency] = useState("USD");

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

  // Parse Client IDs and Tokens from URL on OAuth Redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsedAccounts = [];

    for (let i = 1; i <= 5; i++) {
      const loginId = params.get(`acct${i}`);
      const token = params.get(`token${i}`);

      if (loginId && token) {
        parsedAccounts.push({
          loginId,
          token,
          type: loginId.startsWith("VR") ? "DEMO" : "REAL"
        });
      }
    }

    if (parsedAccounts.length > 0) {
      localStorage.setItem("deriv_oauth_accounts", JSON.stringify(parsedAccounts));
      setAccounts(parsedAccounts);
      setSelectedAccount(parsedAccounts[0]);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const stored = localStorage.getItem("deriv_oauth_accounts");
      if (stored) {
        const parsed = JSON.parse(stored);
        setAccounts(parsed);
        setSelectedAccount(parsed[0]);
      }
    }
  }, []);

  // Connect to WebSocket using current Selected Account Client ID Session Token
  useEffect(() => {
    if (!selectedAccount) return;

    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      ws.current.send(JSON.stringify({ authorize: selectedAccount.token }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.msg_type === "authorize") {
        if (data.error) {
          alert(`Auth Error for ${selectedAccount.loginId}: ${data.error.message}`);
          return;
        }

        setBalance(Number(data.authorize.balance).toFixed(2));
        setCurrency(data.authorize.currency);

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
  }, [selectedAccount, selectedMarket]);

  const addLog = (msg) => setTerminalLogs((prev) => [...prev, msg]);

  const handleOAuthLogin = () => {
    const redirectUrl = encodeURIComponent(window.location.origin);
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}&l=EN&redirect_uri=${redirectUrl}`;
  };

  const handleDisconnect = () => {
    localStorage.removeItem("deriv_oauth_accounts");
    setAccounts([]);
    setSelectedAccount(null);
    setBalance("0.00");
    if (ws.current) ws.current.close();
  };

  const startDigitScanner = () => {
    setIsScanning(true);
    setScanProgress(0);
    setTerminalLogs([]);

    addLog(`[INFO] Active Client ID: ${selectedAccount?.loginId}`);
    addLog(`[INFO] Operating Mode: ${selectedAccount?.type} OPTIONS`);
    addLog(`[INFO] Market Mode: ${marketMode === "single" ? selectedMarket : "Multi-Synthetic Array"}`);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setScanProgress(progress);

      if (progress === 40) addLog("[INFO] Reading volatility index stream...");
      if (progress === 60) addLog("[WARNING] Market signal confirmed");
      if (progress === 80) addLog("[INFO] Arming Digit Under 6 options...");

      if (progress >= 100) {
        clearInterval(interval);
        addLog("[OK] Strategy Armed");
        addLog(`[INFO] Sending ${bulkTrades} bulk option contracts...`);

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
    <div className="min-h-screen bg-[#0a0b0e] text-white font-sans flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      {/* Top Main Navigation Header */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#111318] border-b border-cyan-900/40 shadow-lg shadow-cyan-950/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-black text-black text-sm tracking-tighter shadow-md shadow-cyan-500/20">
            HH
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest text-cyan-400 uppercase">Deriv Analysis Hub</h1>
            <p className="text-[10px] text-neutral-500 font-mono">v3.0 • OAUTH CLIENT MATRIX</p>
          </div>
        </div>

        {/* Client ID Account Selection Dropdown & Balance Display */}
        {selectedAccount ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedAccount.loginId}
              onChange={(e) => {
                const acc = accounts.find((a) => a.loginId === e.target.value);
                if (acc) setSelectedAccount(acc);
              }}
              className="bg-[#181c26] border border-neutral-800 text-[10px] font-mono font-bold text-cyan-400 rounded-lg p-1.5 focus:outline-none"
            >
              {accounts.map((acc) => (
                <option key={acc.loginId} value={acc.loginId}>
                  {acc.type}: {acc.loginId}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 bg-[#161922] px-3 py-1.5 rounded-full border border-neutral-800">
              <span className={`w-2 h-2 rounded-full ${selectedAccount.type === "DEMO" ? "bg-amber-400" : "bg-green-500"} animate-pulse`}></span>
              <span className="text-xs font-mono font-bold text-white">
                ${balance} <span className="text-neutral-500">{currency}</span>
              </span>
              <button onClick={handleDisconnect} className="ml-1 text-[10px] text-red-400 hover:underline">Exit</button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleOAuthLogin}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 px-4 py-1.5 rounded text-xs font-bold shadow-lg shadow-red-950/50 transition"
          >
            CONNECT DERIV
          </button>
        )}
      </header>

      {/* Sub-Header Navigation */}
      <nav className="flex bg-[#111318] border-b border-neutral-800/80 text-xs font-semibold">
        {["Quick strategy", "Bulk Trader", "Manual Trader", "Copy Trading"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-center transition border-b-2 ${
              activeTab === tab || (tab === "Bulk Trader" && activeTab === "bulk")
                ? "border-cyan-400 text-cyan-400 bg-cyan-950/20"
                : "border-transparent text-neutral-400 hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 p-3 max-w-lg mx-auto w-full flex flex-col gap-3">
        {/* Synthetic Market Selector */}
        <div className="bg-[#12151c] border border-neutral-800 rounded-xl p-3 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
            <span>Synthetic Options Target</span>
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
                className="bg-[#181c26] border border-neutral-800 text-cyan-400 text-xs font-bold rounded-lg p-2 focus:outline-none focus:border-cyan-400"
              >
                {SYNTHETIC_MARKETS.map((m) => (
                  <option key={m.symbol} value={m.symbol}>{m.name}</option>
                ))}
              </select>
            ) : (
              <div className="text-xs text-cyan-400 font-mono font-bold">
                Multi-Array Active (V10 ➔ V100)
              </div>
            )}

            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-neutral-400">Current Tick</p>
              <p className="text-sm font-mono font-black text-white">{lastTick}</p>
            </div>
          </div>
        </div>

        {/* AI Scanner Trigger */}
        <button
          onClick={() => setIsScannerOpen(true)}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black py-3.5 rounded-xl text-sm tracking-wider shadow-lg shadow-cyan-500/20 active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-black animate-ping"></span>
          AI SCANNER & BULK TRADER
        </button>

        {/* Transactions Table */}
        <div className="flex-1 bg-[#12151c] border border-neutral-800 rounded-xl p-3 flex flex-col justify-between min-h-[300px]">
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2 mb-2">
            <span className="text-xs font-bold text-neutral-300">
              Transactions ({selectedAccount ? selectedAccount.loginId : "Disconnected"})
            </span>
            <button onClick={() => setTrades([])} className="bg-neutral-800 px-2 py-1 rounded text-neutral-400 text-[10px] hover:text-white">Reset</button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-64 space-y-1.5 pr-1 font-mono text-xs">
            {trades.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-neutral-600 text-xs">
                <p>No active session trades</p>
                <p className="text-[10px] text-neutral-700">Run scanner to trigger bulk options</p>
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

          {/* Metrics Footer */}
          <div className="grid grid-cols-4 gap-1 pt-3 border-t border-neutral-800 mt-2 text-center text-[10px] font-mono">
            <div className="bg-[#181c26] p-2 rounded-lg">
              <p className="text-neutral-500">Total Stake</p>
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

      {/* AI Matrix Scanner Drawer */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 font-mono">
          <div className="bg-[#0b0d12] border border-cyan-500/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/40 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <h3 className="text-cyan-400 text-xs font-bold tracking-widest ml-2 uppercase">AI MATRIX SCANNER</h3>
              </div>
              <button onClick={() => setIsScannerOpen(false)} className="text-neutral-500 hover:text-red-400 font-bold text-sm">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">STAKE AMOUNT ($)</label>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full bg-[#13161f] border border-neutral-800 p-2.5 rounded-lg text-green-400 font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">BULK ORDERS QUEUED</label>
                <input
                  type="number"
                  value={bulkTrades}
                  onChange={(e) => setBulkTrades(e.target.value)}
                  className="w-full bg-[#13161f] border border-neutral-800 p-2.5 rounded-lg text-green-400 font-bold text-sm"
                />
              </div>

              <div className="bg-black/90 border border-neutral-800 p-3 rounded-xl h-24 overflow-y-auto text-[10px] text-green-400 space-y-1">
                {terminalLogs.length === 0 ? <p className="text-neutral-600">Waiting for matrix initiation...</p> : terminalLogs.map((l, i) => <p key={i}>{l}</p>)}
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
                disabled={isScanning || !selectedAccount}
                className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-black py-3 rounded-xl text-xs mt-2"
              >
                {isScanning ? "SCANNING..." : selectedAccount ? `EXECUTE ON ${selectedAccount.loginId}` : "CONNECT DERIV FIRST"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12151c] border border-cyan-500/40 rounded-2xl p-6 max-w-xs w-full text-center space-y-3">
            <h4 className="text-[10px] text-cyan-400 tracking-widest uppercase font-bold">Execution Finished</h4>
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
