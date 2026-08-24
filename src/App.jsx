import React, { useState, useEffect } from "react";

const SYNTHETIC_MARKETS = [
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index" },
  { symbol: "R_100", name: "Volatility 100 Index" },
  { symbol: "R_75", name: "Volatility 75 Index" },
  { symbol: "R_50", name: "Volatility 50 Index" },
  { symbol: "R_25", name: "Volatility 25 Index" },
  { symbol: "R_10", name: "Volatility 10 Index" },
];

const TAPE_LENGTH = 28;

export default function App() {
  // Credentials & Account State
  const [loginIdInput, setLoginIdInput] = useState("");
  const [serverInput, setServerInput] = useState("Deriv-Server");
  const [passwordTokenInput, setPasswordTokenInput] = useState("");
  const [accountTypeInput, setAccountTypeInput] = useState("DEMO");

  const [savedAccounts, setSavedAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [balance, setBalance] = useState("10000.00");
  const [currency, setCurrency] = useState("USD");

  const [marketMode, setMarketMode] = useState("single");
  const [selectedMarket, setSelectedMarket] = useState("1HZ100V");

  const [activeTab, setActiveTab] = useState("Bulk Trader");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [stake, setStake] = useState(1);
  const [bulkTrades, setBulkTrades] = useState(25);
  const [barrier, setBarrier] = useState(6);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [trades, setTrades] = useState([]);
  const [summary, setSummary] = useState({ totalStake: 0, payout: 0, won: 0, lost: 0, totalProfit: 0 });
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [lastTick, setLastTick] = useState("1234.50");
  const [digitTape, setDigitTape] = useState([]);

  // Load saved accounts from local storage
  useEffect(() => {
    const stored = localStorage.getItem("deriv_full_credentials");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSavedAccounts(parsed);
        if (parsed.length > 0) setSelectedAccount(parsed[0]);
      } catch (e) {
        console.error("Failed to load saved accounts", e);
      }
    }
  }, []);

  // Internal Tick Generator (Replaces WebSocket Stream)
  useEffect(() => {
    if (!selectedAccount) return;

    const interval = setInterval(() => {
      const randomPrice = (Math.random() * 2000 + 1000).toFixed(2);
      const quoteStr = String(randomPrice);
      const lastDigit = Number(quoteStr[quoteStr.length - 1]);

      setLastTick(randomPrice);
      setDigitTape((prev) => {
        const next = [...prev, lastDigit];
        return next.length > TAPE_LENGTH ? next.slice(next.length - TAPE_LENGTH) : next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedAccount, selectedMarket]);

  const addLog = (msg) => setTerminalLogs((prev) => [...prev, msg]);

  const handleConnectAccount = (e) => {
    e.preventDefault();
    if (!loginIdInput.trim()) return;

    const newAcc = {
      loginId: loginIdInput.trim(),
      server: serverInput,
      token: passwordTokenInput.trim() || "DIRECT_AUTH_KEY",
      type: accountTypeInput,
    };

    const updated = [newAcc, ...savedAccounts.filter((a) => a.loginId !== newAcc.loginId)];
    setSavedAccounts(updated);
    localStorage.setItem("deriv_full_credentials", JSON.stringify(updated));

    setSelectedAccount(newAcc);
    setLoginIdInput("");
    setPasswordTokenInput("");
  };

  const openDTrader = () => {
    const symbol = selectedMarket || "1HZ100V";
    let dTraderUrl = `https://dtrader.deriv.com/?chart_type=area&interval=1t&symbol=${symbol}`;
    if (selectedAccount?.loginId) {
      dTraderUrl += `&account=${selectedAccount.loginId}`;
    }
    window.open(dTraderUrl, "_blank");
  };

  const handleDisconnect = () => {
    setSelectedAccount(null);
    setBalance("0.00");
    setLastTick("0.00");
    setDigitTape([]);
  };

  const startDigitScanner = () => {
    setIsScanning(true);
    setScanProgress(0);
    setTerminalLogs([]);

    addLog(`ACCOUNT   ${selectedAccount?.loginId}`);
    addLog(`SERVER    ${selectedAccount?.server || "Deriv-Server"}`);
    addLog(`MARKET    ${marketMode === "single" ? selectedMarket : "MULTI-ARRAY"}`);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      setScanProgress(progress);

      if (progress === 40) addLog("READING   digit stream...");
      if (progress === 60) addLog("VERIFIED  signal confidence nominal");
      if (progress === 80) addLog(`CALIBRATE barrier = digit under ${barrier}`);

      if (progress >= 100) {
        clearInterval(interval);
        addLog("ARMED     strategy ready");
        addLog(`SENDING   ${bulkTrades} orders...`);

        setTimeout(() => {
          setIsScanning(false);
          setIsScannerOpen(false);
          executeBulkOrders();
        }, 800);
      }
    }, 400);
  };

  // Internal Trade Executor (Replaces WebSocket Order Routing)
  const executeBulkOrders = () => {
    let currentBalance = parseFloat(balance);
    let sessionStake = 0;
    let sessionPayout = 0;
    let wonCount = 0;
    let lostCount = 0;
    let netProfit = 0;
    const newTrades = [];

    for (let i = 0; i < bulkTrades; i++) {
      const tradeStake = Number(stake);
      const generatedDigit = Math.floor(Math.random() * 10);
      const isWin = generatedDigit < barrier;

      // Calculate payouts (DIGITUNDER win payout standard ~95% return)
      const payout = isWin ? tradeStake * 1.95 : 0;
      const pnl = isWin ? tradeStake * 0.95 : -tradeStake;

      sessionStake += tradeStake;
      sessionPayout += payout;
      netProfit += pnl;

      if (isWin) wonCount++;
      else lostCount++;

      newTrades.unshift({
        id: Math.floor(1000000000 + Math.random() * 9000000000),
        stake: tradeStake,
        pnl: pnl,
        status: isWin ? "WON" : "LOST"
      });
    }

    setTrades((prev) => [...newTrades, ...prev]);
    setSummary({
      totalStake: sessionStake,
      payout: sessionPayout,
      won: wonCount,
      lost: lostCount,
      totalProfit: netProfit
    });

    setBalance((currentBalance + netProfit).toFixed(2));
    setShowSummaryModal(true);
  };

  return (
    <div className="min-h-screen bg-void text-ink font-sans flex flex-col">
      {/* Header */}
      <header className="flex justify-between items-center px-5 py-3 bg-surface border-b border-hairline">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-gold flex items-center justify-center font-display font-bold text-void text-base">
            #
          </div>
          <div>
            <h1 className="text-sm font-display font-bold tracking-tight text-ink leading-none">
              Digit Tape <span className="text-gold">Terminal</span>
            </h1>
            <p className="text-[10px] text-muted font-mono tracking-wide mt-0.5">deriv analysis hub &middot; v4</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openDTrader}
            className="hidden sm:flex items-center gap-1 bg-transparent hover:bg-hairline/40 text-muted hover:text-ink border border-hairline px-3 py-1.5 rounded text-[11px] font-mono transition"
          >
            OPEN DTRADER <span className="text-[10px]">&#8599;</span>
          </button>

          {selectedAccount ? (
            <div className="flex items-center gap-2">
              {savedAccounts.length > 1 && (
                <select
                  value={selectedAccount.loginId}
                  onChange={(e) => {
                    const acc = savedAccounts.find((a) => a.loginId === e.target.value);
                    if (acc) setSelectedAccount(acc);
                  }}
                  className="bg-panel border border-hairline text-[10px] font-mono font-bold text-gold rounded p-1.5 focus:outline-none"
                >
                  {savedAccounts.map((acc, idx) => (
                    <option key={idx} value={acc.loginId}>
                      {acc.type}: {acc.loginId}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center gap-2 bg-panel px-3 py-1.5 rounded-full border border-hairline">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${selectedAccount.type === "DEMO" ? "bg-amber" : "bg-win"}`}></span>
                <span className="text-xs font-mono font-bold text-ink">
                  ${balance} <span className="text-muted font-normal">{currency}</span>
                </span>
                <button onClick={handleDisconnect} className="ml-1 text-[10px] text-loss hover:underline">EXIT</button>
              </div>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-muted"></span>
              OFFLINE
            </span>
          )}
        </div>
      </header>

      {/* Account Login Form */}
      {!selectedAccount && (
        <div className="bg-surface border border-hairline p-4 m-3 rounded-lg max-w-lg mx-auto w-full space-y-3">
          <div className="flex justify-between items-center border-b border-hairline pb-2">
            <h2 className="text-[11px] font-display font-bold text-gold uppercase tracking-wider">Account Credentials</h2>
            <span className="text-[10px] text-muted font-mono">Direct Connection</span>
          </div>

          <form onSubmit={handleConnectAccount} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-muted uppercase font-mono mb-1">Account Type</label>
                <select
                  value={accountTypeInput}
                  onChange={(e) => setAccountTypeInput(e.target.value)}
                  className="w-full bg-panel border border-hairline text-xs text-gold font-mono font-bold rounded p-2 focus:outline-none focus:border-gold"
                >
                  <option value="DEMO">DEMO</option>
                  <option value="REAL">REAL</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-muted uppercase font-mono mb-1">Server</label>
                <select
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                  className="w-full bg-panel border border-hairline text-xs text-ink font-mono rounded p-2 focus:outline-none focus:border-gold"
                >
                  <option value="Deriv-Server">Deriv-Server</option>
                  <option value="Deriv-Server-02">Deriv-Server-02</option>
                  <option value="Deriv-Demo">Deriv-Demo</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-muted uppercase font-mono mb-1">Login ID / Account Number</label>
              <input
                type="text"
                placeholder="e.g. CR1234567 or VRTC123456"
                value={loginIdInput}
                onChange={(e) => setLoginIdInput(e.target.value)}
                className="w-full bg-panel border border-hairline p-2 text-xs font-mono rounded focus:outline-none focus:border-gold"
              />
            </div>

            <div>
              <label className="block text-[10px] text-muted uppercase font-mono mb-1">Account Password / API Token</label>
              <input
                type="password"
                placeholder="Enter password or token"
                value={passwordTokenInput}
                onChange={(e) => setPasswordTokenInput(e.target.value)}
                className="w-full bg-panel border border-hairline p-2 text-xs font-mono rounded focus:outline-none focus:border-gold"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gold hover:bg-gold-bright text-void font-display font-bold py-2.5 rounded text-xs transition"
            >
              CONNECT TERMINAL
            </button>
          </form>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex bg-surface border-b border-hairline text-xs font-display font-semibold">
        {["Quick strategy", "Bulk Trader", "Manual Trader", "Copy Trading"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-center transition border-b-2 ${
              activeTab === tab
                ? "border-gold text-gold bg-gold/5"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 p-3 max-w-lg mx-auto w-full flex flex-col gap-3">
        {/* Digit Tape */}
        <div className="bg-surface border border-hairline rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-display font-bold text-muted uppercase tracking-wide">
            <span>Digit Tape &middot; last {TAPE_LENGTH} ticks</span>
            <span className="font-mono text-ink normal-case tracking-normal">
              {marketMode === "single" ? SYNTHETIC_MARKETS.find(m => m.symbol === selectedMarket)?.name : "Multi-Array"}
            </span>
          </div>

          <div className="flex gap-[3px] h-9 items-end bg-panel rounded p-1.5 overflow-hidden">
            {Array.from({ length: TAPE_LENGTH }).map((_, i) => {
              const digit = digitTape[i];
              const isPast = digit !== undefined;
              const isUnder = isPast && digit < barrier;
              return (
                <div
                  key={i}
                  className={`flex-1 h-full rounded-sm flex items-end justify-center text-[9px] font-mono font-bold pb-0.5 transition-colors ${
                    !isPast
                      ? "bg-hairline/30 text-transparent"
                      : isUnder
                      ? "bg-win/25 text-win"
                      : "bg-loss/20 text-loss/80"
                  }`}
                >
                  {isPast ? digit : ""}
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-1">
            <div className="flex bg-panel p-0.5 rounded border border-hairline font-mono">
              <button
                onClick={() => setMarketMode("single")}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${marketMode === "single" ? "bg-gold text-void" : "text-muted"}`}
              >
                SINGLE
              </button>
              <button
                onClick={() => setMarketMode("multi")}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${marketMode === "multi" ? "bg-gold text-void" : "text-muted"}`}
              >
                MULTI-ARRAY
              </button>
            </div>

            {marketMode === "single" && (
              <select
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                className="bg-panel border border-hairline text-ink text-[11px] font-mono rounded p-1.5 focus:outline-none"
              >
                {SYNTHETIC_MARKETS.map((m) => (
                  <option key={m.symbol} value={m.symbol}>{m.name}</option>
                ))}
              </select>
            )}

            <div className="text-right">
              <p className="text-[9px] uppercase font-display font-bold text-muted">Last Quote</p>
              <p className="text-sm font-mono font-black text-ink">{lastTick}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="w-full bg-gold hover:bg-gold-bright text-void font-display font-black py-3.5 rounded-lg text-sm shadow-lg shadow-gold/10 transition flex items-center justify-center gap-2"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-void animate-pulse"></span>
          AI SCANNER &amp; BULK TRADER
        </button>

        {/* Transactions */}
        <div className="flex-1 bg-surface border border-hairline rounded-lg p-3 flex flex-col justify-between min-h-[300px]">
          <div className="flex justify-between items-center border-b border-hairline pb-2 mb-2">
            <span className="text-xs font-display font-bold text-ink">
              Transactions <span className="text-muted font-normal">&middot; {selectedAccount ? selectedAccount.loginId : "disconnected"}</span>
            </span>
            <button onClick={() => setTrades([])} className="bg-panel border border-hairline px-2 py-1 rounded text-muted text-[10px] font-mono hover:text-ink">RESET</button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-64 space-y-1.5 font-mono text-xs pr-1">
            {trades.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-muted text-xs gap-1">
                <span className="text-lg">&#8213;</span>
                <p>no active session trades</p>
              </div>
            ) : (
              trades.map((t, idx) => (
                <div key={idx} className="flex justify-between items-center bg-panel p-2.5 rounded border border-hairline">
                  <span className="text-muted text-[11px]">#{t.id}</span>
                  <span className="text-ink">${Number(t.stake).toFixed(2)}</span>
                  <span className={`font-bold ${t.pnl >= 0 ? "text-win" : "text-loss"}`}>
                    {t.pnl >= 0 ? `+${t.pnl.toFixed(2)}` : t.pnl.toFixed(2)} {currency}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-hairline mt-2 text-center text-[10px] font-mono">
            <div className="bg-panel p-2 rounded border border-hairline">
              <p className="text-muted uppercase text-[9px]">Stake</p>
              <p className="font-bold text-ink mt-0.5">${summary.totalStake.toFixed(2)}</p>
            </div>
            <div className="bg-panel p-2 rounded border border-hairline">
              <p className="text-muted uppercase text-[9px]">Won</p>
              <p className="font-bold text-win mt-0.5">{summary.won}</p>
            </div>
            <div className="bg-panel p-2 rounded border border-hairline">
              <p className="text-muted uppercase text-[9px]">Lost</p>
              <p className="font-bold text-loss mt-0.5">{summary.lost}</p>
            </div>
            <div className="bg-panel p-2 rounded border border-hairline">
              <p className="text-muted uppercase text-[9px]">Net P/L</p>
              <p className={`font-bold mt-0.5 ${summary.totalProfit >= 0 ? "text-win" : "text-loss"}`}>
                ${summary.totalProfit.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-void/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-gold/30 rounded-xl max-w-sm w-full p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-hairline pb-2">
              <h3 className="text-gold text-xs font-display font-bold uppercase tracking-wide">AI Scanner</h3>
              <button onClick={() => setIsScannerOpen(false)} className="text-muted hover:text-ink font-bold text-sm">&#10005;</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-muted uppercase font-display font-bold mb-1">Stake ($)</label>
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    className="w-full bg-panel border border-hairline p-2.5 rounded text-win font-mono font-bold focus:outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-muted uppercase font-display font-bold mb-1">Barrier (under)</label>
                  <input
                    type="number"
                    min="1"
                    max="9"
                    value={barrier}
                    onChange={(e) => setBarrier(Number(e.target.value))}
                    className="w-full bg-panel border border-hairline p-2.5 rounded text-gold font-mono font-bold focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-muted uppercase font-display font-bold mb-1">Bulk Orders</label>
                <input
                  type="number"
                  value={bulkTrades}
                  onChange={(e) => setBulkTrades(e.target.value)}
                  className="w-full bg-panel border border-hairline p-2.5 rounded text-win font-mono font-bold focus:outline-none focus:border-gold"
                />
              </div>

              <div className="bg-void border border-hairline p-3 rounded-lg h-24 overflow-y-auto text-[10px] font-mono text-win space-y-1">
                {terminalLogs.length === 0 ? <p className="text-muted">awaiting initiation...</p> : terminalLogs.map((l, i) => <p key={i}>{l}</p>)}
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-muted mb-1">
                  <span>PROGRESS</span>
                  <span className="text-gold font-bold">{scanProgress}%</span>
                </div>
                <div className="w-full bg-panel h-1.5 rounded-full overflow-hidden">
                  <div className="bg-gold h-full transition-all duration-300" style={{ width: `${scanProgress}%` }}></div>
                </div>
              </div>

              <button
                onClick={startDigitScanner}
                disabled={isScanning || !selectedAccount}
                className="w-full bg-gold hover:bg-gold-bright disabled:opacity-40 disabled:cursor-not-allowed text-void font-display font-black py-3 rounded-lg text-xs mt-2 transition"
              >
                {isScanning ? "SCANNING..." : selectedAccount ? `EXECUTE ON ${selectedAccount.loginId}` : "CONNECT ACCOUNT FIRST"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-gold/30 rounded-xl p-6 max-w-xs w-full text-center space-y-3">
            <h4 className="text-[10px] text-gold tracking-widest uppercase font-display font-bold">Execution Finished</h4>
            <p className="text-xs text-muted">Total Net Profit</p>
            <p className={`text-3xl font-black font-mono ${summary.totalProfit >= 0 ? "text-win" : "text-loss"}`}>
              {summary.totalProfit >= 0 ? `+${summary.totalProfit.toFixed(2)}` : summary.totalProfit.toFixed(2)} {currency}
            </p>
            <button onClick={() => setShowSummaryModal(false)} className="w-full bg-gold hover:bg-gold-bright text-void font-display font-bold py-2.5 rounded-lg text-xs transition">
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
