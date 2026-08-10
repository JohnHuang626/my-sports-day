import { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';

// --- 1. Firebase 設定與初始化 ---
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

const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'jiashin-sports-2024';

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
  isRegistrationOpen?: boolean; // 控制是否開放報名
  classes: ClassInfo[];
  events: SportEvent[];
}

const DEFAULT_POINTS = [7, 5, 4, 3, 2, 1];

const DEFAULT_CLASSES: ClassInfo[] = [
  { id: '701', name: '701', grade: 7 }, { id: '702', name: '702', grade: 7 }, { id: '703', name: '703', grade: 7 }, { id: '704', name: '704', grade: 7 },
  { id: '801', name: '801', grade: 8 }, { id: '802', name: '802', grade: 8 }, { id: '803', name: '803', grade: 8 }, { id: '804', name: '804', grade: 8 }, { id: '805', name: '805', grade: 8 },
  { id: '901', name: '901', grade: 9 }, { id: '902', name: '902', grade: 9 }, { id: '903', name: '903', grade: 9 }, { id: '904', name: '904', grade: 9 }, { id: '905', name: '905', grade: 9 },
];

const DEFAULT_EVENTS: SportEvent[] = [
  { id: 'evt_creative', name: '創意進場', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [14, 10, 8, 6, 4, 2], maxParticipants: 1 },
  { id: 'evt_tug', name: '拔河', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [14, 10, 8, 6, 4, 2], maxParticipants: 1 },
  { id: 'evt_fun', name: '趣味競賽', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 1 },
  { id: 'evt_relay', name: '大隊接力', type: 'group', gender: 'Mixed', unit: '名次', sortBy: 'asc', rankPoints: [14, 10, 8, 6, 4, 2], maxParticipants: 1 },
  { id: 'evt_100m_m', name: '100m', type: 'individual', gender: 'M', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 2 },
  { id: 'evt_100m_f', name: '100m', type: 'individual', gender: 'F', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 2 },
  { id: 'evt_200m_m', name: '200m', type: 'individual', gender: 'M', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 2 },
  { id: 'evt_200m_f', name: '200m', type: 'individual', gender: 'F', unit: '名次', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 2 },
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
  const [loggedInClass, setLoggedInClass] = useState<string | null>(null); // 班級登入狀態
  const [passwordInput, setPasswordInput] = useState('');
  
  // Login Modal State
  const [loginTab, setLoginTab] = useState<'class' | 'admin'>('class');
  const [selectedLoginClass, setSelectedLoginClass] = useState<string>('');

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [results, setResults] = useState<ResultsData>({});
  const [currentView, setCurrentView] = useState<'dashboard' | 'admin_input' | 'settings' | 'class_registration'>('dashboard');
  const [selectedGrade, setSelectedGrade] = useState<Grade | 'all'>(7);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // 1. Auth Init
  useEffect(() => {
    if (!isFirebaseReady || !auth) {
      setIsOfflineMode(true);
      setConfig({ isRegistrationOpen: true, classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS });
      return;
    }

    const initAuth = async () => {
      try {
        const previewToken = typeof (window as any).__initial_auth_token !== 'undefined' ? (window as any).__initial_auth_token : undefined;
        if (previewToken) {
          await signInWithCustomToken(auth, previewToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error: any) {
        console.error("Auth Error:", error);
        setIsOfflineMode(true);
        setConfig({ isRegistrationOpen: true, classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS });
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
        setConfig({ 
          ...data, 
          isRegistrationOpen: data.isRegistrationOpen !== false, // 預設為 true
          classes: data.classes || DEFAULT_CLASSES, 
          events: safeEvents 
        });
      } else {
        const initialConfig = { isRegistrationOpen: true, classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS };
        setDoc(configRef, initialConfig).then(() => setConfig(initialConfig)).catch(() => {
          setIsOfflineMode(true);
          setConfig(initialConfig);
        });
      }
    }, () => {
      setIsOfflineMode(true);
      setConfig({ isRegistrationOpen: true, classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS });
    });

    const unsubResults = onSnapshot(resultsRef, (docSnap) => {
      if (docSnap.exists()) {
        setResults(docSnap.data() as ResultsData);
      } else {
        setDoc(resultsRef, {}).catch(console.warn);
      }
    }, () => console.warn("讀取成績失敗"));

    return () => { unsubConfig(); unsubResults(); };
  }, [user, isOfflineMode]);

  // --- Login Handlers ---
  const handleAdminLogin = () => {
    if (passwordInput === '8888') {
      setIsAdminMode(true);
      setLoggedInClass(null);
      setCurrentView('admin_input');
      setPasswordInput('');
      document.getElementById('login-modal')?.classList.add('hidden');
    } else {
      alert('密碼錯誤');
    }
  };

  const handleClassLogin = () => {
    if (!selectedLoginClass) return alert('請選擇班級');
    if (passwordInput === '1234') { // 預設班級通用密碼
      setLoggedInClass(selectedLoginClass);
      setIsAdminMode(false);
      setCurrentView('class_registration');
      setPasswordInput('');
      document.getElementById('login-modal')?.classList.add('hidden');
    } else {
      alert('密碼錯誤 (預設為 1234)');
    }
  };

  if (!config) return <div className="flex h-screen items-center justify-center text-blue-500 font-bold animate-pulse">資料載入中...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 print:bg-white print:pb-0">
      {/* Header */}
      <header className="bg-blue-600 text-white p-3 shadow-lg sticky top-0 z-50 print:hidden">
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
                <button onClick={() => setCurrentView('admin_input')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'admin_input' ? 'bg-blue-800' : ''}`} title="成績輸入">✏️</button>
                <button onClick={() => setCurrentView('settings')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'settings' ? 'bg-blue-800' : ''}`} title="設定">⚙️</button>
                <button onClick={() => { setIsAdminMode(false); setCurrentView('dashboard'); }} className="p-2 rounded hover:bg-red-500 bg-red-600 ml-1" title="登出">👋</button>
              </div>
            ) : loggedInClass ? (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-green-700 px-2 py-1 rounded font-bold hidden sm:inline">{loggedInClass}</span>
                <button onClick={() => setCurrentView('dashboard')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'dashboard' ? 'bg-blue-800' : ''}`} title="看板">🏆</button>
                <button onClick={() => setCurrentView('class_registration')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'class_registration' ? 'bg-blue-800' : ''}`} title="填寫報名表">📝</button>
                <button onClick={() => { setLoggedInClass(null); setCurrentView('dashboard'); }} className="p-2 rounded hover:bg-red-500 bg-red-600 ml-1" title="登出">👋</button>
              </div>
            ) : (
              <button onClick={() => document.getElementById('login-modal')?.classList.remove('hidden')} className="text-sm bg-blue-700 hover:bg-blue-500 px-3 py-1.5 rounded flex items-center gap-1">⚙️ 登入</button>
            )}
          </div>
        </div>
      </header>

      {isOfflineMode && (
        <div className="bg-orange-100 text-orange-800 px-4 py-2 text-center text-xs font-bold border-b border-orange-200 print:hidden">
          ⚠️ 單機展示模式 (無法連線至資料庫，變更僅暫存於記憶體)
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 print:p-0 print:m-0 print:max-w-none print:w-full">
        {currentView === 'dashboard' && <Dashboard config={config} results={results} selectedGrade={selectedGrade} setSelectedGrade={setSelectedGrade} isAdminMode={isAdminMode} />}
        {currentView === 'admin_input' && isAdminMode && <AdminInput config={config} results={results} isOffline={isOfflineMode} setResults={setResults} />}
        {currentView === 'settings' && isAdminMode && <AdminSettings config={config} isOffline={isOfflineMode} setConfig={setConfig} setResults={setResults} />}
        {currentView === 'class_registration' && loggedInClass && <ClassRegistration config={config} results={results} loggedInClass={loggedInClass} isOffline={isOfflineMode} setResults={setResults} />}
      </main>

      {/* 雙重登入 Modal */}
      <div id="login-modal" className="hidden fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg w-full max-w-sm shadow-xl overflow-hidden">
          <div className="flex bg-slate-100 border-b">
            <button 
              className={`flex-1 py-3 font-bold text-sm ${loginTab === 'class' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
              onClick={() => setLoginTab('class')}
            >各班報名</button>
            <button 
              className={`flex-1 py-3 font-bold text-sm ${loginTab === 'admin' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
              onClick={() => setLoginTab('admin')}
            >管理員</button>
          </div>
          
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-700">{loginTab === 'class' ? '📝 各班報名登入' : '⚙️ 管理員登入'}</h3>
              <button onClick={() => document.getElementById('login-modal')?.classList.add('hidden')} className="text-slate-400 hover:text-slate-600">❌</button>
            </div>

            {loginTab === 'class' ? (
              <>
                <select 
                  className="w-full border p-3 rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={selectedLoginClass}
                  onChange={e => setSelectedLoginClass(e.target.value)}
                >
                  <option value="">-- 請選擇您的班級 --</option>
                  {config.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="請輸入報名密碼"
                  className="w-full border p-3 rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleClassLogin()}
                />
                <button onClick={handleClassLogin} className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 transition">登入報名</button>
                <div className="text-center text-xs text-slate-400 mt-4">預設報名密碼為: 1234</div>
              </>
            ) : (
              <>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="請輸入通行碼"
                  className="w-full border p-3 rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                />
                <button onClick={handleAdminLogin} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 transition">登入管理</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Class Registration Component ---
function ClassRegistration({ config, results, loggedInClass, isOffline, setResults }: any) {
  const [localData, setLocalData] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  // 只挑選需要個人報名的項目（過濾掉團體賽）
  const individualEvents = useMemo(() => {
    return config.events.filter((evt: any) => evt.type === 'individual');
  }, [config.events]);

  useEffect(() => {
    const initData: Record<string, string[]> = {};
    individualEvents.forEach((evt: any) => {
      const evtResults = results[evt.id]?.[loggedInClass] || [];
      const limit = evt.maxParticipants || 1;
      const names = [];
      for (let i = 0; i < limit; i++) {
        names.push(evtResults[i]?.studentName || '');
      }
      initData[evt.id] = names;
    });
    setLocalData(initData);
  }, [individualEvents, results, loggedInClass]);

  const handleNameChange = (eventId: string, idx: number, val: string) => {
    setLocalData(prev => {
      const copy = [...(prev[eventId] || [])];
      copy[idx] = val;
      return { ...prev, [eventId]: copy };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const dataToSave: any = {};
    
    // 將畫面上的名字，與資料庫中可能已經有的 "score" 進行合併
    individualEvents.forEach((evt: any) => {
      const names = localData[evt.id] || [];
      const existingResults = results[evt.id]?.[loggedInClass] || [];
      const merged = names.map((name, i) => ({
        studentName: name,
        score: existingResults[i]?.score || ''
      }));
      dataToSave[evt.id] = { [loggedInClass]: merged };
    });

    if (isOffline) {
      setResults((prev: any) => {
        const next = { ...prev };
        Object.keys(dataToSave).forEach(evtId => {
          if (!next[evtId]) next[evtId] = {};
          next[evtId][loggedInClass] = dataToSave[evtId][loggedInClass];
        });
        return next;
      });
      alert('已暫存 (離線模式)');
    } else {
      try {
        // 使用 merge: true 確保只更新這一個班級，不會蓋掉其他班級的報名資料或成績
        // 也不會影響到不需要報名的「團體賽」資料
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), dataToSave, { merge: true });
        alert('報名名單已成功送出！');
      } catch (e) {
        console.error(e);
        alert('儲存失敗，請檢查網路連線。');
      }
    }
    setSaving(false);
  };

  if (config.isRegistrationOpen === false) {
    return (
      <div className="bg-white rounded-xl shadow p-10 text-center max-w-2xl mx-auto mt-8 border border-red-100">
        <div className="text-6xl mb-4">⛔</div>
        <h2 className="text-2xl font-bold text-red-600 mb-2">線上報名已截止</h2>
        <p className="text-slate-500">目前無法修改選手名單。如有特殊情況，請聯繫體育組或管理員。</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold mb-1">📝 {loggedInClass} 選手報名表</h2>
          <p className="text-green-100 text-sm">請依各項規定人數填寫選手姓名。<br/>(註：大隊接力、拔河等團體項目不需線上報名，將以班級為單位參賽)</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 border border-slate-100">
        <div className="space-y-6">
          {individualEvents.length === 0 ? (
            <div className="text-center text-slate-400 py-10 font-bold">
              目前沒有需要個人報名的項目。
            </div>
          ) : (
            individualEvents.map((event: any) => {
              const limit = event.maxParticipants || 1;
              return (
                <div key={event.id} className="border border-slate-200 p-4 rounded-lg bg-slate-50 hover:bg-slate-100/50 transition">
                  <div className="flex justify-between items-center mb-3 border-b border-slate-200 pb-2">
                    <div className="font-bold text-lg text-slate-800 flex items-center gap-2">
                      🏃 {getEventDisplayName(event)}
                    </div>
                    <div className="text-xs font-bold text-slate-500 bg-white px-2 py-1 rounded border shadow-sm">
                      需要 {limit} 人
                    </div>
                  </div>
                  
                  <div className={`grid gap-3 ${limit > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                    {Array.from({length: limit}).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-400 w-12 text-right">選手{i+1}</span>
                        <input
                          type="text"
                          placeholder="請輸入姓名"
                          className="flex-1 border p-2.5 rounded-lg focus:ring-2 focus:ring-green-400 outline-none transition shadow-sm"
                          value={localData[event.id]?.[i] || ''}
                          onChange={e => handleNameChange(event.id, i, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {individualEvents.length > 0 && (
          <div className="mt-8 pt-6 border-t flex justify-end sticky bottom-4">
            <button 
              onClick={handleSave} 
              disabled={saving} 
              className="w-full sm:w-auto bg-green-600 text-white px-10 py-4 rounded-xl font-bold hover:bg-green-500 shadow-xl transition transform active:scale-95 flex items-center justify-center gap-2 text-lg"
            >
              {saving ? '儲存中...' : <>✅ 確認送出名單</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Dashboard Component ---
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
    <div className="w-full">
      {/* 隱藏的列印報表 */}
      <PrintReport config={config} standings={standings} getTop3={getTop3} />

      <div className="print:hidden space-y-6">
        {!selectedEventId && (
          <>
            {isAdminMode && (
              <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow border border-slate-100 mb-6">
                <div className="text-slate-600 font-bold">管理員面板</div>
                <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-slate-700 transition flex items-center gap-2">
                  🖨️ 列印成績總表
                </button>
              </div>
            )}
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
  }, [selectedEventId, results, config, selectedEvent]);

  const handleChange = (cid: string, idx: number, field: string, val: string) => {
    setLocalScores((prev: any) => {
      const copy = [...prev[cid]];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, [cid]: copy };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setResults((prev: any) => ({ ...prev, [selectedEventId]: localScores }));
    if (isOffline) {
        alert('已暫存 (離線模式)');
    } else {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), { [selectedEventId]: localScores }, { merge: true });
            alert('儲存成功');
        } catch (e) { alert('儲存失敗'); }
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
        {selectedEvent?.type === 'individual' && <button onClick={() => setShowBatch(true)} className="bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-200">📋 批次貼上姓名</button>}
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
                <div className="font-bold w-16 text-lg text-slate-700">{c.name}</div>
                {selectedEvent?.type === 'individual' && <input type="text" placeholder="姓名" className="border p-2 rounded w-24 text-sm" value={entry.studentName} onChange={e => handleChange(c.id, idx, 'studentName', e.target.value)} />}
                <input type="number" step="0.01" placeholder={`成績`} className="border p-2 rounded flex-1 font-mono font-bold text-blue-600 text-lg" value={entry.score} onChange={e => handleChange(c.id, idx, 'score', e.target.value)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-500 disabled:opacity-50 shadow-lg">{saving ? '儲存中...' : '💾 儲存變更'}</button>

      {showBatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm h-[500px] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">📄 批次匯入</h3><button onClick={() => setShowBatch(false)}>❌</button></div>
            <textarea className="flex-1 border p-3 rounded mb-4 resize-none" value={batchText} onChange={e => setBatchText(e.target.value)} placeholder="王小明&#10;李小華&#10;陳大文..." />
            <button onClick={handleBatch} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">確認匯入</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventEditRow({ event, onUpdate, onRemove }: any) {
  const [pointsStr, setPointsStr] = useState((event.rankPoints || DEFAULT_POINTS).join(','));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [maxPartStr, setMaxPartStr] = useState(String(event.maxParticipants || 1));
  
  useEffect(() => { 
    setPointsStr((event.rankPoints || DEFAULT_POINTS).join(',')); 
    setMaxPartStr(String(event.maxParticipants || 1)); 
  }, [event.rankPoints, event.maxParticipants]);

  const handlePointsBlur = () => { onUpdate(event.id, { rankPoints: parsePoints(pointsStr) }); };
  const handleMaxPartChange = (val: string) => { setMaxPartStr(val); const num = parseInt(val); if (!isNaN(num) && num > 0) { onUpdate(event.id, { maxParticipants: num }); } };
  const handleMaxPartBlur = () => { if (!maxPartStr || parseInt(maxPartStr) <= 0) { setMaxPartStr(String(event.maxParticipants || 1)); onUpdate(event.id, { maxParticipants: event.maxParticipants || 1 }); } };
  const handleDeleteClick = () => { if (confirmDelete) { onRemove(event.id); } else { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); } };

  return (
    <div className="flex flex-col md:flex-row items-center gap-3 p-3 border rounded bg-white hover:bg-slate-50 transition">
      <div className="flex items-center gap-3 flex-1 w-full"><span className={`text-xs px-2 py-1 rounded ${event.type === 'group' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{event.type === 'group' ? '團體' : '個人'}</span><span className="font-bold flex-1">{getEventDisplayName(event)}</span></div>
      <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 justify-end">
        {event.type === 'individual' && (<div className="flex items-center text-xs bg-slate-100 px-2 py-1 rounded border">👤 <input type="number" min="1" max="10" className="w-8 bg-transparent text-center font-bold outline-none" value={maxPartStr} onChange={(e) => handleMaxPartChange(e.target.value)} onBlur={handleMaxPartBlur} />人/班</div>)}
        <div className="flex items-center">🔢 <input type="text" className="border rounded px-2 py-2 text-xs font-mono w-32 outline-none" value={pointsStr} onChange={(e) => setPointsStr(e.target.value)} onBlur={handlePointsBlur} /></div>
        <button type="button" onClick={handleDeleteClick} className={`p-2 rounded ml-1 ${confirmDelete ? 'bg-red-600 text-white text-xs font-bold w-24' : 'bg-red-50 text-red-500 w-10'}`}>{confirmDelete ? '確認刪除?' : '🗑️'}</button>
      </div>
    </div>
  );
}

function AdminSettings({ config, isOffline, setConfig, setResults }: any) {
  const [localConfig, setLocalConfig] = useState(JSON.parse(JSON.stringify(config)));
  const [newEventName, setNewEventName] = useState('');
  const [newEventPoints, setNewEventPoints] = useState('7,5,4,3,2,1');
  const [eventType, setEventType] = useState<EventType>('group');
  const [eventGender, setEventGender] = useState<Gender>('Mixed');
  const [maxParticipants, setMaxParticipants] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => { setLocalConfig(JSON.parse(JSON.stringify(config))); }, [config]);

  const updateConfig = async () => { 
    setIsSaving(true); 
    setConfig(localConfig);
    if (isOffline) {
        alert('設定已暫存 (離線模式)');
    } else {
        try { 
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main'), localConfig); 
            alert('設定已更新'); 
        } catch (e) { alert('更新失敗'); }
    }
    setIsSaving(false); 
  };

  const addEvent = () => { 
    if (!newEventName.trim()) return alert('請輸入名稱'); 
    const points = parsePoints(newEventPoints); 
    setLocalConfig((prev: any) => ({ ...prev, events: [...prev.events, { id: `evt_${Date.now()}`, name: newEventName, type: eventType, gender: eventGender, unit: '名次', sortBy: 'asc', rankPoints: points.length > 0 ? points : DEFAULT_POINTS, maxParticipants: eventType === 'individual' ? maxParticipants : 1 }] })); 
    setNewEventName(''); 
  };

  const removeEvent = (id: string) => setLocalConfig((prev: any) => ({ ...prev, events: prev.events.filter((e: any) => e.id !== id) }));
  const handleUpdateEvent = (id: string, updates: any) => setLocalConfig((prev: any) => ({ ...prev, events: prev.events.map((e: any) => e.id === id ? { ...e, ...updates } : e) }));
  const addClass = (grade: Grade) => { const count = localConfig.classes.filter((c: any) => c.grade === grade).length; const newClass = { id: `${grade}0${count + 1}`, name: `${grade}0${count + 1}`, grade }; setLocalConfig((prev: any) => ({ ...prev, classes: [...prev.classes, newClass].sort((a: any, b: any) => a.id.localeCompare(b.id)) })); };
  const removeLastClass = (grade: Grade) => { const gcs = localConfig.classes.filter((c: any) => c.grade === grade); if (!gcs.length) return; setLocalConfig((prev: any) => ({ ...prev, classes: prev.classes.filter((c: any) => c.id !== gcs[gcs.length - 1].id) })); };

  const handleClearAllResults = async () => {
    if (confirmClearAll) {
        setIsSaving(true);
        setResults({});
        if (isOffline) { alert('成績已清空 (離線模式)'); } 
        else {
            try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), {}); alert('所有成績已清空！'); } 
            catch (e) { alert('清除失敗'); }
        }
        setConfirmClearAll(false);
        setIsSaving(false);
    } else {
        setConfirmClearAll(true);
        setTimeout(() => setConfirmClearAll(false), 3000);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <div className="bg-white p-6 rounded-xl shadow-md border border-slate-100">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">⚙️ 系統設定</h3>
        <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50">
          <div>
            <div className="font-bold">開放各班線上報名</div>
            <div className="text-xs text-slate-500 mt-1">開啟後，各班導師/股長可登入並填寫選手名單。</div>
          </div>
          <button onClick={() => setLocalConfig({...localConfig, isRegistrationOpen: !localConfig.isRegistrationOpen})} className={`px-5 py-2 rounded-full font-bold transition ${localConfig.isRegistrationOpen !== false ? 'bg-green-500 text-white shadow-md' : 'bg-slate-300 text-slate-600'}`}>
            {localConfig.isRegistrationOpen !== false ? '已開啟' : '已關閉'}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md"><h3 className="text-xl font-bold mb-4 flex items-center gap-2">👥 班級管理</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-6">{([7, 8, 9] as const).map((grade) => (<div key={grade} className="bg-slate-50 p-4 rounded-lg border border-slate-100"><h4 className="font-bold text-center mb-3 text-lg">{grade} 年級</h4><div className="flex flex-wrap gap-2 mb-4 justify-center">{localConfig.classes.filter((c: any) => c.grade === grade).map((c: any) => (<span key={c.id} className="bg-white px-2 py-1 rounded shadow-sm text-sm border">{c.name}</span>))}</div><div className="flex gap-2"><button type="button" onClick={() => removeLastClass(grade)} className="flex-1 bg-red-100 text-red-600 py-2 rounded hover:bg-red-200 font-bold">- 減少</button><button type="button" onClick={() => addClass(grade)} className="flex-1 bg-blue-100 text-blue-600 py-2 rounded hover:bg-blue-200 font-bold">+ 增加</button></div></div>))}</div></div>
      <div className="bg-white p-6 rounded-xl shadow-md"><h3 className="text-xl font-bold mb-4 flex items-center gap-2">🏆 比賽項目管理</h3><div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-6 p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300"><div className="md:col-span-3"><label className="text-xs font-bold text-slate-400 block mb-1">新項目名稱</label><input type="text" placeholder="例如: 400m接力" className="w-full border p-2 rounded text-sm" value={newEventName} onChange={(e) => setNewEventName(e.target.value)} /></div><div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 block mb-1">類型</label><select className="w-full border p-2 rounded text-sm" value={eventType} onChange={(e) => { const t = e.target.value as EventType; setEventType(t); setEventGender(t === 'group' ? 'Mixed' : 'M'); }}><option value="group">團體賽</option><option value="individual">個人賽</option></select></div><div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 block mb-1">性別</label><select className="w-full border p-2 rounded text-sm" value={eventGender} onChange={(e) => setEventGender(e.target.value as Gender)}><option value="Mixed">混合</option><option value="M">男</option><option value="F">女</option></select></div>{eventType === 'individual' && (<div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 block mb-1">每班人數</label><input type="number" min="1" max="10" className="w-full border p-2 rounded text-sm" value={maxParticipants} onChange={(e) => setMaxParticipants(parseInt(e.target.value))} /></div>)}<div className={eventType === 'individual' ? 'md:col-span-2' : 'md:col-span-3'}><label className="text-xs font-bold text-slate-400 block mb-1">積分 (逗號分隔)</label><input type="text" placeholder="7,5,4,3,2,1" className="w-full border p-2 rounded text-sm font-mono" value={newEventPoints} onChange={(e) => setNewEventPoints(e.target.value)} /></div><div className={eventType === 'individual' ? 'md:col-span-1' : 'md:col-span-2'}><button type="button" onClick={addEvent} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 flex items-center justify-center gap-1 text-sm font-bold shadow h-[38px] mt-[21px]">➕ 新增</button></div></div><div className="space-y-2 max-h-96 overflow-y-auto">{localConfig.events.map((event: any) => (<EventEditRow key={event.id} event={event} onUpdate={handleUpdateEvent} onRemove={removeEvent} />))}</div></div>
      
      <div className="bg-red-50 p-6 rounded-xl shadow border border-red-200 mt-8">
        <h3 className="text-xl font-bold mb-2 text-red-700">⚠️ 危險操作區</h3>
        <p className="text-sm text-red-600 mb-4">這裡的操作將會永久刪除資料，請謹慎使用。新學年開始前，您可以使用此功能一鍵清空所有舊的比賽成績，但保留班級與項目設定。</p>
        <button onClick={handleClearAllResults} disabled={isSaving} className={`px-4 py-2 rounded font-bold transition w-full sm:w-auto ${confirmClearAll ? 'bg-red-600 text-white animate-pulse' : 'bg-white text-red-600 border border-red-300 hover:bg-red-100'}`}>{confirmClearAll ? '⚠️ 確定要清空所有成績嗎？(三秒內再次點擊)' : '🗑️ 一鍵清空所有成績'}</button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t flex justify-end max-w-5xl mx-auto z-10"><button type="button" onClick={updateConfig} disabled={isSaving} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-green-500 transition w-full md:w-auto flex items-center justify-center gap-2">{isSaving ? '儲存中...' : <>✅ 儲存所有設定</>}</button></div>
    </div>
  );
}

// --- 列印報表 Component ---
function PrintReport({ config, standings, getTop3 }: any) {
  return (
    <div className="hidden print:block w-full text-black bg-white">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">嘉新國中運動會 成績總表</h1>
        <p className="text-sm text-gray-500">列印時間：{new Date().toLocaleString()}</p>
      </div>
      <div className="mb-8">
        <h2 className="text-xl font-bold border-b-2 border-black mb-3 pb-1">📊 各年級總錦標排名</h2>
        <div className="grid grid-cols-3 gap-6">
          {[7, 8, 9].map(grade => {
            const gradeClasses = standings.sorted.filter((c: any) => c.grade === grade);
            return (
              <div key={grade}>
                <h3 className="font-bold mb-2 text-center text-lg">{grade} 年級</h3>
                <table className="w-full text-sm border-collapse border border-black">
                  <thead><tr className="bg-gray-100"><th className="border border-black p-1.5 text-center w-16">名次</th><th className="border border-black p-1.5 text-center">班級</th><th className="border border-black p-1.5 text-center">積分</th></tr></thead>
                  <tbody>{gradeClasses.map((c: any, idx: number) => (<tr key={c.id}><td className="border border-black p-1.5 text-center font-bold">{idx + 1}</td><td className="border border-black p-1.5 text-center">{c.name}</td><td className="border border-black p-1.5 text-center">{standings.classPoints[c.id]}</td></tr>))}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold border-b-2 border-black mb-3 pb-1">🏃 各項比賽得獎名單</h2>
        <table className="w-full text-sm border-collapse border border-black">
          <thead><tr className="bg-gray-100"><th className="border border-black p-2 text-left w-1/4">比賽項目</th><th className="border border-black p-2 w-1/4">七年級 前三名</th><th className="border border-black p-2 w-1/4">八年級 前三名</th><th className="border border-black p-2 w-1/4">九年級 前三名</th></tr></thead>
          <tbody>
            {config.events.map((event: any) => (
              <tr key={event.id} className="break-inside-avoid">
                <td className="border border-black p-2 font-bold align-top">{getEventDisplayName(event)}</td>
                {[7, 8, 9].map(grade => {
                  const top3 = getTop3(event.id, grade);
                  return (
                    <td key={grade} className="border border-black p-2 align-top">
                      {top3.length > 0 ? (<div className="space-y-1">{top3.map((item: any, idx: number) => (<div key={idx} className="flex items-start gap-1"><span className="font-bold min-w-[1.2rem]">{idx + 1}.</span><span><span className="font-bold">{item.class}</span>{item.record.studentName && <span className="text-xs ml-1">({item.record.studentName})</span>}<span className="ml-1 whitespace-nowrap">- {item.record.score}{event.unit}</span></span></div>))}</div>) : (<div className="text-gray-400 text-xs italic">尚無成績</div>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}