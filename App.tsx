import React, { useState, useEffect } from "react";
import { GameInfo, GamePackage, PaymentMethod, Order, CarouselItem } from "./types";
import Header from "./components/Header";
import GameDetails from "./components/GameDetails";
import PaymentGatewayModal from "./components/PaymentGatewayModal";
import OrderTracker from "./components/OrderTracker";
import MediaCarousel from "./components/MediaCarousel";

import AdminSimulationPanel from "./components/AdminSimulationPanel";
import AuthModal from "./components/AuthModal";
import AdminPanel from "./components/AdminPanel";
import { applyTheme } from "./theme";
import { ShieldCheck, Zap, Sparkles, Trophy, Gamepad, Clock, ChevronRight, MessageSquare, History, Search, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // Navigation states
  const [activeTab, setActiveTab] = useState<"catalog" | "tracker" | "history" | "admin">("catalog");
  const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
  
  // Theme state
  const [activeTheme, setActiveTheme] = useState("cyberpunk");
  
  // User Authentication states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  
  // Data lists fetched from Express server
  const [gamesList, setGamesList] = useState<GameInfo[]>([]);
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  
  // Active transaction / Checkout states
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  // Local persistence order history for the client's session
  const [orderHistory, setOrderHistory] = useState<Order[]>([]);
  
  // Search query states
  const [searchQuery, setSearchQuery] = useState("");
  const [trackerOrderId, setTrackerOrderId] = useState<string | undefined>(undefined);
  const [catalogSearch, setCatalogSearch] = useState("");

  // Define realistic mock payment options
  const mockPaymentOptions: PaymentMethod[] = [
    {
      id: "bkash",
      name: "bKash Mobile",
      type: "wallet",
      logo: "https://images.unsplash.com/photo-1598257006458-087169a1f08d?w=100&auto=format&fit=crop&q=80", // Placholder mobile logo
      instructions: "Transfer to our bKash merchant wallet account. Make a Send Money or Cash Out transaction of the total amount, then copy-paste the Transaction ID from the SMS.",
      accountNumber: "+880 1799 482910",
      feePercentage: 1.5,
    },
    {
      id: "nagad",
      name: "Nagad Wallet",
      type: "wallet",
      logo: "https://images.unsplash.com/photo-1563013544-824ae1d704d3?w=100&auto=format&fit=crop&q=80",
      instructions: "Transfer money to our Nagad wallet. Make a Send Money of the exact total amount, then input your sender mobile account number and the transaction reference.",
      accountNumber: "+880 1928 382948",
      feePercentage: 1.0,
    },
    {
      id: "bank_of_ceylon",
      name: "Local Bank Transfer",
      type: "bank",
      logo: "https://images.unsplash.com/photo-1501167786227-4cba60f6d58f?w=100&auto=format&fit=crop&q=80",
      instructions: "Please make a direct online wire or bank deposit to our Bank account. Verification takes about 5 minutes. Enter the reference number from your bank app.",
      accountNumber: "8492048209210-A",
      accountName: "Sehan Topup Retail Ltd.",
      feePercentage: 0,
    },
    {
      id: "visa_mastercard",
      name: "Visa / Mastercard Secure",
      type: "card",
      logo: "https://images.unsplash.com/photo-1589758438368-0ad531db3366?w=100&auto=format&fit=crop&q=80",
      feePercentage: 2.0,
    },
    {
      id: "qr_instant",
      name: "QR Scan & Pay",
      type: "qr",
      logo: "https://images.unsplash.com/photo-1595079676339-1534801ad6cf?w=100&auto=format&fit=crop&q=80",
      instructions: "Scan the QR below with any mobile wallet app to send the total payment, then input the reference number.",
      feePercentage: 0.5,
    },
  ];

  // Fetch games list and load order history from local storage on mount
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch("/api/games");
        if (res.ok) {
          const data = await res.json();
          setGamesList(data);
        }
      } catch (err) {
        console.error("Failed to load catalog from server", err);
      }
    };

    const fetchCarousel = async () => {
      try {
        const res = await fetch("/api/carousel");
        if (res.ok) {
          const data = await res.json();
          setCarouselItems(data);
        }
      } catch (err) {
        console.error("Failed to load carousel from server", err);
      }
    };

    const fetchPaymentGateways = async () => {
      try {
        const res = await fetch("/api/payment-methods");
        if (res.ok) {
          const data = await res.json();
          setPaymentMethods(data);
        } else {
          setPaymentMethods(mockPaymentOptions);
        }
      } catch (err) {
        console.error("Failed to load payment methods from server, fallback to defaults", err);
        setPaymentMethods(mockPaymentOptions);
      }
    };
    
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data && data.theme) {
            setActiveTheme(data.theme);
            applyTheme(data.theme);
          }
        }
      } catch (err) {
        console.error("Failed to load settings from server", err);
      }
    };
    
    fetchCatalog();
    fetchCarousel();
    fetchPaymentGateways();
    fetchSettings();

    // Load logged in user from localStorage
    try {
      const storedUser = localStorage.getItem("danukaya_user");
      if (storedUser) {
        setCurrentUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error("Could not parse storage user", e);
    }

    // Load persistent order history from localStorage
    try {
      const stored = localStorage.getItem("danukaya_order_history");
      if (stored) {
        setOrderHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Could not parse storage order history", e);
    }
  }, []);

  // Sync wallet balance automatically when the user is logged in
  useEffect(() => {
    if (!currentUser?.id) return;

    const fetchLatestBalance = async () => {
      try {
        const res = await fetch(`/api/users/${currentUser.id}/balance`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.walletBalance !== undefined) {
            setCurrentUser((prev: any) => {
              if (!prev || prev.id !== currentUser.id) return prev;
              const updated = { ...prev, walletBalance: data.walletBalance };
              localStorage.setItem("danukaya_user", JSON.stringify(updated));
              return updated;
            });
          }
        }
      } catch (err) {
        console.error("Failed to sync latest wallet balance:", err);
      }
    };

    fetchLatestBalance();
    
    // Periodically sync balance (every 10 seconds) so if an admin adjusts, it shows live!
    const interval = setInterval(fetchLatestBalance, 10000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("danukaya_user");
    if (activeTab === "admin") {
      setActiveTab("catalog");
    }
  };

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    localStorage.setItem("danukaya_user", JSON.stringify(user));
  };

  // Sync client order history list helper
  const addOrderToHistory = (order: Order) => {
    setOrderHistory((prev) => {
      const filtered = prev.filter((o) => o.id !== order.id);
      const updated = [order, ...filtered];
      localStorage.setItem("danukaya_order_history", JSON.stringify(updated));
      return updated;
    });
  };

  const handleInitiateCheckout = async (data: {
    playerId: string;
    playerZoneId?: string;
    selectedPackage: GamePackage;
    selectedPayment: PaymentMethod;
  }) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: selectedGame?.id,
          playerId: data.playerId,
          playerZoneId: data.playerZoneId,
          packageId: data.selectedPackage.id,
          paymentMethodId: data.selectedPayment.id,
          paymentMethodName: data.selectedPayment.name,
          userId: currentUser.id,
          username: currentUser.username,
        }),
      });

      if (!response.ok) throw new Error("Order creation failed");

      const result = await response.json();
      const createdOrder: Order = result;
      setActiveOrder(createdOrder);
      addOrderToHistory(createdOrder);

      if (result.userWalletBalance !== undefined && currentUser) {
        const updatedUser = { ...currentUser, walletBalance: result.userWalletBalance };
        setCurrentUser(updatedUser);
        localStorage.setItem("danukaya_user", JSON.stringify(updatedUser));
      }

      if (data.selectedPayment.id === "user_wallet") {
        setCheckoutModalOpen(false);
        setTrackerOrderId(createdOrder.id);
        setActiveTab("tracker");
      } else {
        setCheckoutModalOpen(true);
      }
    } catch (err) {
      console.error("Checkout order error:", err);
    }
  };

  const handlePaymentSuccess = (finalizedOrder: Order) => {
    setActiveOrder(finalizedOrder);
    addOrderToHistory(finalizedOrder);
    
    // Auto transition to tracking view
    setTimeout(() => {
      setCheckoutModalOpen(false);
      setTrackerOrderId(finalizedOrder.id);
      setActiveTab("tracker");
    }, 1500);
  };

  const handleHeaderSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setTrackerOrderId(searchQuery.trim());
      setActiveTab("tracker");
    }
  };

  const filteredGames = gamesList.filter((g) =>
    g.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
    g.category.toLowerCase().includes(catalogSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-brand-bg text-slate-100 font-sans flex flex-col justify-between relative overflow-hidden transition-colors duration-300" id="app-viewport">
      {/* Immersive CRT scanline overlay for retro-arcade style */}
      {activeTheme === "retro-arcade" && <div className="scanlines-overlay" />}

      {/* Ambient Background Glows tailored dynamically to active theme */}
      {activeTheme !== "retro-arcade" && activeTheme !== "light-premium" && (
        <>
          <div 
            className="absolute top-[-120px] left-[-120px] w-[500px] h-[500px] rounded-full blur-[130px] pointer-events-none z-0 transition-all duration-500" 
            style={{ backgroundColor: "var(--theme-accent)", opacity: activeTheme === "frost-glass" ? 0.08 : 0.12 }}
          />
          <div 
            className="absolute bottom-[-120px] right-[-120px] w-[600px] h-[600px] rounded-full blur-[130px] pointer-events-none z-0 transition-all duration-500" 
            style={{ backgroundColor: "var(--theme-secondary)", opacity: activeTheme === "frost-glass" ? 0.06 : 0.1 }}
          />
        </>
      )}

      {/* Floating frost orbs for extra frosted glass ambiance */}
      {activeTheme === "frost-glass" && (
        <>
          <div className="absolute top-1/4 right-10 w-96 h-96 rounded-full blur-[90px] frost-orb-1 pointer-events-none z-0 animate-pulse duration-[8s]" />
          <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full blur-[80px] frost-orb-2 pointer-events-none z-0 animate-pulse duration-[12s]" />
        </>
      )}

      {/* Navbar header */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === "catalog") setSelectedGame(null); // Reset detail view
        }}
        openChat={() => setChatOpen(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleHeaderSearchSubmit}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Container Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 z-10 relative">
        <AnimatePresence mode="wait">
          {activeTab === "admin" && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
            >
              <AdminPanel
                isAdmin={currentUser?.isAdmin || false}
                onClose={() => setActiveTab("catalog")}
                games={gamesList}
                paymentMethods={paymentMethods}
                activeTheme={activeTheme}
                onChangeTheme={(newTheme) => {
                  setActiveTheme(newTheme);
                  applyTheme(newTheme);
                }}
                onRefreshData={async () => {
                  // Reload games & payments
                  try {
                    const resGames = await fetch("/api/games");
                    if (resGames.ok) {
                      const dataGames = await resGames.json();
                      setGamesList(dataGames);
                    }
                    const resPayments = await fetch("/api/payment-methods");
                    if (resPayments.ok) {
                      const dataPayments = await resPayments.json();
                      setPaymentMethods(dataPayments);
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            </motion.div>
          )}

          {activeTab === "catalog" && (
            <motion.div
              key="catalog"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              id="catalog-section"
              className="space-y-8"
            >
              {selectedGame ? (
                // Detailed top-up configure page
                <motion.div
                  key={`game-detail-${selectedGame.id}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  id="active-game-topup-panel"
                  className="space-y-4"
                >
                  <button
                    id="back-to-catalog-btn"
                    onClick={() => setSelectedGame(null)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Game List</span>
                  </button>
                  <GameDetails
                    game={selectedGame}
                    paymentMethods={paymentMethods}
                    onInitiateCheckout={handleInitiateCheckout}
                    currentUser={currentUser}
                  />
                </motion.div>
              ) : (
                // Home Catalog Game Grid Dashboard
                <div id="game-catalog-dashboard" className="space-y-8">
                  {/* Dynamic Interactive Carousel Slider */}
                  <MediaCarousel items={carouselItems} />

                  {/* Grid header & Quick Search */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-cyan-400" />
                        <span>POPULAR GAMES</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">Choose your game to initiate credentials verification and topup package selection.</p>
                    </div>

                    <div className="relative w-full sm:w-64" id="catalog-search-container">
                      <input
                        id="catalog-search-input"
                        type="text"
                        placeholder="Search games..."
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                    </div>
                  </div>

                  {/* Catalog Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" id="games-grid">
                    {filteredGames.length > 0 ? (
                      filteredGames.map((game, index) => (
                        <motion.div
                          key={game.id}
                          id={`game-card-${game.id}`}
                          onClick={() => setSelectedGame(game)}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.04 }}
                          whileHover={{ y: -6, scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="group relative rounded-2xl border border-white/5 bg-white/5 overflow-hidden cursor-pointer hover:border-cyan-500/50 hover:bg-white/[0.08] transition-all duration-300"
                        >
                          <div className="h-44 relative">
                            <img
                              src={game.bannerUrl}
                              alt={game.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#04040a] via-[#04040a]/40 to-transparent" />
                          </div>
                          <div className="p-5 relative">
                            <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                              {game.category}
                            </span>
                            <h3 className="text-base font-bold text-white mt-2 group-hover:text-cyan-300 transition-colors">
                              {game.name}
                            </h3>
                            <div className="flex justify-between items-center mt-4 pt-3.5 border-t border-white/5 text-[11px] text-slate-500 font-medium">
                              <span>Packages: {game.packages.length}</span>
                              <span className="text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-bold">
                                <span>Top Up Now</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="col-span-full py-12 text-center text-slate-500" id="empty-catalog-fallback">
                        No games found matching your filters. Try search keywords like "Legends" or "PC".
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Order tracking section */}
          {activeTab === "tracker" && (
            <motion.div
              key="tracker"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              id="tracker-section"
            >
              <OrderTracker
                initialOrderId={trackerOrderId}
                onSelectOrder={(order) => setActiveOrder(order)}
              />
            </motion.div>
          )}

          {/* Order list history section */}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25 }}
              id="history-section"
              className="max-w-4xl mx-auto space-y-6"
            >
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2 uppercase tracking-wider">
                  <History className="w-5 h-5 text-cyan-400" />
                  <span>My Transaction History</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">View your previously placed orders on this browser session.</p>
              </div>

              {orderHistory.length > 0 ? (
                <div className="space-y-3" id="history-list">
                  {orderHistory.map((o, index) => (
                    <motion.div
                      key={o.id}
                      id={`history-item-${o.id}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.04 }}
                      whileHover={{ scale: 1.01 }}
                      className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 backdrop-blur-md"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-white">{o.id}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-400 font-bold uppercase tracking-wider">{o.gameName}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-2">Game ID: <strong className="text-white font-mono">{o.playerId}</strong>{o.playerZoneId ? ` | Game Name: ${o.playerZoneId}` : ""}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{o.packageName} • {new Date(o.createdAt).toLocaleString()}</p>
                      </div>

                      <div className="flex sm:flex-col items-start sm:items-end gap-3 sm:gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
                        <span className="text-sm font-extrabold text-white">LKR {o.price.toFixed(2)}</span>
                        <button
                          id={`track-order-history-btn-${o.id}`}
                          onClick={() => {
                            setTrackerOrderId(o.id);
                            setActiveTab("tracker");
                          }}
                          className="px-4 py-1.5 rounded-lg bg-cyan-500 text-black hover:bg-cyan-400 font-bold text-[11px] transition-all cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                        >
                          Track Progress
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-500" id="empty-history-fallback">
                  You have not placed any top-up orders yet in this session.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer bar */}
      <footer className="py-6 bg-black/40 border-t border-white/5 mt-12 text-slate-500" id="main-footer">
        <div className="max-w-7xl mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-[0.2em] font-medium">
          <div className="flex flex-wrap justify-center gap-6 md:gap-8">
            <span>Trustpilot: <span className="text-white">4.9/5.0</span></span>
            <span>Support: <span className="text-white">24/7 Available</span></span>
            <span>SSL 256-bit Secure Checkout</span>
          </div>
          <div className="text-center md:text-right">
            © 2026 Sehan Topup — Next-Gen Game Commerce
          </div>
        </div>
      </footer>

      {/* Floating admin control sandbox */}
      <AdminSimulationPanel
        activeOrder={activeOrder}
        onOrderUpdated={(updated) => {
          setActiveOrder(updated);
          addOrderToHistory(updated);
        }}
      />

      {/* Checkout secure transaction portal popup */}
      {checkoutModalOpen && activeOrder && (
        <PaymentGatewayModal
          order={activeOrder}
          paymentMethod={paymentMethods.find((p) => p.id === activeOrder.paymentMethodId) || paymentMethods[0]}
          onClose={() => setCheckoutModalOpen(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}



      {/* Customer authentication modal overlay */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
