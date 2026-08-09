import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, collection } from 'firebase/firestore';

// --- 1. Firebase 初始化 ---
const localFirebaseConfig = {
  apiKey: 'AIzaSyA8N_mCRjfCtXB97OpIsiyVHds-bxOmUso',
  authDomain: 'jiashin-sports-day.firebaseapp.com',
  projectId: 'jiashin-sports-day',
  storageBucket: 'jiashin-sports-day.firebasestorage.app',
  messagingSenderId: '758992182792',
  appId: '1:758992182792:web:06fc7f9a00ad322a023bbd',
};

const firebaseConfig = typeof (window as any).__firebase_config !== 'undefined' 
  ? JSON.parse((window as any).__firebase_config) 
  : localFirebaseConfig;

let app: any = null;
let auth: any = null;
let db: any = null;
let isFirebaseReady = false;

try {
  if (firebaseConfig && firebaseConfig.apiKey) {
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp(firebaseConfig);
    }
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseReady = true;
  }
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

const appId = 'jiashin-sports-2024';

// --- Types & Defaults ---
type Grade = 7 | 8 | 9;

interface ClassInfo {
  id: string;
  name: string;
  grade: Grade;
}

type EventType = 'group' | 'individual';
type Gender = 'M' | 'F' | 'Mixed';

interface SportEvent {
  id: string;
  name: string;
  type: EventType;
  gender: Gender;
  unit: string;
  sortBy: 'asc' | 'desc';
  rankPoints: number[];
  maxParticipants: number;
}

interface StudentResult {
  score: string;
  studentName?: string;
}

type ResultsData = Record<string, Record<string, StudentResult[]>>;

interface AppConfig {
  classes: ClassInfo[];
  events: SportEvent[];
}

const DEFAULT_POINTS = [7, 5, 4, 3, 2, 1];

const DEFAULT_CLASSES: ClassInfo[] = [
  { id: '701', name: '701', grade: 7 },
  { id: '702', name: '702', grade: 7 },
  { id: '703', name: '703', grade: 7 },
  { id: '704', name: '704', grade: 7 },
  { id: '801', name: '801', grade: 8 },
  { id: '802', name: '802', grade: 8 },
  { id: '803', name: '803', grade: 8 },
  { id: '804', name: '804', grade: 8 },
  { id: '805', name: '805', grade: 8 },
  { id: '901', name: '901', grade: 9 },
  { id: '902', name: '902', grade: 9 },
  { id: '903', name: '903', grade: 9 },
  { id: '904', name: '904', grade: 9 },
  { id: '905', name: '905', grade: 9 },
];

const DEFAULT_EVENTS: SportEvent[] = [
  { id: 'evt_creative', name: '創意進場', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [14, 10, 8, 6, 4, 2], maxParticipants: 1 },
  { id: 'evt_tug', name: '拔河', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [14, 10, 8, 6, 4, 2], maxParticipants: 1 },
  { id: 'evt_fun', name: '趣味競賽', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 1 },
  { id: 'evt_relay', name: '大隊接力', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [14, 10, 8, 6, 4, 2], maxParticipants: 1 },
  { id: 'evt_100m_m', name: '100m', type: 'individual', gender: 'M', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 1 },
  { id: 'evt_100m_f', name: '100m', type: 'individual', gender: 'F', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 1 },
];

const parsePoints = (str: string) => str.split(/[,，]/).map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));

const getEventDisplayName = (event: SportEvent) => {
  const genderLabel = event.gender === 'Mixed' ? '混合' : event.gender === 'M' ? '男' : '女';
  if (event.name.includes(genderLabel)) return event.name;
  return `${event.name} (${genderLabel})`;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [results, setResults] = useState<ResultsData>({});
  const [currentView, setCurrentView] = useState<'dashboard' | 'admin_input' | 'settings'>('dashboard');
  const [selectedGrade, setSelectedGrade] = useState<Grade | 'all'>(7);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // 1. Auth Init
  useEffect(() => {
    if (!isFirebaseReady || !auth) {
      setIsOfflineMode(true);
      setConfig({ classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS });
      return;
    }

    const initAuth = async () => {
      try {
        const win = window as any;
        if (typeof win.__initial_auth_token !== 'undefined' && win.__initial_auth_token) {
          await signInWithCustomToken(auth, win.__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error: any) {
        console.error("Auth Error:", error);
        setIsOfflineMode(true);
        setConfig({ classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (isOfflineMode) return;
    if (!user || !db || !isFirebaseReady) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main');
    const resultsRef = doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main');

    const unsubConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppConfig;
        const safeEvents = data.events?.map((e) => ({
          ...e,
          rankPoints: e.rankPoints || DEFAULT_POINTS,
          maxParticipants: e.maxParticipants || 1,
        })) || DEFAULT_EVENTS;
        setConfig({ ...data, classes: data.classes || DEFAULT_CLASSES, events: safeEvents });
      } else {
        const initialConfig = { classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS };
        setDoc(configRef, initialConfig)
          .then(() => setConfig(initialConfig))
          .catch(err => {
            console.warn("寫入初始設定失敗:", err);
            setIsOfflineMode(true);
            setConfig(initialConfig);
          });
      }
    }, (err) => {
      console.warn("讀取設定失敗:", err);
      setIsOfflineMode(true);
      setConfig({ classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS });
    });

    const unsubResults = onSnapshot(resultsRef, (docSnap) => {
      if (docSnap.exists()) {
        setResults(docSnap.data() as ResultsData);
      } else {
        setDoc(resultsRef, {}).catch(console.warn);
      }
    }, (err) => console.warn("讀取成績失敗:", err));

    return () => { unsubConfig(); unsubResults(); };
  }, [user, isOfflineMode]);

  const handleAdminLogin = () => {
    if (passwordInput === '8888') {
      setIsAdminMode(true);
      setCurrentView('admin_input');
      setPasswordInput('');
      document.getElementById('login-modal')?.classList.add('hidden');
    } else {
      alert('密碼錯誤');
    }
  };

  if (!config) return <div className="flex h-screen items-center justify-center text-blue-500 font-bold animate-pulse">資料載入中...</div>;

  return (
    <>
      {/* 互動式看板 (列印時隱藏 print:hidden) */}
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 print:hidden">
        <header className="bg-blue-600 text-white p-3 shadow-lg sticky top-0 z-50">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
              <span className="text-2xl">🏆</span>
              <div className="flex flex-col items-center leading-tight">
                <h1 className="text-xl font-bold tracking-wide">嘉新國中運動會</h1>
                <h2 className="text-base font-bold tracking-widest text-blue-100">即時看板</h2>
              </div>
            </div>
            <div>
              {isAdminMode ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-700 px-2 py-1 rounded hidden sm:inline">管理員</span>
                  <button onClick={() => setCurrentView('dashboard')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'dashboard' ? 'bg-blue-800' : ''}`} title="看板">🏆</button>
                  <button onClick={() => setCurrentView('admin_input')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'admin_input' ? 'bg-blue-800' : ''}`} title="成績">✏️</button>
                  <button onClick={() => setCurrentView('settings')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'settings' ? 'bg-blue-800' : ''}`} title="設定">⚙️</button>
                  <button onClick={() => { setIsAdminMode(false); setCurrentView('dashboard'); }} className="p-2 rounded hover:bg-red-500 bg-red-600 ml-1 flex items-center justify-center" title="登出">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                  </button>
                </div>
              ) : (
                <button onClick={() => document.getElementById('login-modal')?.classList.remove('hidden')} className="text-sm bg-blue-700 hover:bg-blue-500 px-3 py-1.5 rounded flex items-center gap-1">⚙️ 登入</button>
              )}
            </div>
          </div>
        </header>

        {isOfflineMode && (
          <div className="bg-orange-100 text-orange-800 px-4 py-2 text-center text-xs font-bold border-b border-orange-200">
            ⚠️ 單機展示模式 (無法連線至資料庫，變更僅暫存於記憶體)
          </div>
        )}

        <main className="max-w-5xl mx-auto p-4">
          {currentView === 'dashboard' && <Dashboard config={config} results={results} selectedGrade={selectedGrade} setSelectedGrade={setSelectedGrade} isAdminMode={isAdminMode} />}
          {currentView === 'admin_input' && isAdminMode && <AdminInput config={config} results={results} isOffline={isOfflineMode} setResults={setResults} />}
          {currentView === 'settings' && isAdminMode && <AdminSettings config={config} isOffline={isOfflineMode} setConfig={setConfig} setResults={setResults} />}
        </main>

        <div id="login-modal" className="hidden fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between mb-4"><h3 className="font-bold text-lg">工作人員登入</h3><button onClick={() => document.getElementById('login-modal')?.classList.add('hidden')}>❌</button></div>
            <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="請輸入通行碼" className="w-full border p-3 rounded mb-4" onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
            <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-3 rounded font-bold">登入</button>
          </div>
        </div>
      </div>

      {/* 列印專用的視圖 (平常隱藏，列印時顯示 print:block) */}
      <PrintableView config={config} results={results} />
    </>
  );
}

// --- Components ---

function Dashboard({ config, results, selectedGrade, setSelectedGrade, isAdminMode }: any) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const standings = useMemo(() => {
    const classPoints: Record<string, number> = {};
    config.classes.forEach((c: ClassInfo) => (classPoints[c.id] = 0));
    config.events.forEach((event: SportEvent) => {
      const eventResults = results[event.id] || {};
      [7, 8, 9].forEach((g) => {
        const gradeClasses = config.classes.filter((c: ClassInfo) => c.grade === g);
        let all = gradeClasses.flatMap((c: ClassInfo) => {
          const entries = eventResults[c.id] || [];
          return entries.filter((e: any) => e.score).map((e: any) => ({ classId: c.id, val: parseFloat(e.score) }));
        });
        all.sort((a: any, b: any) => event.sortBy === 'asc' ? a.val - b.val : b.val - a.val);
        all.forEach((item: any, idx: number) => {
          if (idx < (event.rankPoints || DEFAULT_POINTS).length) classPoints[item.classId] += (event.rankPoints || DEFAULT_POINTS)[idx];
        });
      });
    });
    const sorted = [...config.classes].sort((a, b) => classPoints[b.id] - classPoints[a.id]);
    const gradeChamps: any = {};
    [7, 8, 9].forEach(g => { gradeChamps[g] = sorted.find(c => c.grade === g); });
    return { classPoints, sorted, gradeChamps, schoolChamp: sorted[0] };
  }, [config, results]);

  const getTop3 = (eventId: string, grade: Grade) => {
    const event = config.events.find((e: SportEvent) => e.id === eventId);
    if (!event) return [];
    const eventResults = results[eventId] || {};
    const classes = config.classes.filter((c: ClassInfo) => c.grade === grade);
    let all: any[] = [];
    classes.forEach((c: ClassInfo) => {
      const entries = eventResults[c.id] || [];
      entries.forEach((e: any) => { if (e.score) all.push({ class: c.name, record: e, val: parseFloat(e.score) }); });
    });
    return all.sort((a, b) => event.sortBy === 'asc' ? a.val - b.val : b.val - a.val).slice(0, 3);
  };

  return (
    <div className="space-y-6">
      {/* 這裡是列印按鈕，只有在管理員模式下且在儀表板時才出現 */}
      {isAdminMode && (
        <div className="flex justify-end mb-2">
          <button onClick={() => window.print()} className="bg-slate-800 text-white px-5 py-2 rounded-lg font-bold shadow-md hover:bg-slate-700 transition flex items-center gap-2 text-sm">
            🖨️ 列印成績總表
          </button>
        </div>
      )}

      {!selectedEventId && (
        <>
          {isAdminMode && (
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl shadow-lg p-5 text-white relative overflow-hidden mb-6">
              <div className="font-bold flex items-center gap-2">👑 全校總冠軍 (僅管理員可見)</div>
              <div className="text-5xl font-extrabold mt-2">{standings.schoolChamp?.name || '-'}</div>
              <div className="mt-1 font-bold opacity-90">積分: {standings.classPoints[standings.schoolChamp?.id || ''] || 0}</div>
              <div className="text-white/20 absolute -right-6 -bottom-6 rotate-12 text-8xl">🏆</div>
            </div>
          )}
          <div className="bg-white rounded-xl shadow p-4 border border-slate-100 mb-6">
            <h3 className="font-bold text-slate-500 mb-3 flex items-center gap-2">🏅 各年級領先</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[7, 8, 9].map(g => (
                <div key={g} className="bg-slate-50 rounded p-3">
                  <div className="text-xs text-slate-400 mb-1">{g}年級</div>
                  <div className="text-xl font-bold text-blue-600">{standings.gradeChamps[g]?.name || '-'}</div>
                  <div className="text-xs text-slate-500">{standings.classPoints[standings.gradeChamps[g]?.id || ''] || 0} 分</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {([7, 8, 9] as const).map(g => (
          <button key={g} onClick={() => { setSelectedGrade(g); setSelectedEventId(null); }} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap shadow-sm transition ${selectedGrade === g ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{g} 年級</button>
        ))}
        <button onClick={() => { setSelectedGrade('all'); setSelectedEventId(null); }} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap shadow-sm transition ${selectedGrade === 'all' ? 'bg-slate-800 text-white ring-2 ring-slate-400' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>全校列表</button>
      </div>

      {selectedEventId ? (
        <div className="bg-white rounded-xl shadow overflow-hidden animate-fade-in">
          <div className="bg-slate-100 p-4 border-b flex justify-between items-center sticky top-0 z-10">
            <button onClick={() => setSelectedEventId(null)} className="text-blue-600 font-bold hover:bg-blue-200 px-3 py-1 rounded transition">← 返回</button>
            <h2 className="font-bold text-lg">{getEventDisplayName(config.events.find((e: any) => e.id === selectedEventId))}</h2>
          </div>
          <div className="overflow-x-auto"><ResultTable eventId={selectedEventId} config={config} results={results} gradeFilter={selectedGrade} /></div>
        </div>
      ) : (
        <>
          {!selectedEventId && (
            <div className="bg-white rounded-xl shadow overflow-hidden border border-slate-100 mb-6">
              <div className="bg-slate-50 p-3 font-bold text-slate-700 flex items-center gap-2">📊 總錦標積分榜</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="text-slate-400 border-b bg-slate-50/50"><th className="p-3 w-16 text-center">排名</th><th className="p-3">班級</th><th className="p-3 text-right">積分</th></tr></thead>
                  <tbody>{standings.sorted.filter((c: any) => selectedGrade === 'all' || c.grade === selectedGrade).map((c: any, idx: number) => (
                    <tr key={c.id} className={`border-b last:border-0 ${idx < 3 ? 'bg-yellow-50/60' : ''}`}>
                      <td className="p-3 font-bold text-slate-500 text-center">{idx + 1}</td>
                      <td className="p-3 font-bold text-lg">{c.name}</td>
                      <td className="p-3 text-right font-mono font-bold text-blue-600 text-lg">{standings.classPoints[c.id]}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">🏃 各項比賽成績</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {config.events.map((event: any) => {
              if (selectedGrade === 'all') return null;
              const top3 = getTop3(event.id, selectedGrade as Grade);
              return (
                <div key={event.id} onClick={() => setSelectedEventId(event.id)} className="bg-white rounded-xl shadow border border-slate-100 p-4 cursor-pointer hover:shadow-lg hover:border-blue-300 transition group">
                  <div className="flex justify-between items-center mb-3">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      {event.type === 'group' ? <span>👥</span> : <span>🏃</span>}
                      {getEventDisplayName(event)}
                    </div>
                    <span className="text-slate-300 group-hover:text-blue-500">➜</span>
                  </div>
                  {top3.length > 0 ? (
                    <div className="space-y-2 text-sm">
                      {top3.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold text-white ${idx===0?'bg-yellow-400':idx===1?'bg-gray-400':'bg-orange-400'}`}>{idx + 1}</span>
                            <span>{item.class} <span className="text-xs text-slate-400">{item.record.studentName}</span></span>
                          </div>
                          <span className="font-mono font-bold text-blue-600">{item.record.score} {event.unit}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-slate-400 text-sm italic py-2 text-center">尚無成績</div>}
                </div>
              );
            })}
            {selectedGrade === 'all' && <div className="col-span-full text-center text-slate-400 py-10 italic">請選擇年級以查看各項比賽詳細成績</div>}
          </div>
        </>
      )}
    </div>
  );
}

function ResultTable({ eventId, config, results, gradeFilter }: any) {
  const event = config.events.find((e: any) => e.id === eventId);
  const eventResults = results[eventId] || {};
  const classes = config.classes.filter((c: any) => gradeFilter === 'all' || c.grade === gradeFilter);
  
  let rows = classes.flatMap((c: any) => {
    const entries = eventResults[c.id] || [];
    if (entries.length === 0) return [{ class: c, score: '', student: '', val: event.sortBy === 'asc' ? Infinity : -Infinity }];
    return entries.map((e: any) => ({ class: c, score: e.score, student: e.studentName, val: e.score ? parseFloat(e.score) : (event.sortBy === 'asc' ? Infinity : -Infinity) }));
  });

  rows.sort((a: any, b: any) => {
    if (!a.score && !b.score) return a.class.id.localeCompare(b.class.id);
    if (!a.score) return 1;
    if (!b.score) return -1;
    return event.sortBy === 'asc' ? a.val - b.val : b.val - a.val;
  });

  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-slate-500 font-bold"><tr><th className="p-4 w-16 text-center">排名</th><th className="p-4">班級</th>{event.type === 'individual' && <th className="p-4">姓名</th>}<th className="p-4 text-right">成績</th><th className="p-4 text-right">積分</th></tr></thead>
      <tbody className="divide-y">{rows.map((row: any, idx: number) => {
        const hasScore = !!row.score;
        const pts = hasScore && idx < (event.rankPoints || DEFAULT_POINTS).length ? (event.rankPoints || DEFAULT_POINTS)[idx] : 0;
        return (
          <tr key={`${row.class.id}-${idx}`} className={hasScore && idx < 3 ? 'bg-yellow-50/30' : ''}>
            <td className="p-4 text-center font-bold text-slate-400">
                {hasScore && idx === 0 && '🥇'}
                {hasScore && idx === 1 && '🥈'}
                {hasScore && idx === 2 && '🥉'}
                {(!hasScore || idx > 2) && (hasScore ? idx + 1 : '-')}
            </td>
            <td className="p-4 font-bold text-lg">{row.class.name}</td>
            {event.type === 'individual' && <td className="p-4 text-slate-600">{row.student || '-'}</td>}
            <td className="p-4 text-right font-mono font-bold text-blue-600 text-lg">{row.score || '-'}</td>
            <td className="p-4 text-right font-mono text-slate-500">{hasScore ? `+${pts}` : '-'}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function AdminInput({ config, results, isOffline, setResults }: any) {
  const [selectedEventId, setSelectedEventId] = useState(config.events[0]?.id);
  const [selectedGrade, setSelectedGrade] = useState<Grade>(7);
  const [localScores, setLocalScores] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [batchText, setBatchText] = useState('');

  const selectedEvent = config.events.find((e: any) => e.id === selectedEventId);

  useEffect(() => {
    if (!selectedEvent) return;
    const current = results[selectedEventId] || {};
    const init: any = {};
    config.classes.forEach((c: any) => {
      const existing = current[c.id] || [];
      const entries = [];
      const limit = selectedEvent.maxParticipants || 1;
      for (let i = 0; i < limit; i++) entries.push(existing[i] || { score: '', studentName: '' });
      init[c.id] = entries;
    });
    setLocalScores(init);
  }, [selectedEventId, results, config]);

  const handleChange = (cid: string, idx: number, field: string, val: string) => {
    setLocalScores((prev: any) => {
      const copy = [...prev[cid]];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, [cid]: copy };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // 強制前端畫面優先更新，不再等待資料庫回應
    setResults((prev: any) => ({ ...prev, [selectedEventId]: localScores }));
    
    if (isOffline) {
        alert('已暫存 (離線模式)');
    } else {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), { [selectedEventId]: localScores });
        } catch (e) { 
            console.error(e);
            alert('儲存失敗，請檢查網路或權限'); 
        }
    }
    setSaving(false);
  };

  const handleBatch = () => {
    const lines = batchText.split('\n').map(s => s.trim()).filter(s => s);
    const targets = config.classes.filter((c: any) => c.grade === selectedGrade);
    const nextScores = { ...localScores };
    let lineIdx = 0;
    targets.forEach((c: any) => {
      const entries = [...(nextScores[c.id] || [])];
      for (let i = 0; i < entries.length; i++) {
        if (lineIdx < lines.length) entries[i].studentName = lines[lineIdx++];
      }
      nextScores[c.id] = entries;
    });
    setLocalScores(nextScores);
    setShowBatch(false);
  };

  const targets = config.classes.filter((c: any) => c.grade === selectedGrade);

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><span className="text-blue-600">✏️</span> 成績登錄</h2>
        {selectedEvent?.type === 'individual' && <button onClick={() => setShowBatch(true)} className="bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-200">📋 批次貼上姓名</button>}
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-1">年級</label>
          <div className="flex bg-slate-100 p-1 rounded-lg">{[7, 8, 9].map(g => (
            <button key={g} onClick={() => setSelectedGrade(g as Grade)} className={`flex-1 py-2 rounded-md font-bold text-sm transition ${selectedGrade === g ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>{g} 年級</button>
          ))}</div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-1">項目</label>
          <select className="w-full border-slate-200 border-2 p-2 rounded-lg font-bold text-slate-700" value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}>
            {config.events.map((e: any) => <option key={e.id} value={e.id}>{getEventDisplayName(e)}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex text-xs text-slate-400 font-bold px-2"><div className="w-16">班級</div>{selectedEvent?.type === 'individual' && <div className="w-24 mr-2">姓名</div>}<div className="flex-1">輸入{selectedEvent?.unit}</div></div>
        {targets.map((c: any) => (
          <div key={c.id} className="border border-slate-100 p-2 rounded-lg bg-slate-50/50">
            {localScores[c.id]?.map((entry: any, idx: number) => (
              <div key={idx} className="flex gap-2 mb-2 last:mb-0 items-center">
                <div className="font-bold w-16 text-lg text-slate-700 flex items-center gap-1">{c.name} {selectedEvent?.maxParticipants > 1 && <span className="text-xs bg-white px-1 rounded border text-slate-400">#{idx+1}</span>}</div>
                {selectedEvent?.type === 'individual' && <input type="text" placeholder="姓名" className="border p-2 rounded w-24 text-sm" value={entry.studentName} onChange={e => handleChange(c.id, idx, 'studentName', e.target.value)} />}
                <input type="number" step="0.01" placeholder={`成績`} className="border p-2 rounded flex-1 font-mono font-bold text-blue-600 text-lg" value={entry.score} onChange={e => handleChange(c.id, idx, 'score', e.target.value)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-500 disabled:opacity-50 shadow-lg flex items-center justify-center gap-2">{saving ? '儲存中...' : <>💾 儲存變更</>}</button>

      {showBatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm h-[500px] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg flex items-center gap-2">📄 批次匯入</h3><button onClick={() => setShowBatch(false)} className="text-slate-400 hover:text-slate-600">❌</button></div>
            <p className="text-xs text-blue-600 bg-blue-50 p-3 rounded mb-3">請直接從 Excel 複製該年級所有選手名單並貼上，系統將依班級順序自動填入。</p>
            <textarea className="flex-1 border p-3 rounded mb-4 resize-none focus:ring-2 focus:ring-blue-500 outline-none" value={batchText} onChange={e => setBatchText(e.target.value)} placeholder="王小明&#10;李小華&#10;陳大文..." />
            <button onClick={handleBatch} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">確認匯入</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminSettings({ config, isOffline, setConfig, setResults }: any) {
  const [localConfig, setLocalConfig] = useState(JSON.parse(JSON.stringify(config)));
  const [newName, setNewName] = useState('');
  const [newPoints, setNewPoints] = useState('7,5,4,3,2,1');
  const [newType, setNewType] = useState<EventType>('group');
  const [newGender, setNewGender] = useState<Gender>('Mixed');
  const [newMax, setNewMax] = useState(1);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false); // 控制清空所有成績的確認狀態

  const handleAdd = () => {
    if (!newName) return alert('請輸入名稱');
    setLocalConfig((prev: any) => ({
      ...prev,
      events: [...prev.events, {
        id: `evt_${Date.now()}`,
        name: newName,
        type: newType,
        gender: newGender,
        unit: '名次',
        sortBy: 'asc',
        rankPoints: parsePoints(newPoints),
        maxParticipants: newType === 'individual' ? newMax : 1
      }]
    }));
    setNewName('');
  };

  const removeEvent = (id: string) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      events: prev.events.filter((e: any) => e.id !== id),
    }));
  };

  const handleUpdateEvent = (id: string, updates: Partial<SportEvent>) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      events: prev.events.map((e: any) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  };

  const parsePoints = (str: string) => str.split(/[,，]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));

  const handleSave = async () => {
    setSaving(true);
    // 強制前端第一時間更新設定，不等待伺服器
    setConfig(localConfig);
    if (isOffline) {
        alert('已暫存 (離線模式)');
    } else {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main'), localConfig);
            alert('設定已儲存');
        } catch (e) { alert('儲存失敗'); }
    }
    setSaving(false);
  };

  const handleClearAllResults = async () => {
    if (confirmClear) {
      setSaving(true);
      // 第一時間清除前端記憶體的成績狀態
      setResults({});
      if (isOffline) {
        alert('已清空記憶體中的所有成績 (離線模式)');
      } else {
        try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), {});
          alert('已清空雲端資料庫的所有成績！');
        } catch (e) {
          console.error(e);
          alert('清除失敗，請檢查權限或網路。');
        }
      }
      setConfirmClear(false);
      setSaving(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000); // 3秒後取消確認狀態
    }
  };

  return (
    <div className="space-y-8 pb-32">
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><span className="text-yellow-500">🏆</span> 比賽項目管理</h3>
        <div className="grid grid-cols-12 gap-2 mb-6 p-4 border border-dashed rounded-lg bg-slate-50">
          <div className="col-span-12 md:col-span-3">
            <label className="text-xs font-bold text-slate-400 block mb-1">名稱</label>
            <input type="text" className="w-full border p-2 rounded" value={newName} onChange={e => setNewName(e.target.value)} placeholder="項目名稱" />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs font-bold text-slate-400 block mb-1">類型</label>
            <select className="w-full border p-2 rounded" value={newType} onChange={e => {
              const t = e.target.value as EventType;
              setNewType(t);
              setNewGender(t === 'group' ? 'Mixed' : 'M'); // 自動切換預設性別
            }}>
              <option value="group">團體</option>
              <option value="individual">個人</option>
            </select>
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs font-bold text-slate-400 block mb-1">性別</label>
            <select className="w-full border p-2 rounded" value={newGender} onChange={e => setNewGender(e.target.value as Gender)}>
              <option value="Mixed">混合</option>
              <option value="M">男</option>
              <option value="F">女</option>
            </select>
          </div>
          {newType === 'individual' && (
            <div className="col-span-6 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 block mb-1">每班人數</label>
              <input type="number" className="w-full border p-2 rounded" value={newMax} onChange={e => setNewMax(parseInt(e.target.value))} />
            </div>
          )}
          <div className={newType === 'individual' ? 'col-span-12 md:col-span-3' : 'col-span-12 md:col-span-5'}>
            <label className="text-xs font-bold text-slate-400 block mb-1">預設積分 (逗號分隔)</label>
            <input type="text" className="w-full border p-2 rounded font-mono" value={newPoints} onChange={e => setNewPoints(e.target.value)} placeholder="7,5,4,3,2,1" />
          </div>
          <div className="col-span-12 flex items-end">
            <button onClick={handleAdd} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 flex items-center justify-center gap-1">➕ 新增比賽項目</button>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {localConfig.events.map((e: any) => (
            <EventEditRow key={e.id} event={e} onUpdate={handleUpdateEvent} onRemove={removeEvent} />
          ))}
        </div>
      </div>
      
      {/* 危險操作區 - 清空所有成績 */}
      <div className="bg-red-50 p-6 rounded-xl border-2 border-red-200">
        <h3 className="font-bold text-red-600 mb-2 flex items-center gap-2">⚠️ 危險操作區</h3>
        <p className="text-sm text-red-500 mb-4">這將會清除資料庫中所有的比賽成績紀錄。如果這是新學期/新一屆運動會準備階段，您可以使用此功能。</p>
        <button 
          onClick={handleClearAllResults} 
          disabled={saving}
          className={`w-full py-3 rounded-lg font-bold transition-all ${
            confirmClear 
              ? 'bg-red-600 text-white animate-pulse' 
              : 'bg-white text-red-600 border-2 border-red-200 hover:bg-red-100'
          }`}
        >
          {saving ? '處理中...' : (confirmClear ? '🔥 確定要清空所有成績嗎？(再次點擊執行)' : '🗑️ 一鍵清空所有比賽成績')}
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t flex justify-end max-w-5xl mx-auto z-10">
        <button onClick={handleSave} disabled={saving} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-500 shadow-lg flex items-center gap-2">{saving ? '儲存中...' : <>✅ 儲存所有設定</>}</button>
      </div>
    </div>
  );
}

function EventEditRow({ event, onUpdate, onRemove }: { event: SportEvent; onUpdate: (id: string, updates: Partial<SportEvent>) => void; onRemove: (id: string) => void; }) {
  const [pointsStr, setPointsStr] = useState((event.rankPoints || DEFAULT_POINTS).join(','));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [maxPartStr, setMaxPartStr] = useState(String(event.maxParticipants || 1));
  useEffect(() => { setPointsStr((event.rankPoints || DEFAULT_POINTS).join(',')); setMaxPartStr(String(event.maxParticipants || 1)); }, [event.rankPoints, event.maxParticipants]);
  const handlePointsBlur = () => { const points = parsePoints(pointsStr); onUpdate(event.id, { rankPoints: points }); setPointsStr(points.join(',')); };
  const handleMaxPartChange = (val: string) => { setMaxPartStr(val); const num = parseInt(val); if (!isNaN(num) && num > 0) { onUpdate(event.id, { maxParticipants: num }); } };
  const handleMaxPartBlur = () => { if (!maxPartStr || parseInt(maxPartStr) <= 0) { setMaxPartStr(String(event.maxParticipants || 1)); onUpdate(event.id, { maxParticipants: event.maxParticipants || 1 }); } };
  const handleDeleteClick = (e: React.MouseEvent) => { e.stopPropagation(); if (confirmDelete) { onRemove(event.id); } else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); } };
  return (
    <div className="flex flex-col md:flex-row items-center gap-3 p-3 border rounded bg-white hover:bg-slate-50 transition animate-fade-in">
      <div className="flex items-center gap-3 flex-1 w-full"><span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${event.type === 'group' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{event.type === 'group' ? '團體' : '個人'}</span><span className="font-bold text-slate-700 flex-1">{getEventDisplayName(event)}</span><span className="text-xs text-slate-400 whitespace-nowrap">({event.gender === 'Mixed' ? '混合' : event.gender === 'M' ? '男' : '女'})</span></div>
      <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 flex-wrap md:flex-nowrap justify-end">{event.type === 'individual' && (<div className="flex items-center text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded border">👤 <input type="number" min="1" max="10" className="w-8 bg-transparent text-center font-bold outline-none border-b border-slate-300 focus:border-blue-500" value={maxPartStr} onChange={(e) => handleMaxPartChange(e.target.value)} onBlur={handleMaxPartBlur} />人/班</div>)}<div className="flex items-center">🔢 <input type="text" className="border rounded px-2 py-2 text-xs font-mono w-32 md:w-48 text-slate-600 focus:ring-2 focus:ring-blue-200 outline-none" value={pointsStr} onChange={(e) => setPointsStr(e.target.value)} onBlur={handlePointsBlur} placeholder="積分: 7,5,4..." title="編輯積分 (逗號分隔，離開儲存)" /></div><button type="button" onClick={handleDeleteClick} className={`p-2 rounded ml-1 flex items-center gap-1 transition-all duration-200 ${confirmDelete ? 'bg-red-600 text-white w-24 justify-center text-xs font-bold' : 'bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 w-10 justify-center'}`} title="刪除">{confirmDelete ? '確認刪除?' : '🗑️'}</button></div>
    </div>
  );
}

function PrintableView({ config, results }: any) {
  const classPoints: Record<string, number> = {};
  config.classes.forEach((c: any) => (classPoints[c.id] = 0));

  config.events.forEach((event: any) => {
    const eventResults = results[event.id] || {};
    const currentPointsSystem = event.rankPoints || DEFAULT_POINTS;

    [7, 8, 9].forEach((g) => {
      const gradeClasses = config.classes.filter((c: any) => c.grade === g);
      let allParticipants: { classId: string; val: number }[] = [];

      gradeClasses.forEach((c: any) => {
        const classEntries = eventResults[c.id] || [];
        classEntries.forEach((entry: any) => {
          if (entry.score) {
            allParticipants.push({
              classId: c.id,
              val: parseFloat(entry.score),
            });
          }
        });
      });

      allParticipants.sort((a, b) => {
        if (event.sortBy === 'asc') return a.val - b.val;
        return b.val - a.val;
      });

      allParticipants.forEach((item, idx) => {
        if (idx < currentPointsSystem.length) {
          classPoints[item.classId] += currentPointsSystem[idx];
        }
      });
    });
  });

  const getTop = (eventId: string, grade: Grade, limit = 3) => {
    const event = config.events.find((e: any) => e.id === eventId);
    if (!event) return [];
    const eventResults = results[eventId] || {};
    const relevantClasses = config.classes.filter((c: any) => c.grade === grade);
    let allParticipants: { class: string; record: any; val: number }[] = [];
    
    relevantClasses.forEach((c: any) => {
      const entries = eventResults[c.id] || [];
      entries.forEach((entry: any) => {
        if (entry.score) {
          allParticipants.push({ class: c.name, record: entry, val: parseFloat(entry.score) });
        }
      });
    });
    
    allParticipants.sort((a, b) => event.sortBy === 'asc' ? a.val - b.val : b.val - a.val);
    return allParticipants.slice(0, limit);
  };

  const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="hidden print:block p-8 bg-white text-black font-sans w-full max-w-none">
      <div className="text-center mb-8 border-b-4 border-black pb-4">
        <h1 className="text-4xl font-bold mb-2">嘉新國中運動會 成績總表</h1>
        <p className="text-gray-500">列印時間：{dateStr}</p>
      </div>

      <h2 className="text-2xl font-bold bg-gray-200 py-2 px-4 mb-4 rounded">🏆 各年級總錦標排名</h2>
      <div className="grid grid-cols-3 gap-6 mb-10 break-inside-avoid">
        {([7, 8, 9] as const).map(grade => {
          const gradeClasses = config.classes
            .filter((c: any) => c.grade === grade)
            .sort((a: any, b: any) => classPoints[b.id] - classPoints[a.id]);
            
          return (
            <div key={grade} className="border-2 border-black rounded overflow-hidden">
              <h3 className="font-bold text-lg text-center bg-black text-white py-1">{grade} 年級</h3>
              <table className="w-full text-center">
                <thead className="bg-gray-100 border-b-2 border-black">
                  <tr>
                    <th className="p-2 border-r border-gray-300">名次</th>
                    <th className="p-2 border-r border-gray-300">班級</th>
                    <th className="p-2">總分</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeClasses.map((c: any, idx: number) => (
                    <tr key={c.id} className="border-b border-gray-300 last:border-0">
                      <td className="p-2 border-r border-gray-300 font-bold">{idx + 1}</td>
                      <td className="p-2 border-r border-gray-300 font-bold text-lg">{c.name}</td>
                      <td className="p-2 font-mono text-lg">{classPoints[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="break-before-page"></div>

      <h2 className="text-2xl font-bold bg-gray-200 py-2 px-4 mb-6 rounded mt-8">🏃 各項比賽得獎名單 (前三名)</h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6">
        {config.events.map((event: any) => (
          <div key={event.id} className="border border-black rounded p-4 break-inside-avoid shadow-sm">
            <h3 className="font-bold text-xl border-b-2 border-black pb-2 mb-3 flex justify-between items-end">
              <span>{event.name} <span className="text-base text-gray-500">({event.gender === 'Mixed' ? '混合' : event.gender === 'M' ? '男' : '女'})</span></span>
              <span className="text-sm font-normal text-gray-600 bg-gray-100 px-2 rounded">
                {event.type === 'group' ? '團體賽' : '個人賽'}
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {([7, 8, 9] as const).map(grade => {
                 const tops = getTop(event.id, grade, 3);
                 return (
                   <div key={grade}>
                     <div className="font-bold text-center bg-gray-100 mb-2 py-0.5 rounded">{grade} 年級</div>
                     {tops.length > 0 ? (
                       <div className="space-y-2">
                         {tops.map((t, i) => (
                           <div key={i} className="flex flex-col border-b border-gray-200 pb-1 last:border-0 text-sm">
                             <div className="flex justify-between items-end">
                               <span className="font-bold">{i+1}. {t.class}</span>
                               <span className="font-mono text-xs text-gray-700">{t.record.score} {event.unit}</span>
                             </div>
                             {t.record.studentName && <div className="text-gray-500 text-xs mt-0.5">{t.record.studentName}</div>}
                           </div>
                         ))}
                       </div>
                     ) : (
                       <div className="text-gray-400 text-xs italic text-center py-2">尚無成績</div>
                     )}
                   </div>
                 )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}