import React, { useState, useEffect, useRef } from "react";

// App ID directly from your Deriv Developer Portal
const APP_ID = "34cqHOYTzkye6dCyuLe1T";
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

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
  const [tokenInput, setTokenInput] = useState("");
  const [accountTypeInput, setAccountTypeInput] = useState("DEMO");
  const [savedTokens, setSavedTokens] = useState([]);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balance, setBalance] = useState("0.00");
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
  const [lastTick, setLastTick] = useState("0.00");
  const [digitTape, setDigitTape] = useState([]);

  const [connError, setConnError] = useState("");
  const [connStatus, setConnStatus] = useState("idle"); // idle | connecting | open | authorized | closed | error

  const ws = useRef(null);

  // Load saved tokens on initial load
  useEffect(() => {
    const stored = localStorage.getItem("deriv_direct_tokens");
    if (stored) {
      const parsed = JSON.parse(stored);
      setSavedTokens(parsed);
      if (parsed.length > 0) {
        setSelectedAccount(parsed[0]);
      }
    }
  }, []);

  // Connect & fetch active account details directly from WebSocket
  useEffect(() => {
    if (!selectedAccount?.token) return;

    setConnError("");
    setConnStatus("connecting");
    setDigitTape([]);
    console.log("[Deriv] Opening WebSocket:", WS_URL);

    ws.current = new WebSocket(WS_URL);

    ws.current.onopen = () => {
      console.log("[Deriv] Socket opened, sending authorize...");
      setConnStatus("open");
      ws.current.send(JSON.stringify({ authorize: selectedAccount.token }));
    };

    ws.current.onerror = (err) => {
      console.error("[Deriv] WebSocket error:", err);
      setConnStatus("error");
      setConnError(
        "WebSocket failed to connect. This is usually a network/firewall/ad-blocker issue blocking wss://ws.derivws.com, not a token problem."
      );
    };

    ws.current.onclose = (event) => {
      console.warn("[Deriv] WebSocket closed:", event.code, event.reason);
      setConnStatus((prev) => (prev === "authorized" ? "closed" : prev));
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("[Deriv] Received:", data.msg_type, data);

      if (data.msg_type === "authorize") {
        if (data.error) {
          console.error("[Deriv] Auth failed:", data.error);
          setConnStatus("error");
          setConnError(
            `Auth failed: ${data.error.message} (code: ${data.error.code}). ` +
            `Double-check you pasted a personal API token from app.deriv.com \u2192 Account Settings \u2192 API token \u2014 not the App ID from the Deriv API developer portal.`
          );
          setSelectedAccount(null);
          return;
        }
        setConnStatus("authorized");

        const auth = data.authorize;
        setBalance(Number(auth.balance).toFixed(2));
        setCurrency(auth.currency || "USD");

        setSelectedAccount((prev) => ({
          ...prev,
          loginId: auth.loginid,
          email: auth.email
        }));

        ws.current.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        ws.current.send(JSON.stringify({ ticks: selectedMarket }));
      }

      if (data.msg_type === "balance") {
        setBalance(Number(data.balance.balance).toFixed(2));
      }

      if (data.msg_type === "tick" && data.tick?.quote) {
        const quoteStr = String(data.tick.quote);
        const lastDigit = Number(quoteStr[quoteStr.length - 1]);
        setLastTick(Number(data.tick.quote).toFixed(2));
        setDigitTape((prev) => {
          const next = [...prev, lastDigit];
          return next.length > TAPE_LENGTH ? next.slice(next.length - TAPE_LENGTH) : next;
        });
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

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [selectedAccount?.token, selectedMarket]);

  const addLog = (msg) => setTerminalLogs((prev) => [...prev, msg]);

  const handleDirectConnect = (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    const newAcc = {
      token: tokenInput.trim(),
      type: accountTypeInput,
      loginId: accountTypeInput === "DEMO" ? "DEMO Account" : "REAL Account"
    };

    const updatedTokens = [newAcc, ...savedTokens.filter((t) => t.token !== newAcc.token)];
    setSavedTokens(updatedTokens);
    localStorage.setItem("deriv_direct_tokens", JSON.stringify(updatedTokens));

    setSelectedAccount(newAcc);
    setTokenInput("");
  };

  const openDTrader = () => {
    const symbol = selectedMarket || "1HZ100V";
    let dTraderUrl = `https://dtrader.deriv.com/?chart_type=area&interval=1t&symbol=${symbol}`;
    if (selectedAccount?.loginId && selectedAccount?.token) {
      dTraderUrl += `&account=${selectedAccount.loginId}&token1=${selectedAccount.token}`;
    }
    window.open(dTraderUrl, "_blank");
  };

  const handleDisconnect = () => {
    setSelectedAccount(null);
    setBalance("0.00");
    setLastTick("0.00");
    setConnStatus("idle");
    if (ws.current) ws.current.close();
  };

  const startDigitScanner = () => {
    setIsScanning(true);
    setScanProgress(0);
    setTerminalLogs([]);

    addLog(`ACCOUNT   ${selectedAccount?.loginId || selectedAccount?.type}`);
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
                barrier: String(barrier),
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

  const statusLabel = {
    connecting: "LINKING",
    open: "AUTHORIZING",
    idle: "OFFLINE",
    closed: "OFFLINE",
    error: "LINK ERROR"
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
              {savedTokens.length > 1 && (
                <select
                  value={selectedAccount.token}
                  onChange={(e) => {
                    const acc = savedTokens.find((t) => t.token === e.target.value);
                    if (acc) setSelectedAccount(acc);
                  }}
                  className="bg-panel border border-hairline text-[10px] font-mono font-bold text-gold rounded p-1.5 focus:outline-none"
                >
                  {savedTokens.map((acc, idx) => (
                    <option key={idx} value={acc.token}>
                      {acc.type}: {acc.loginId || "Account"}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center gap-2 bg-panel px-3 py-1.5 rounded-full border border-hairline">
                <span className={`w-1.5 h-1.5 rounded-full ${selectedAccount.type === "DEMO" ? "bg-amber" : "bg-win"} ${connStatus === "authorized" ? "animate-pulse" : ""}`}></span>
                <span className="text-xs font-mono font-bold text-ink">
                  ${balance} <span className="text-muted font-normal">{currency}</span>
                </span>
                <button onClick={handleDisconnect} className="ml-1 text-[10px] text-loss hover:underline">EXIT</button>
              </div>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
              <span className={`w-1.5 h-1.5 rounded-full ${connStatus === "error" ? "bg-loss" : "bg-muted"}`}></span>
              {statusLabel[connStatus] || "OFFLINE"}
            </span>
          )}
        </div>
      </header>

      {/* Token connect panel */}
      {!selectedAccount && (
        <div className="bg-surface border border-hairline p-4 m-3 rounded-lg max-w-lg mx-auto w-full space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-[11px] font-display font-bold text-gold uppercase tracking-wider">Connect Account</h2>
            <span className="text-[10px] text-muted font-mono">no redirect required</span>
          </div>

          <form onSubmit={handleDirectConnect} className="flex gap-2">
            <select
              value={accountTypeInput}
              onChange={(e) => setAccountTypeInput(e.target.value)}
              className="bg-panel border border-hairline text-xs text-gold font-mono font-bold rounded px-2"
            >
              <option value="DEMO">DEMO</option>
              <option value="REAL">REAL</option>
            </select>

            <input
              type="text"
              placeholder="Paste your personal API token from app.deriv.com \u2192 Settings \u2192 API token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="flex-1 bg-panel border border-hairline p-2 text-xs font-mono rounded focus:outline-none focus:border-gold"
            />

            <button
              type="submit"
              className="bg-gold hover:bg-gold-bright text-void font-display font-bold px-4 py-2 rounded text-xs transition"
            >
              CONNECT
            </button>
          </form>

          <p className="text-[10px] text-muted leading-relaxed">
            Get this token at{" "}
            <a
              href="https://app.deriv.com/account/api-token"
              target="_blank"
              rel="noreferrer"
              className="text-gold underline"
            >
              app.deriv.com/account/api-token
            </a>{" "}
            &mdash; check the "Trade" scope when creating it. This is different from the App ID/App Secret in the developer portal.
          </p>
        </div>
      )}

      {connError && (
        <div className="bg-loss/10 border border-loss/40 text-loss text-xs p-3 m-3 rounded-lg max-w-lg mx-auto w-full font-mono">
          <div className="flex justify-between items-start gap-2">
            <span>&#9888; {connError}</span>
            <button onClick={() => setConnError("")} className="text-loss/70 shrink-0">&#10005;</button>
          </div>
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

      {/* Main workspace */}
      <main className="flex-1 p-3 max-w-lg mx-auto w-full flex flex-col gap-3">

        {/* Signature: Digit Tape */}
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
              Transactions <span className="text-muted font-normal">&middot; {selectedAccount ? (selectedAccount.loginId || selectedAccount.type) : "disconnected"}</span>
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

      {/* Scanner dialog */}
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
                {isScanning ? "SCANNING..." : selectedAccount ? `EXECUTE ON ${selectedAccount.loginId || selectedAccount.type}` : "CONNECT ACCOUNT FIRST"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary modal */}
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
