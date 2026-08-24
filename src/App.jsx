import React, { useState, useEffect, useRef } from "react";

const APP_ID = "34cqHOYTzkye6dCyuLelT"; // Replace with your App ID from developers.deriv.com
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

export default function App() {
  const [token, setToken] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [currency, setCurrency] = useState("USD");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [stake, setStake] = useState(1);
  const [bulkTrades, setBulkTrades] = useState(25);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [summary, setSummary] = useState({ totalStake: 0, payout: 0, won: 0, lost: 0, totalProfit: 0 });
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  
  const ws = useRef(null);

  // 1. Handle OAuth Redirect & Token Capture
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

  // 2. WebSocket Connection Lifecycle
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
        // Subscribe to balance updates
        ws.current.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      }

      if (data.msg_type === "balance") {
        setBalance(data.balance.balance);
      }

      if (data.msg_type === "buy") {
        const contract = data.buy;
        const pnl = contract.payout - contract.buy_price;
        const isWin = pnl >= 0;

        setTrades((prev) => [
          {
            id: contract.contract_id,
            entry: contract.start_time,
            stake: contract.buy_price,
            pnl: pnl,
            status: isWin ? "WON" : "LOST"
          },
          ...prev
        ]);

        setSummary((prev) => {
          const newWon = isWin ? prev.won + 1 : prev.won;
          const newLost = !isWin ? prev.lost + 1 : prev.lost;
          const newTotalProfit = prev.totalProfit + pnl;
          return {
            ...prev,
            won: newWon,
            lost: newLost,
            payout: prev.payout + contract.payout,
            totalProfit: newTotalProfit
          };
        });
      }
    };

    return () => ws.current && ws.current.close();
  }, [token]);

  const addLog = (msg) => setTerminalLogs((prev) => [...prev, msg]);

  const handleDerivLogin = () => {
    window.location.href = `https://oauth.deriv.com/oauth2/authorize?app_id=${APP_ID}`;
  };

  // 3. Automated Digit Scanner Logic
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
        }, 1000);
      }
    }, 600);
  };

  // 4. Bulk Trade Execution Engine
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
                symbol: "R_100", // Volatility 100 Index
                barrier: "6",
                duration: 1,
                duration_unit: "t",
                currency: currency
              }
            })
          );
        }
      }, i * 150); // Stagger bulk orders
    }

    setTimeout(() => setShowSummaryModal(true), bulkTrades * 150 + 2000);
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans flex flex-col">
      {/* Top Header */}
      <header className="flex justify-between items-center p-4 bg-neutral-800 border-b border-neutral-700">
        <h1 className="text-xl font-bold tracking-wider text-cyan-400">ANALYSIS HUB</h1>
        {token ? (
          <div className="flex items-center gap-3">
            <span className="text-sm bg-neutral-700 px-3 py-1 rounded-full text-green-400">
              ${balance} {currency}
            </span>
          </div>
        ) : (
          <button onClick={handleDerivLogin} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm font-semibold">
            Log in with Deriv
          </button>
        )}
      </header>

      {/* Main Control Panel */}
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full flex flex-col gap-4">
        <div className="flex gap-2 bg-neutral-800 p-2 rounded">
          <button onClick={() => setIsScannerOpen(true)} className="flex-1 bg-cyan-600 hover:bg-cyan-500 py-3 rounded font-bold">
            AI SCANNER & BULK TRADER
          </button>
        </div>

        {/* Live Transactions Feed */}
        <div className="flex-1 bg-neutral-800 rounded p-4 flex flex-col border border-neutral-700">
          <h2 className="text-md font-semibold mb-3 border-b border-neutral-700 pb-2">Transactions Log</h2>
          <div className="flex-1 overflow-y-auto max-h-80 space-y-2">
            {trades.map((t, idx) => (
              <div key={idx} className="flex justify-between items-center bg-neutral-900 p-3 rounded text-sm">
                <span>Contract Trade #{t.id}</span>
                <span>${t.stake.toFixed(2)}</span>
                <span className={t.pnl >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                  {t.pnl >= 0 ? `+${t.pnl.toFixed(2)} USD` : `${t.pnl.toFixed(2)} USD`}
                </span>
              </div>
            ))}
          </div>

          {/* Metric Bottom Bar */}
          <div className="grid grid-cols-4 gap-2 pt-4 border-t border-neutral-700 mt-2 text-center text-xs">
            <div>
              <p className="text-neutral-400">Total Stake</p>
              <p className="font-bold">${summary.totalStake.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-neutral-400">Contracts Won</p>
              <p className="font-bold text-green-400">{summary.won}</p>
            </div>
            <div>
              <p className="text-neutral-400">Contracts Lost</p>
              <p className="font-bold text-red-400">{summary.lost}</p>
            </div>
            <div>
              <p className="text-neutral-400">Total P/L</p>
              <p className={`font-bold ${summary.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${summary.totalProfit.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* AI Market Matrix Popup Modal (Matching Video Terminal Overlay) */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-950 border border-cyan-500 rounded-lg max-w-md w-full p-5 shadow-2xl relative">
            <button onClick={() => setIsScannerOpen(false)} className="absolute top-3 right-3 text-red-500 font-bold">✕</button>
            <h3 className="text-cyan-400 text-sm font-mono tracking-widest mb-4">AI MARKET MATRIX - DIGIT SCANNER</h3>
            
            <div className="space-y-4 font-mono text-sm">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">STAKE ($)</label>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded text-green-400 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">NO. OF BULK TRADES</label>
                <input
                  type="number"
                  value={bulkTrades}
                  onChange={(e) => setBulkTrades(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 p-2 rounded text-green-400 font-bold"
                />
              </div>

              {/* Console Diagnostic Window */}
              <div className="bg-black border border-neutral-800 p-3 rounded h-32 overflow-y-auto text-xs text-green-500 space-y-1">
                {terminalLogs.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </div>

              {/* Scan Bar */}
              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>LOW-RISK SCAN</span>
                  <span>{scanProgress}%</span>
                </div>
                <div className="w-full bg-neutral-800 h-2 rounded overflow-hidden">
                  <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>

              <button
                onClick={startDigitScanner}
                disabled={isScanning || !token}
                className="w-full bg-cyan-600 hover:bg-cyan-500 py-3 rounded font-bold text-black tracking-wider"
              >
                {isScanning ? "SCANNING..." : "SCAN FOR BEST MARKET"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Completion Session Card */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6 max-w-xs w-full text-center space-y-3">
            <h4 className="text-xs text-neutral-400 uppercase font-bold">Bulk Session Complete</h4>
            <p className="text-xs text-neutral-300">Total Profit</p>
            <p className={`text-3xl font-extrabold ${summary.totalProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {summary.totalProfit >= 0 ? `+${summary.totalProfit.toFixed(2)}` : summary.totalProfit.toFixed(2)} USD
            </p>
            <div className="flex justify-between text-xs bg-neutral-900 p-3 rounded font-mono">
              <div>Trades: <b>{trades.length}</b></div>
              <div className="text-green-400">Won: <b>{summary.won}</b></div>
              <div className="text-red-400">Lost: <b>{summary.lost}</b></div>
            </div>
            <button onClick={() => setShowSummaryModal(false)} className="w-full bg-cyan-600 py-2 rounded font-bold text-sm">
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}