import React, { useState, useEffect, useRef } from "react";

const APP_ID = "YOUR_DERIV_APP_ID"; // Replace with your App ID
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export default function App() {
  const [token, setToken] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [currency, setCurrency] = useState("USD");
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
  const [lastTick, setLastTick] = useState("635.01");
  
  const ws = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token1");
    if (urlToken) {
      localStorage.setItem("deriv_token", urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const storedToken = localStorage.getItem("deriv_token");
      if (storedToken) setToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      ws.current.send(JSON.stringify({ authorize: token }));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.msg_type === "authorize") {
        setBalance(data.authorize.balance);
        setCurrency(data.authorize.currency);
        ws.current.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        ws.current.send(JSON.stringify({ ticks: "R_100" }));
      }

      if (data.msg_type === "balance") setBalance(data.balance.balance);

      if (data.msg_type === "tick") {
        setLastTick(Number(data.tick.quote).toFixed(2));
      }

      if (data.msg_type === "buy") {
        const contract = data.buy;
        const pnl = contract.payout - contract.buy_price;
        const isWin = pnl >= 0;

        setTrades((prev) => [
          {
            id: contract.contract_id,
            spot: contract.start_time,
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
          payout: prev.payout + contract.payout,
          totalProfit: prev.totalProfit + pnl
        }));
      }
    };

    return () => ws.current && ws.current.close();
  }, [token]);

  const addLog = (msg) => setTerminalLogs((prev) => [...prev, msg]);

  const handleDerivLogin = () => {
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}`;
  };

  const startDigitScanner = () => {
    setIsScanning(true);
    setScanProgress(0);
    setTerminalLogs([]);

    addLog("[INFO] Authenticating AI market matrix...");
    addLog("[OK] Synthetic stream linked");
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setScanProgress(progress);
      
      if (progress === 40) addLog("[INFO] Reading volatility clusters...");
      if (progress === 60) addLog("[WARNING] Signal pressure rising");
      if (progress === 80) addLog("[INFO] Checking last digit sequence...");

      if (progress >= 100) {
        clearInterval(interval);
        addLog("[OK] Pattern scanner armed for Over 4 / Under 6");
        addLog(`[INFO] Queueing exactly ${bulkTrades} trades at once...`);
        
        setTimeout(() => {
          setIsScanning(false);
          setIsScannerOpen(false);
          executeBulkOrders();
        }, 800);
      }
    }, 500);
  };

  const executeBulkOrders = () => {
    setSummary({ totalStake: stake * bulkTrades, payout: 0, won: 0, lost: 0, totalProfit: 0 });
    setTrades([]);

    for (let i = 0; i < bulkTrades; i++) {
      setTimeout(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(
            JSON.stringify({
              buy: 1,
              price: stake,
              parameters: {
                amount: Number(stake),
                basis: "stake",
                contract_type: "DIGITUNDER",
                symbol: "R_100",
                barrier: "6",
                duration: 1,
                duration_unit: "t",
                currency: currency
              }
            })
          );
        }
      }, i * 120);
    }

    setTimeout(() => setShowSummaryModal(true), bulkTrades * 120 + 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white font-sans flex flex-col justify-between selection:bg-cyan-500 selection:text-black">
      {/* Top Header with Futuristic Logo */}
      <header className="flex justify-between items-center px-4 py-3 bg-[#111318] border-b border-cyan-900/40 shadow-lg shadow-cyan-950/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-black text-black text-sm tracking-tighter shadow-md shadow-cyan-500/20">
            HH
          </div>
          <div>
            <h1 className="text-xs font-black tracking-widest text-cyan-400 uppercase">Deriv Analysis Hub</h1>
            <p className="text-[10px] text-neutral-500 font-mono">v2.4 • AI MATRIX</p>
          </div>
        </div>

        {token ? (
          <div className="flex items-center gap-2 bg-[#161922] px-3 py-1.5 rounded-full border border-neutral-800">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs font-mono font-bold text-green-400">
              ${balance} <span className="text-neutral-500">{currency}</span>
            </span>
          </div>
        ) : (
          <button onClick={handleDerivLogin} className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 px-4 py-1.5 rounded text-xs font-bold shadow-lg shadow-red-950/50 transition">
            CONNECT DERIV
          </button>
        )}
      </header>

      {/* Navigation Sub-Header (As seen in video) */}
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

      {/* Main Content Area */}
      <main className="flex-1 p-3 max-w-lg mx-auto w-full flex flex-col gap-3">
        {/* Live Market Bar */}
        <div className="bg-[#12151c] border border-neutral-800 rounded-xl p-3 flex justify-between items-center shadow-inner">
          <div>
            <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Market Symbol</p>
            <p className="text-xs font-bold text-cyan-400">Volatility 100 Index</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Current Tick</p>
            <p className="text-sm font-mono font-black text-white">{lastTick}</p>
          </div>
        </div>

        {/* Trigger Button to launch Scanner Drawer */}
        <button
          onClick={() => setIsScannerOpen(true)}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black py-3.5 rounded-xl text-sm tracking-wider shadow-lg shadow-cyan-500/20 active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-black animate-ping"></span>
          AI SCANNER & BULK TRADER
        </button>

        {/* Transactions Feed (Exact Video Table Clone) */}
        <div className="flex-1 bg-[#12151c] border border-neutral-800 rounded-xl p-3 flex flex-col justify-between min-h-[300px]">
          <div className="flex justify-between items-center border-b border-neutral-800 pb-2 mb-2">
            <span className="text-xs font-bold text-neutral-300">Transactions</span>
            <div className="flex gap-2 text-[10px]">
              <button onClick={() => setTrades([])} className="bg-neutral-800 px-2 py-1 rounded text-neutral-400 hover:text-white">Reset</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-64 space-y-1.5 pr-1 font-mono text-xs">
            {trades.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-neutral-600 text-xs">
                <p>No active session trades</p>
                <p className="text-[10px] text-neutral-700">Run scanner to trigger bulk orders</p>
              </div>
            ) : (
              trades.map((t, idx) => (
                <div key={idx} className="flex justify-between items-center bg-[#181c26] p-2.5 rounded-lg border border-neutral-800/50">
                  <span className="text-neutral-400 text-[11px]">Contract #{t.id}</span>
                  <span className="text-neutral-300">${t.stake.toFixed(2)}</span>
                  <span className={`font-bold ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.pnl >= 0 ? `+${t.pnl.toFixed(2)} USD` : `${t.pnl.toFixed(2)} USD`}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Metric Dashboard Bottom Card */}
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

      {/* Cyberpunk Matrix Scanner Modal (Direct Match to Video) */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#0b0d12] border border-cyan-500/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl shadow-cyan-950/50 relative font-mono">
            <div className="flex justify-between items-center mb-4 border-b border-cyan-900/40 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <h3 className="text-cyan-400 text-xs font-bold tracking-widest ml-2 uppercase">AI MARKET MATRIX</h3>
              </div>
              <button onClick={() => setIsScannerOpen(false)} className="text-neutral-500 hover:text-red-400 font-bold text-sm">✕</button>
            </div>

            <p className="text-[11px] text-cyan-300 font-bold mb-3 tracking-wide">Analysis Dashboard - Digit Scanner</p>
            
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-wider mb-1">STAKE ($)</label>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full bg-[#13161f] border border-neutral-800 p-2.5 rounded-lg text-green-400 font-bold focus:outline-none focus:border-cyan-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase tracking-wider mb-1">NO. OF BULK TRADES</label>
                <input
                  type="number"
                  value={bulkTrades}
                  onChange={(e) => setBulkTrades(e.target.value)}
                  className="w-full bg-[#13161f] border border-neutral-800 p-2.5 rounded-lg text-green-400 font-bold focus:outline-none focus:border-cyan-500 text-sm"
                />
              </div>

              {/* Terminal Logs Window */}
              <div className="bg-black/90 border border-neutral-800/80 p-3 rounded-xl h-28 overflow-y-auto text-[10px] text-green-400 font-mono space-y-1 shadow-inner">
                {terminalLogs.length === 0 ? <p className="text-neutral-600">Waiting for scan data...</p> : terminalLogs.map((l, i) => <p key={i}>{l}</p>)}
              </div>

              {/* Matrix Progress Bar */}
              <div>
                <div className="flex justify-between text-[10px] text-neutral-400 mb-1">
                  <span>LOW-RISK SCAN</span>
                  <span className="text-cyan-400 font-bold">{scanProgress}%</span>
                </div>
                <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden border border-neutral-800">
                  <div className="bg-gradient-to-r from-cyan-500 to-green-400 h-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>

              <button
                onClick={startDigitScanner}
                disabled={isScanning || !token}
                className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-black py-3 rounded-xl tracking-wider text-xs shadow-lg shadow-cyan-400/20 active:scale-95 transition mt-2"
              >
                {isScanning ? "SCANNING..." : "SCAN FOR BEST MARKET"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Complete Win/Loss Modal Card */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12151c] border border-cyan-500/40 rounded-2xl p-6 max-w-xs w-full text-center space-y-3 shadow-2xl">
            <h4 className="text-[10px] text-cyan-400 tracking-widest uppercase font-bold">Bulk Session Complete</h4>
            <p className="text-xs text-neutral-400">Total Profit</p>
            <p className={`text-3xl font-black font-mono ${summary.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {summary.totalProfit >= 0 ? `+${summary.totalProfit.toFixed(2)}` : summary.totalProfit.toFixed(2)} USD
            </p>
            <div className="flex justify-between text-xs bg-[#181c26] p-3 rounded-xl font-mono text-neutral-300">
              <div>Trades: <b>{trades.length}</b></div>
              <div className="text-green-400">Won: <b>{summary.won}</b></div>
              <div className="text-red-400">Lost: <b>{summary.lost}</b></div>
            </div>
            <button onClick={() => setShowSummaryModal(false)} className="w-full bg-cyan-400 hover:bg-cyan-300 text-black font-bold py-2.5 rounded-xl text-xs tracking-wider">
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
