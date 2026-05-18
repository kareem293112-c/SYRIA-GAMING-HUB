/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, useAnimation } from 'motion/react';

let audioCtx: AudioContext | null = null;
const initAudio = () => {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.error("Audio API not supported", e);
    }
};

const playSound = (type: 'tick' | 'win' | 'redeem', fallbackCb?: () => void) => {
    try {
        if (!audioCtx) throw new Error("Audio context not initialized");
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        switch (type) {
            case 'tick':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.1);
                break;
            case 'win':
                const osc2 = audioCtx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, audioCtx.currentTime);
                osc.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.2);
                osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.4);
                
                osc2.type = 'triangle';
                osc2.connect(gainNode);
                osc2.frequency.setValueAtTime(440, audioCtx.currentTime);
                osc2.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.2);
                osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.4);
                
                gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
                
                osc.start();
                osc2.start();
                osc.stop(audioCtx.currentTime + 1.5);
                osc2.stop(audioCtx.currentTime + 1.5);
                break;
            case 'redeem':
                osc.type = 'square';
                osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.3);
                break;
        }
    } catch (e) {
        if (fallbackCb) fallbackCb();
    }
};

export default function App() {
  const [allItems, setAllItems] = useState([]);
  const [balance, setBalance] = useState(0);
  const [coupon, setCoupon] = useState("");
  const [spinCodeInput, setSpinCodeInput] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isSpinning, setIsSpinning] = useState(false);
  const [rouletteItems, setRouletteItems] = useState([]);
  const [audioStatus, setAudioStatus] = useState("");
  const [adminSpinCodes, setAdminSpinCodes] = useState([]);
  const targetIndexRef = useRef(40);
  const lastTickRef = useRef(0);
  
  const handleFallback = (msg: string) => {
      setAudioStatus(msg);
      setTimeout(() => setAudioStatus(""), 2000);
  };
  
  // Admin states
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminItems, setAdminItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);

  const controls = useAnimation();
  const rouletteRef = useRef(null);

  const getWeightedItemLocal = (items) => {
    const rand = Math.random() * 100;
    if (rand < 0.5) {
      const legendary = items.filter(i => Number(i.price) >= 30);
      return legendary.length ? legendary[Math.floor(Math.random() * legendary.length)] : items[0];
    } else if (rand < 5.0) {
      const rare = items.filter(i => Number(i.price) >= 10 && Number(i.price) < 30);
      return rare.length ? rare[Math.floor(Math.random() * rare.length)] : items[0];
    } else if (rand < 20.0) {
      const uncommon = items.filter(i => Number(i.price) >= 2 && Number(i.price) < 10);
      return uncommon.length ? uncommon[Math.floor(Math.random() * uncommon.length)] : items[0];
    } else {
      const common = items.filter(i => Number(i.price) < 2);
      return common.length ? common[Math.floor(Math.random() * common.length)] : items[0];
    }
  };

  useEffect(() => {
    fetch('/api/user/balance').then(res => res.json()).then(data => setBalance(data.balance));
    // Fetch initial items to populate roulette
    fetch('/api/items')
      .then(res => res.json())
      .then(items => {
        setAllItems(items);
        if (items.length > 0) {
            setRouletteItems(Array.from({ length: 60 }, () => getWeightedItemLocal(items)));
        }
      });
  }, []);

  const fetchAdminItems = async () => {
    const res = await fetch("/api/admin/items", { headers: { 'x-admin-key': adminPassword }});
    if (res.ok) setAdminItems(await res.json());

    const codesRes = await fetch("/api/admin/spin-codes", { headers: { 'x-admin-key': adminPassword }});
    if (codesRes.ok) {
        const data = await codesRes.json();
        setAdminSpinCodes(data.codes);
    }
  };

  const generateSpinCode = async () => {
    const res = await fetch("/api/admin/generate-spin-code", { method: "POST", headers: { 'x-admin-key': adminPassword }});
    if (res.ok) fetchAdminItems();
  };

  const saveItem = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const item = Object.fromEntries(formData.entries());
    if (editingItem) item.id = editingItem.id;
    
    await fetch("/api/admin/items", { 
        method: "POST", 
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminPassword },
        body: JSON.stringify(item)
    });
    setEditingItem(null);
    e.target.reset();
    fetchAdminItems();
  }

  const deleteItem = async (id) => {
     await fetch(`/api/admin/items/${id}`, { method: "DELETE", headers: { 'x-admin-key': adminPassword }});
     fetchAdminItems();
  }

  const redeemCoupon = async () => {
    initAudio();
    const res = await fetch("/api/coupons/use", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ code: coupon }) });
    if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        playSound('redeem', () => handleFallback("♪ تم التفعيل ♪"));
    }
  };

  const openCase = async () => {
    if (isSpinning || !allItems.length) return;
    if (!spinCodeInput) {
        setPasswordError("يرجى إدخال كلمة السر لفتح الصندوق");
        return;
    }
    
    setPasswordError("");
    initAudio();
    setIsSpinning(true);

    const res = await fetch('/api/case/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: spinCodeInput })
    });

    if (!res.ok) {
        const err = await res.json();
        setPasswordError(err.error || "كلمة السر غلط");
        setIsSpinning(false);
        return;
    }

    const { item: winner } = await res.json();
    setSpinCodeInput(""); // reset code after use
    
    const currentTarget = targetIndexRef.current;

    // Prepare full array, appending new items if necessary
    setRouletteItems(prev => {
        const next = [...prev];
        while (next.length < currentTarget + 40) {
            next.push(getWeightedItemLocal(allItems)); // Weighted randomness for visual
        }
        next[currentTarget] = winner;
        return next;
    });

    // Spin animation
    await new Promise(resolve => setTimeout(resolve, 50)); // Allow render
    const itemWidth = 120; // Updated width
    const padding = 16; // 16px due to p-4
    const containerWidth = rouletteRef.current.clientWidth;
    
    // Target position calculation using currentTarget
    const targetPosition = -(currentTarget * itemWidth + padding - containerWidth / 2 + itemWidth / 2);
    
    lastTickRef.current = 0; // reset tick state for new spin
    await controls.start({
        x: targetPosition,
        transition: { duration: 6, ease: [0.1, 0.9, 0.2, 1] } // Removed overshoot
    });

    playSound('win', () => handleFallback(`فزت بـ ${winner.name}!`));
    targetIndexRef.current += 40;
    setIsSpinning(false);
    setShowPasswordInput(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <header className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">SYRIA GAMING HUB</h1>
      </header>

      <main className="flex flex-col items-center gap-12">
        {audioStatus && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-cyan-900/90 border border-cyan-500 text-cyan-50 px-4 py-2 rounded shadow-[0_0_15px_rgba(6,182,212,0.6)] z-50 text-sm font-bold animate-pulse" aria-live="polite">{audioStatus}</div>}

        <div className="w-full max-w-4xl h-40 bg-slate-900 border-2 border-slate-800 rounded-lg overflow-hidden flex items-center relative" ref={rouletteRef}>
            <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-cyan-400 z-10" />
            <motion.div 
                style={{ width: "max-content" }} 
                className="flex p-4 text-center items-center shrink-0" 
                animate={controls} 
                initial={{ x: 0 }}
                onUpdate={(latest) => {
                    if (typeof latest.x === 'number') {
                        const itemWidth = 120;
                        const currentTick = Math.floor(Math.abs(latest.x) / itemWidth);
                        if (currentTick > lastTickRef.current) {
                            playSound('tick', () => handleFallback("Tick"));
                            lastTickRef.current = currentTick;
                        }
                    }
                }}
            >
                {rouletteItems.map((item, i) => (
                    <div key={i} className="min-w-[120px] max-w-[120px] h-[160px] bg-slate-800 rounded border border-slate-700 flex flex-col items-center justify-between p-2 shadow-lg">
                        <img 
                            src={item.imageUrl || "https://via.placeholder.com/150"} 
                            alt={item.name} 
                            onError={(e) => { e.currentTarget.src = "https://via.placeholder.com/150" }}
                            className='w-16 h-16 object-cover rounded bg-slate-700'/>
                        <p 
                            className={`font-bold text-xs truncate w-full px-1 text-center ${
                                item.rarity === 'أسطورية' ? 'text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]' :
                                item.rarity === 'نادرة' ? 'text-fuchsia-400 drop-shadow-[0_0_6px_rgba(232,121,249,0.8)]' :
                                item.rarity === 'غير شائعة' ? 'text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]' :
                                'text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                            }`} 
                            title={item.name}
                        >
                            {item.name}
                        </p>
                        <p className="text-slate-500 text-xs">${item.price}</p>
                    </div>
                ))}
            </motion.div>
        </div>

        {!showPasswordInput ? (
            <button 
                disabled={isSpinning}
                onClick={() => setShowPasswordInput(true)}
                className="bg-gradient-to-br from-cyan-500 to-blue-600 px-8 py-4 text-2xl font-bold text-white rounded-lg shadow-lg shadow-cyan-900/50 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50"
            >
                {isSpinning ? "جاري الدوران..." : "فتح الصندوق"}
            </button>
        ) : (
            <div className="flex flex-col items-center gap-2">
                <div className="flex gap-4 items-center">
                    <input 
                        type="text" 
                        value={spinCodeInput} 
                        onChange={(e) => {
                            setSpinCodeInput(e.target.value);
                            setPasswordError("");
                        }} 
                        placeholder="كلمة السر للصندوق" 
                        className={`bg-slate-900 border ${passwordError ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'border-slate-700'} px-6 py-4 text-xl rounded text-center focus:outline-none focus:border-cyan-500 transition-colors`} 
                        disabled={isSpinning}
                        autoFocus
                    />
                    <button 
                        disabled={isSpinning || !spinCodeInput}
                        onClick={openCase}
                        className="bg-gradient-to-br from-cyan-500 to-blue-600 px-8 py-4 text-2xl font-bold text-white rounded-lg shadow-lg shadow-cyan-900/50 hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50"
                    >
                        {isSpinning ? "جاري الدوران..." : "تأكيد"}
                    </button>
                    {!isSpinning && (
                        <button 
                            onClick={() => {
                                setShowPasswordInput(false);
                                setPasswordError("");
                                setSpinCodeInput("");
                            }}
                            className="bg-slate-800 px-4 py-4 text-xl font-bold text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            إلغاء
                        </button>
                    )}
                </div>
                {passwordError && <p className="text-red-500 font-bold text-lg animate-pulse">{passwordError}</p>}
            </div>
        )}

      </main>

        <button 
            onClick={() => setAdminModalOpen(true)}
            className="fixed bottom-2 left-2 text-xs text-slate-700 hover:text-slate-500"
        >لوحة الإدارة</button>

        {adminModalOpen && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                {!adminAuthenticated ? (
                    <div className="bg-slate-900 p-6 rounded border border-slate-700 w-full max-w-sm">
                        <h2 className="text-xl mb-4">دخول المشرف</h2>
                        <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full bg-slate-800 p-2 mb-4 rounded border border-slate-700"/>
                        <button onClick={async () => {
                            const res = await fetch("/api/admin/items", { headers: { 'x-admin-key': adminPassword }});
                            if (res.ok) {
                                setAdminAuthenticated(true);
                                fetchAdminItems();
                            } else alert("كلمة مرور خاطئة");
                        }} className="w-full bg-cyan-600 p-2 rounded">دخول</button>
                    </div>
                ) : (
                    <div className="bg-slate-900 p-6 rounded border border-slate-700 w-full max-w-2xl h-[80vh] overflow-auto">
                        <button onClick={() => setAdminModalOpen(false)} className="float-right">X</button>
                        <h2 className="text-xl mb-4">لوحة تحكم المشرف</h2>

                        <div className="mb-6 p-4 bg-slate-800 rounded border border-slate-700 space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-bold text-cyan-400">كلمات السر للصندوق</h3>
                                <button onClick={generateSpinCode} className="bg-cyan-600 px-4 py-2 rounded text-sm text-white">توليد كلمة سر جديدة</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {adminSpinCodes.map((code, idx) => (
                                    <span key={idx} className="bg-slate-900 border border-slate-700 px-3 py-1 rounded font-mono text-cyan-300">{code}</span>
                                ))}
                                {adminSpinCodes.length === 0 && <span className="text-slate-500 text-sm">لا توجد كلمات سر غير مستخدمة</span>}
                            </div>
                        </div>
                        
                        <form onSubmit={saveItem} className="grid grid-cols-2 gap-2 mb-6">
                            <input name="name" placeholder="الاسم" defaultValue={editingItem?.name} className="bg-slate-800 p-2 rounded col-span-2" required />
                            <input name="price" type="number" step="0.01" placeholder="السعر" defaultValue={editingItem?.price} className="bg-slate-800 p-2 rounded" required />
                            <input name="imageUrl" placeholder="رابط الصورة" defaultValue={editingItem?.imageUrl} className="bg-slate-800 p-2 rounded" />
                            <button className="col-span-2 bg-cyan-600 p-2 rounded" type="submit">{editingItem ? "تحديث" : "إضافة عنصر"}</button>
                        </form>

                        <div className="space-y-2">
                            {adminItems.map(item => (
                                <div key={item.id} className="flex justify-between items-center bg-slate-800 p-2 rounded">
                                    <div className='flex items-center gap-2'>
                                        <img src={item.imageUrl} alt={item.name} className='w-10 h-10 rounded'/>
                                        <span>{item.name} (${item.price})</span>
                                    </div>
                                    <div>
                                        <button onClick={() => setEditingItem(item)} className="mr-2 text-cyan-400">تعديل</button>
                                        <button onClick={() => deleteItem(item.id)} className="text-red-400">حذف</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
  );
}


