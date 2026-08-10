import { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- 1. Firebase 設定與初始化 ---
const localFirebaseConfig = {
  apiKey: 'AIzaSyA8N_mCRjfCtXB97OpIsiyVHds-bxOmUso',
  authDomain: 'jiashin-sports-day.firebaseapp.com',
  projectId: 'jiashin-sports-day',
  storageBucket: 'jiashin-sports-day.firebasestorage.app',
  messagingSenderId: '758992182792',
  appId: '1:758992182792:web:06fc7f9a00ad322a023bbd',
};

const envConfig = typeof window !== 'undefined' ? (window as any).__firebase_config : undefined;
const firebaseConfig = envConfig ? JSON.parse(envConfig) : localFirebaseConfig;

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
  registrationOpen: boolean;
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
  { id: 'evt_100m_m', name: '100m', type: 'individual', gender: 'M', unit: '秒', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 2 },
  { id: 'evt_100m_f', name: '100m', type: 'individual', gender: 'F', unit: '秒', sortBy: 'asc', rankPoints: [7, 5, 4, 3, 2, 1], maxParticipants: 2 },
];

// 智慧成績解析器：支援 1:23.45 或 1'23"45 格式轉換為秒數進行精準排名
const parseScore = (val: string | number | undefined | null) => {
  if (!val) return null;
  let str = String(val).trim();
  let sec = 0;
  if (str.includes(':')) {
    const parts = str.split(':');
    sec = parseInt(parts[0] || '0') * 60 + parseFloat(parts[1] || '0');
  } else if (str.includes("'")) {
    const parts = str.split("'");
    const min = parseInt(parts[0] || '0');
    let s = (parts[1] || '0').replace('"', '.');
    sec = min * 60 + parseFloat(s);
  } else {
    sec = parseFloat(str);
  }
  return isNaN(sec) ? null : sec;
};

const getEventDisplayName = (event: SportEvent) => {
  const genderLabel = event.gender === 'Mixed' ? '混合' : event.gender === 'M' ? '男' : '女';
  if (event.name.includes(genderLabel)) return event.name;
  return `${event.name} (${genderLabel})`;
};

const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isRecorderMode, setIsRecorderMode] = useState(false);
  const [loggedInClass, setLoggedInClass] = useState<string | null>(null);
  
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [results, setResults] = useState<ResultsData>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({}); 
  
  const [currentView, setCurrentView] = useState<'dashboard' | 'admin_input' | 'settings' | 'class_registration'>('dashboard');
  const [selectedGrade, setSelectedGrade] = useState<Grade | 'all'>(7);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTab, setLoginTab] = useState<'class' | 'admin'>('class');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedLoginClass, setSelectedLoginClass] = useState('701');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (isOfflineMode && !config) {
      setConfig({ classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS, registrationOpen: true });
    }
  }, [isOfflineMode, config]);

  useEffect(() => {
    if (!isFirebaseReady || !auth) {
      setIsOfflineMode(true);
      return;
    }

    const initAuth = async () => {
      try {
        const envToken = typeof window !== 'undefined' ? (window as any).__initial_auth_token : undefined;
        if (envToken) {
          await signInWithCustomToken(auth, envToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error: any) {
        console.warn("Auth blocked:", error);
        setIsOfflineMode(true);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isOfflineMode) return;
    if (!user || !db || !isFirebaseReady) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main');
    const resultsRef = doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main');
    const passwordsRef = doc(db, 'artifacts', appId, 'public', 'data', 'passwords', 'main');

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
            classes: data.classes || DEFAULT_CLASSES, 
            events: safeEvents,
            registrationOpen: data.registrationOpen !== false 
        });
      } else {
        const initialConfig = { classes: DEFAULT_CLASSES, events: DEFAULT_EVENTS, registrationOpen: true };
        setDoc(configRef, initialConfig).catch(() => setIsOfflineMode(true));
        setConfig(initialConfig);
      }
    }, () => setIsOfflineMode(true));

    const unsubResults = onSnapshot(resultsRef, (docSnap) => {
      if (docSnap.exists()) setResults(docSnap.data() as ResultsData);
      else setDoc(resultsRef, {}).catch(console.warn);
    });

    const unsubPasswords = onSnapshot(passwordsRef, (docSnap) => {
      if (docSnap.exists()) setPasswords(docSnap.data() as Record<string, string>);
      else setDoc(passwordsRef, {}).catch(console.warn);
    });

    return () => { unsubConfig(); unsubResults(); unsubPasswords(); };
  }, [user, isOfflineMode]);

  const handleLoginSubmit = () => {
    setLoginError('');
    if (loginTab === 'admin') {
      if (passwordInput === 'admin8888') { 
        setIsAdminMode(true);
        setIsRecorderMode(false);
        setLoggedInClass(null);
        setCurrentView('admin_input');
        setShowLoginModal(false);
        setPasswordInput('');
      } else if (passwordInput === 'admin123') {
        setIsAdminMode(false);
        setIsRecorderMode(true);
        setLoggedInClass(null);
        setCurrentView('admin_input');
        setShowLoginModal(false);
        setPasswordInput('');
      } else {
        setLoginError('大會密碼錯誤');
      }
    } else {
      const correctPw = passwords[selectedLoginClass] || '1234';
      if (passwordInput === correctPw || passwordInput === 'admin8888') {
        setLoggedInClass(selectedLoginClass);
        setIsAdminMode(false);
        setIsRecorderMode(false);
        setCurrentView('class_registration');
        setShowLoginModal(false);
        setPasswordInput('');
      } else {
        setLoginError('班級密碼錯誤');
      }
    }
  };

  if (!config) return <div className="flex h-screen items-center justify-center text-blue-500 font-bold animate-pulse">資料載入中...</div>;

  const isStaff = isAdminMode || isRecorderMode;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 print:bg-white print:pb-0">
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
            {isStaff ? (
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded hidden sm:inline ${isAdminMode ? 'bg-blue-700' : 'bg-teal-600'}`}>
                  {isAdminMode ? '管理員' : '紀錄員'}
                </span>
                <button onClick={() => setCurrentView('dashboard')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'dashboard' ? 'bg-blue-800' : ''}`} title="看板">🏆</button>
                <button onClick={() => setCurrentView('admin_input')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'admin_input' ? 'bg-blue-800' : ''}`} title="成績登錄">✏️</button>
                {isAdminMode && (
                  <button onClick={() => setCurrentView('settings')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'settings' ? 'bg-blue-800' : ''}`} title="設定">⚙️</button>
                )}
                <button onClick={() => { setIsAdminMode(false); setIsRecorderMode(false); setCurrentView('dashboard'); }} className="p-2 flex items-center justify-center rounded hover:bg-red-500 bg-red-600 ml-1 text-white" title="登出">
                  <LogoutIcon />
                </button>
              </div>
            ) : loggedInClass ? (
              <div className="flex items-center gap-2">
                <span className="text-sm bg-blue-700 px-3 py-1 rounded font-bold">{loggedInClass} 班</span>
                <button onClick={() => setCurrentView('dashboard')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'dashboard' ? 'bg-blue-800' : ''}`} title="看板">🏆</button>
                <button onClick={() => setCurrentView('class_registration')} className={`p-2 rounded hover:bg-blue-500 ${currentView === 'class_registration' ? 'bg-blue-800' : ''}`} title="選手報名">📝</button>
                <button onClick={() => { setLoggedInClass(null); setCurrentView('dashboard'); }} className="p-2 flex items-center justify-center rounded hover:bg-red-500 bg-red-600 ml-1 text-white" title="登出">
                  <LogoutIcon />
                </button>
              </div>
            ) : (
              <button onClick={() => { setShowLoginModal(true); setLoginError(''); setPasswordInput(''); }} className="text-sm bg-blue-700 hover:bg-blue-500 px-3 py-1.5 rounded flex items-center gap-1 font-bold">⚙️ 登入/報名</button>
            )}
          </div>
        </div>
      </header>

      {isOfflineMode && (
        <div className="bg-orange-100 text-orange-800 px-4 py-2 text-center text-xs font-bold border-b border-orange-200 print:hidden">
          ⚠️ 單機預覽模式 (預覽環境無法連線至資料庫，變更僅暫存)
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 print:hidden">
        {currentView === 'dashboard' && <Dashboard config={config} results={results} selectedGrade={selectedGrade} setSelectedGrade={setSelectedGrade} isStaff={isStaff} />}
        {currentView === 'admin_input' && isStaff && <AdminInput config={config} results={results} isOffline={isOfflineMode} setResults={setResults} />}
        {currentView === 'settings' && isAdminMode && <AdminSettings config={config} isOffline={isOfflineMode} setConfig={setConfig} setResults={setResults} />}
        {currentView === 'class_registration' && loggedInClass && <ClassRegistration config={config} results={results} isOffline={isOfflineMode} setResults={setResults} classId={loggedInClass} setPasswords={setPasswords} />}
      </main>

      {currentView === 'dashboard' && <PrintReport config={config} results={results} />}
      {currentView === 'settings' && <PrintRegistration config={config} results={results} />}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">系統登入</h3>
              <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-600">❌</button>
            </div>
            
            <div className="flex mb-4 bg-slate-100 p-1 rounded-lg">
              <button onClick={() => { setLoginTab('class'); setLoginError(''); setPasswordInput(''); }} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${loginTab === 'class' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>各班報名</button>
              <button onClick={() => { setLoginTab('admin'); setLoginError(''); setPasswordInput(''); }} className={`flex-1 py-2 text-sm font-bold rounded-md transition ${loginTab === 'admin' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>大會管理</button>
            </div>

            {loginError && <div className="bg-red-50 text-red-600 text-xs p-2 rounded mb-3 text-center font-bold">{loginError}</div>}

            {loginTab === 'class' && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">選擇班級</label>
                  <select className="w-full border p-2.5 rounded-lg font-bold" value={selectedLoginClass} onChange={e => setSelectedLoginClass(e.target.value)}>
                    {config.classes.map(c => <option key={c.id} value={c.id}>{c.name} 班</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">密碼</label>
                  <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="預設密碼 1234" className="w-full border p-2.5 rounded-lg" onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} />
                </div>
              </div>
            )}

            {loginTab === 'admin' && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">大會通行碼</label>
                  <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="輸入管理員或紀錄員密碼" className="w-full border p-2.5 rounded-lg" onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()} />
                </div>
              </div>
            )}

            <button onClick={handleLoginSubmit} className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">登入</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 各班專屬報名表組件 ---
function ClassRegistration({ config, results, isOffline, setResults, classId, setPasswords }: any) {
  const [localData, setLocalData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  
  const [showPwModal, setShowPwModal] = useState(false);
  const [newPw, setNewPw] = useState('');

  const individualEvents = config.events.filter((e: any) => e.type === 'individual');

  useEffect(() => {
    const initData: any = {};
    individualEvents.forEach((ev: any) => {
      const existingEntries = results[ev.id]?.[classId] || [];
      const entries = [];
      for (let i = 0; i < ev.maxParticipants; i++) {
        entries.push({ studentName: existingEntries[i]?.studentName || '', score: existingEntries[i]?.score || '' });
      }
      initData[ev.id] = entries;
    });
    setLocalData(initData);
  }, [config, results, classId, individualEvents]);

  const handleChange = (eventId: string, idx: number, val: string) => {
    setLocalData((prev: any) => {
      const copy = [...prev[eventId]];
      copy[idx] = { ...copy[idx], studentName: val };
      return { ...prev, [eventId]: copy };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      if (isOffline) {
        const nextResults = { ...results };
        Object.keys(localData).forEach(eventId => {
          if (!nextResults[eventId]) nextResults[eventId] = {};
          nextResults[eventId][classId] = localData[eventId];
        });
        setResults(nextResults);
        setMsg('✅ 已暫存 (預覽模式)');
      } else {
        // 深層合併更新：解決只用點語法在某些空文件會寫入失敗的 Bug
        const payload: any = {};
        Object.keys(localData).forEach(eventId => {
          payload[eventId] = { [classId]: localData[eventId] };
        });
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), payload, { merge: true });
        setMsg('✅ 報名資料儲存成功！');
      }
    } catch (e) {
      setMsg('❌ 儲存失敗，請檢查網路');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleUpdatePassword = async () => {
    if (newPw.length < 4) return alert('密碼至少需要 4 碼');
    try {
      if (isOffline) {
        setPasswords((prev: any) => ({ ...prev, [classId]: newPw }));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'passwords', 'main'), { [classId]: newPw }, { merge: true });
      }
      alert('密碼修改成功！下次請使用新密碼登入。');
      setShowPwModal(false);
      setNewPw('');
    } catch (e) {
      alert('密碼修改失敗');
    }
  };

  if (!config.registrationOpen) {
    return (
      <div className="bg-white rounded-xl shadow p-10 text-center max-w-2xl mx-auto mt-10">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-slate-700 mb-2">線上報名已截止</h2>
        <p className="text-slate-500">目前已停止開放各班修改名單。<br/>若需調整，請聯繫體育組或大會人員。</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-3xl mx-auto mt-4">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><span className="text-blue-600">📝</span> {classId} 班 選手報名表</h2>
          <p className="text-xs text-slate-500 mt-1">請填寫各項個人賽參賽選手姓名，完成後點擊最下方儲存。</p>
        </div>
        <button onClick={() => setShowPwModal(true)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold transition flex items-center gap-1">🔒 修改密碼</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {individualEvents.map((ev: any) => (
          <div key={ev.id} className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b flex justify-between items-center">
              <span className="font-bold text-slate-700">{getEventDisplayName(ev)}</span>
              <span className="text-xs bg-white border px-2 py-0.5 rounded text-slate-500">共 {ev.maxParticipants} 人</span>
            </div>
            <div className="p-3 space-y-2 bg-white">
              {localData[ev.id]?.map((entry: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}.</span>
                  <input type="text" placeholder="請輸入姓名" className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-400 outline-none" value={entry.studentName} onChange={e => handleChange(ev.id, idx, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-500 disabled:opacity-50 shadow-lg text-lg transition">{saving ? '儲存中...' : '💾 儲存報名名單'}</button>
        {msg && <span className="font-bold text-sm text-slate-600">{msg}</span>}
      </div>

      {showPwModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-2">修改 {classId} 班報名密碼</h3>
            <p className="text-xs text-slate-500 mb-4">預設為 1234。修改後請務必記住新密碼。</p>
            <input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="請輸入新密碼 (至少4碼)" className="w-full border p-3 rounded-lg mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowPwModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold">取消</button>
              <button onClick={handleUpdatePassword} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold">確認修改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Dashboard ---
function Dashboard({ config, results, selectedGrade, setSelectedGrade, isStaff }: any) {
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
          return entries.filter((e: any) => e.score && parseScore(e.score) !== null).map((e: any) => ({ classId: c.id, val: parseScore(e.score) }));
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
      entries.forEach((e: any) => { if (e.score && parseScore(e.score) !== null) all.push({ class: c.name, record: e, val: parseScore(e.score) }); });
    });
    return all.sort((a, b) => event.sortBy === 'asc' ? a.val - b.val : b.val - a.val).slice(0, 3);
  };

  return (
    <div className="space-y-6">
      {isStaff && !selectedEventId && (
        <div className="flex justify-end mb-4">
          <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-slate-700 flex items-center gap-2">
            🖨️ 列印全部成績總表
          </button>
        </div>
      )}
      {!selectedEventId && (
        <>
          {isStaff && (
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl shadow-lg p-5 text-white relative overflow-hidden mb-6">
              <div className="font-bold flex items-center gap-2">👑 全校總冠軍 (僅大會人員可見)</div>
              <div className="text-5xl font-extrabold mt-2">{standings.schoolChamp?.name || '-'}</div>
              <div className="mt-1 font-bold opacity-90">積分: {standings.classPoints[standings.schoolChamp?.id || ''] || 0}</div>
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
    if (entries.length === 0) return [{ class: c, score: '', student: '', val: null }];
    return entries.map((e: any) => ({ class: c, score: e.score, student: e.studentName, val: parseScore(e.score) }));
  });

  rows.sort((a: any, b: any) => {
    if (a.val === null && b.val === null) return a.class.id.localeCompare(b.class.id);
    if (a.val === null) return 1;
    if (b.val === null) return -1;
    return event.sortBy === 'asc' ? a.val - b.val : b.val - a.val;
  });

  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-slate-500 font-bold"><tr><th className="p-4 w-16 text-center">排名</th><th className="p-4">班級</th>{event.type === 'individual' && <th className="p-4">姓名</th>}<th className="p-4 text-right">成績</th><th className="p-4 text-right">積分</th></tr></thead>
      <tbody className="divide-y">{rows.map((row: any, idx: number) => {
        const hasScore = row.val !== null;
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
  const [msg, setMsg] = useState('');

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
    if (isOffline) {
        setResults((prev: any) => ({ ...prev, [selectedEventId]: localScores }));
        setMsg('已暫存 (預覽模式)');
    } else {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), { [selectedEventId]: localScores }, { merge: true });
            setMsg('成績儲存成功！');
        } catch (e) { 
            setMsg('儲存失敗，請檢查網路'); 
        }
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const targets = config.classes.filter((c: any) => c.grade === selectedGrade);

  return (
    <div className="bg-white rounded-xl shadow p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><span className="text-blue-600">✏️</span> 成績登錄</h2>
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
        <div className="flex text-xs text-slate-400 font-bold px-2"><div className="w-16">班級</div>{selectedEvent?.type === 'individual' && <div className="w-24 mr-2">姓名 (報名)</div>}<div className="flex-1">輸入{selectedEvent?.unit}</div></div>
        {targets.map((c: any) => (
          <div key={c.id} className="border border-slate-100 p-2 rounded-lg bg-slate-50/50">
            {localScores[c.id]?.map((entry: any, idx: number) => (
              <div key={idx} className="flex gap-2 mb-2 last:mb-0 items-center">
                <div className="font-bold w-16 text-lg text-slate-700 flex items-center gap-1">{c.name} {selectedEvent?.maxParticipants > 1 && <span className="text-xs bg-white px-1 rounded border text-slate-400">#{idx+1}</span>}</div>
                {selectedEvent?.type === 'individual' && <input type="text" placeholder="無名單" className="border p-2 rounded w-24 text-sm bg-slate-100" value={entry.studentName} readOnly title="請由各班報名系統填寫" />}
                <input type="text" placeholder={selectedEvent?.type === 'group' ? '名次' : '成績 (如 1:23.45)'} className="border p-2 rounded flex-1 font-mono font-bold text-blue-600 text-lg" value={entry.score} onChange={e => handleChange(c.id, idx, 'score', e.target.value)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button onClick={handleSave} disabled={saving} className="flex-1 bg-green-600 text-white py-4 rounded-xl font-bold hover:bg-green-500 disabled:opacity-50 shadow-lg flex items-center justify-center gap-2">{saving ? '儲存中...' : <>💾 儲存變更</>}</button>
        {msg && <span className="font-bold text-sm text-slate-600 animate-fade-in">{msg}</span>}
      </div>
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState('');

  const parsePoints = (str: string) => str.split(/[,，]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));

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
    setLocalConfig((prev: any) => ({ ...prev, events: prev.events.filter((e: any) => e.id !== id) }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (isOffline) {
        setConfig(localConfig);
        setMsg('✅ 已暫存設定');
    } else {
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main'), localConfig);
            setMsg('✅ 設定已儲存');
        } catch (e) { setMsg('❌ 儲存失敗'); }
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleClearAllResults = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    try {
      if (isOffline) {
        setResults({});
        alert('已清空');
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), {});
        alert('成績已全部清空！');
      }
      setConfirmClear(false);
    } catch (e) {
      alert('清空失敗');
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">📝 開放各班線上報名</h3>
          <p className="text-sm text-slate-500">報名截止後請關閉，各班將無法再修改選手名單。</p>
        </div>
        <button onClick={() => setLocalConfig((p:any) => ({...p, registrationOpen: !p.registrationOpen}))} className={`w-14 h-8 rounded-full transition-colors relative ${localConfig.registrationOpen ? 'bg-green-500' : 'bg-slate-300'}`}>
           <div className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${localConfig.registrationOpen ? 'translate-x-6' : ''}`}></div>
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">🖨️ 匯出全校報名名單</h3>
          <p className="text-sm text-slate-500">列印各年級「個人賽」報名表，方便張貼公告與檢錄。</p>
        </div>
        <button onClick={() => window.print()} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-slate-700">
          預覽與列印
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><span className="text-yellow-500">🏆</span> 比賽項目管理</h3>
        <div className="grid grid-cols-12 gap-2 mb-6 p-4 border border-dashed rounded-lg bg-slate-50 items-end">
          <div className="col-span-12 md:col-span-3">
            <label className="text-xs font-bold text-slate-400 block mb-1">名稱</label>
            <input type="text" className="w-full border p-2 rounded" value={newName} onChange={e => setNewName(e.target.value)} placeholder="項目名稱" />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs font-bold text-slate-400 block mb-1">類型</label>
            <select className="w-full border p-2 rounded" value={newType} onChange={e => {
              const t = e.target.value as EventType;
              setNewType(t);
              setNewGender(t === 'group' ? 'Mixed' : 'M'); 
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
          <div className="col-span-12 md:col-span-3">
            <label className="text-xs font-bold text-slate-400 block mb-1">積分設定 (逗號分隔)</label>
            <input type="text" className="w-full border p-2 rounded" value={newPoints} onChange={e => setNewPoints(e.target.value)} placeholder="7,5,4,3,2,1" />
          </div>
          <div className="col-span-12 flex items-end">
            <button onClick={handleAdd} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 flex items-center justify-center gap-1">➕ 新增</button>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {localConfig.events.map((e: any) => (
            <div key={e.id} className="flex gap-2 items-center border p-2 rounded bg-white">
              <span className={`text-xs px-2 py-1 rounded ${e.type === 'group' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{e.type === 'group' ? '團體' : '個人'}</span>
              <span className="font-bold flex-1">{getEventDisplayName(e)} {e.type === 'individual' && <span className="ml-2 text-xs font-normal text-slate-500 border border-slate-200 px-1 rounded bg-slate-50">每班 {e.maxParticipants} 人</span>}</span>
              <button onClick={() => removeEvent(e.id)} className="text-red-500 px-2 hover:bg-red-50 rounded">🗑️</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 p-6 rounded-xl shadow-sm">
        <h3 className="font-bold text-red-600 mb-2">⚠️ 危險操作區</h3>
        <p className="text-sm text-red-500 mb-4">這將會清空「所有」已經登錄的成績與各班報名名單，供下一次運動會重新開始使用。此操作無法復原。</p>
        <button onClick={handleClearAllResults} className={`w-full py-3 rounded-lg font-bold border-2 transition ${confirmClear ? 'bg-red-600 text-white border-red-600 animate-pulse' : 'text-red-500 border-red-200 hover:bg-red-100'}`}>
          {confirmClear ? '⚠️ 確定要清空嗎？(再次點擊執行)' : '🗑️ 一鍵清空所有成績與報名資料'}
        </button>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t flex justify-end z-10 print:hidden">
        <div className="max-w-5xl w-full mx-auto flex justify-end items-center gap-4">
          {msg && <span className="font-bold text-slate-600 animate-fade-in">{msg}</span>}
          <button onClick={handleSave} disabled={saving} className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-500 shadow-lg">{saving ? '儲存中...' : '✅ 儲存所有設定'}</button>
        </div>
      </div>
    </div>
  );
}

function PrintReport({ config, results }: any) {
  if (!config) return null;

  const classPoints: Record<string, number> = {};
  config.classes.forEach((c: ClassInfo) => (classPoints[c.id] = 0));
  
  config.events.forEach((event: SportEvent) => {
    const eventResults = results[event.id] || {};
    [7, 8, 9].forEach((g) => {
      const gradeClasses = config.classes.filter((c: ClassInfo) => c.grade === g);
      let all = gradeClasses.flatMap((c: ClassInfo) => {
        const entries = eventResults[c.id] || [];
        return entries.filter((e: any) => e.score && parseScore(e.score) !== null).map((e: any) => ({ classId: c.id, val: parseScore(e.score) }));
      });
      all.sort((a: any, b: any) => event.sortBy === 'asc' ? a.val - b.val : b.val - a.val);
      all.forEach((item: any, idx: number) => {
        if (idx < (event.rankPoints || DEFAULT_POINTS).length) classPoints[item.classId] += (event.rankPoints || DEFAULT_POINTS)[idx];
      });
    });
  });

  const getSortedClasses = (grade: number) => {
    return config.classes
      .filter((c: any) => c.grade === grade)
      .sort((a: any, b: any) => classPoints[b.id] - classPoints[a.id]);
  };

  const getTop3ForPrint = (eventId: string, grade: number) => {
    const event = config.events.find((e: any) => e.id === eventId);
    if (!event) return [];
    const eventResults = results[eventId] || {};
    const gradeClasses = config.classes.filter((c: any) => c.grade === grade);
    let all: any[] = [];
    gradeClasses.forEach((c: any) => {
      const entries = eventResults[c.id] || [];
      entries.forEach((e: any) => { if (e.score && parseScore(e.score) !== null) all.push({ class: c.name, record: e, val: parseScore(e.score) }); });
    });
    return all.sort((a, b) => event.sortBy === 'asc' ? a.val - b.val : b.val - a.val).slice(0, 3);
  };

  return (
    <div className="hidden print:block p-8 bg-white text-black">
      <h1 className="text-3xl font-bold text-center mb-6">嘉新國中運動會 成績總表</h1>
      
      <h2 className="text-xl font-bold border-b-2 border-black pb-2 mb-4">🏆 總錦標積分排名</h2>
      <div className="grid grid-cols-3 gap-6 mb-8">
        {[7, 8, 9].map(grade => {
          const sorted = getSortedClasses(grade);
          return (
            <div key={grade}>
              <h3 className="font-bold text-lg bg-gray-100 p-2 text-center border">{grade} 年級</h3>
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-50"><th className="border p-1">名次</th><th className="border p-1">班級</th><th className="border p-1">積分</th></tr>
                </thead>
                <tbody>
                  {sorted.map((c: any, idx: number) => (
                    <tr key={c.id}>
                      <td className="border p-1 text-center">{idx + 1}</td>
                      <td className="border p-1 text-center font-bold">{c.name}</td>
                      <td className="border p-1 text-center">{classPoints[c.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <h2 className="text-xl font-bold border-b-2 border-black pb-2 mb-4 break-before-page">🏃 各項比賽得獎名單</h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {config.events.map((event: any) => (
          <div key={event.id} className="border p-3 rounded mb-2 break-inside-avoid">
            <h3 className="font-bold text-md mb-2">{getEventDisplayName(event)}</h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left border-b bg-gray-50">
                  <th className="p-1">年級</th><th className="p-1">第一名</th><th className="p-1">第二名</th><th className="p-1">第三名</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[7, 8, 9].map(grade => {
                  const top3 = getTop3ForPrint(event.id, grade);
                  return (
                    <tr key={grade}>
                      <td className="p-1 font-bold">{grade}年級</td>
                      {[0, 1, 2].map(i => {
                        const item = top3[i];
                        return (
                          <td key={i} className="p-1">
                            {item ? (
                              <div>
                                <span className="font-bold">{item.class}</span>
                                {item.record.studentName && <span className="ml-1 text-gray-600">({item.record.studentName})</span>}
                              </div>
                            ) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintRegistration({ config, results }: any) {
  if (!config) return null;
  const individualEvents = config.events.filter((e: any) => e.type === 'individual');

  return (
    <div className="hidden print:block bg-white text-black">
      {[7, 8, 9].map((grade, index) => {
        const gradeClasses = config.classes.filter((c: any) => c.grade === grade);
        return (
          <div key={grade} className={`p-8 ${index > 0 ? 'break-before-page' : ''}`}>
            <h1 className="text-3xl font-bold text-center mb-8">嘉新國中運動會 - {grade} 年級 個人賽報名名單</h1>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              {individualEvents.map((event: any) => (
                <div key={event.id} className="border border-gray-400 p-3 rounded break-inside-avoid shadow-sm">
                  <h3 className="font-bold text-lg mb-2 bg-gray-100 p-1 text-center">{getEventDisplayName(event)}</h3>
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {gradeClasses.map((c: any) => {
                        const entries = results[event.id]?.[c.id] || [];
                        const names = entries.map((e: any) => e.studentName).filter(Boolean); 
                        const nameString = names.length > 0 ? names.join('、') : '';
                        
                        return (
                          <tr key={c.id} className="border-b border-gray-200 last:border-0">
                            <td className="p-1.5 font-bold w-16 text-center border-r bg-gray-50">{c.name}</td>
                            <td className="p-1.5 pl-3">{nameString}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}