import { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

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

// Global App ID for Firestore paths
const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'jiashin-sports-2024';

type Grade = 7 | 8 | 9;

interface ClassInfo {
  id: string;
  name: string;
  grade: Grade;
  students?: string[];
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

interface HeatAssignment {
  lane: string;
  classId: string;
  studentIdx: number;
  studentName?: string;
}

interface EventHeat {
  id: string;
  name: string;
  assignments: HeatAssignment[];
}

// Record<eventId, Record<grade, EventHeat[]>>
type HeatsData = Record<string, Record<number, EventHeat[]>>;

interface AppConfig {
  classes: ClassInfo[];
  events: SportEvent[];
  registrationOpen: boolean;
  heats?: HeatsData;
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

// 智慧成績解析器
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
  const [printMode, setPrintMode] = useState<'results' | 'registration' | 'heats'>('results');

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginTab, setLoginTab] = useState<'class' | 'admin'>('class');
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedLoginClass, setSelectedLoginClass] = useState('701');
  const [loginError, setLoginError] = useState('');

  // Fallback for offline mode
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

    // Strict paths enforced here
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
    }, (err) => console.warn("Results listener error:", err));

    const unsubPasswords = onSnapshot(passwordsRef, (docSnap) => {
      if (docSnap.exists()) setPasswords(docSnap.data() as Record<string, string>);
      else setDoc(passwordsRef, {}).catch(console.warn);
    }, (err) => console.warn("Passwords listener error:", err));

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
          ⚠️ 單機預覽模式 (無法連線至資料庫，變更僅暫存)
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 print:hidden">
        {currentView === 'dashboard' && <Dashboard config={config} results={results} selectedGrade={selectedGrade} setSelectedGrade={setSelectedGrade} isStaff={isStaff} setPrintMode={setPrintMode} />}
        {currentView === 'admin_input' && isStaff && <AdminInput config={config} results={results} isOffline={isOfflineMode} setResults={setResults} appId={appId} db={db} />}
        {currentView === 'settings' && isAdminMode && <AdminSettings config={config} results={results} passwords={passwords} isOffline={isOfflineMode} setConfig={setConfig} setResults={setResults} setPasswords={setPasswords} appId={appId} db={db} setPrintMode={setPrintMode} />}
        {currentView === 'class_registration' && loggedInClass && <ClassRegistration config={config} results={results} isOffline={isOfflineMode} setResults={setResults} classId={loggedInClass} setPasswords={setPasswords} appId={appId} db={db} />}
      </main>

      {currentView === 'dashboard' && <PrintReport config={config} results={results} />}
      {currentView === 'settings' && printMode === 'registration' && <PrintRegistration config={config} results={results} />}
      {currentView === 'settings' && printMode === 'heats' && <PrintHeats config={config} results={results} />}

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

function ClassRegistration({ config, results, isOffline, setResults, classId, setPasswords, appId, db }: any) {
  const [localData, setLocalData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  
  const [showPwModal, setShowPwModal] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [pwStatusMsg, setPwStatusMsg] = useState('');

  const classInfo = config.classes.find((c: any) => c.id === classId);
  const studentOptions = classInfo?.students || [];

  // Ensures data is only populated once per classId change to prevent overwriting during input
  useEffect(() => {
    const initData: any = {};
    const individualEvents = config.events.filter((e: any) => e.type === 'individual');
    
    individualEvents.forEach((ev: any) => {
      const existingEntries = results[ev.id]?.[classId] || [];
      const entries = [];
      for (let i = 0; i < ev.maxParticipants; i++) {
        entries.push({ studentName: existingEntries[i]?.studentName || '', score: existingEntries[i]?.score || '' });
      }
      initData[ev.id] = entries;
    });
    setLocalData(initData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]); 

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
    if (newPw.length < 4) {
      setPwStatusMsg('密碼至少需要 4 碼');
      return;
    }
    try {
      if (isOffline) {
        setPasswords((prev: any) => ({ ...prev, [classId]: newPw }));
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'passwords', 'main'), { [classId]: newPw }, { merge: true });
      }
      setPwStatusMsg('修改成功！請記得新密碼。');
      setTimeout(() => {
        setShowPwModal(false);
        setNewPw('');
        setPwStatusMsg('');
      }, 2000);
    } catch (e) {
      setPwStatusMsg('修改失敗，請稍後再試');
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
        {config.events.filter((e: any) => e.type === 'individual').map((ev: any) => (
          <div key={ev.id} className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b flex justify-between items-center">
              <span className="font-bold text-slate-700">{getEventDisplayName(ev)}</span>
              <span className="text-xs bg-white border px-2 py-0.5 rounded text-slate-500">共 {ev.maxParticipants} 人</span>
            </div>
            <div className="p-3 space-y-2 bg-white">
              {localData[ev.id]?.map((entry: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}.</span>
                  {studentOptions.length > 0 ? (
                    <select
                      className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white"
                      value={entry.studentName || ''}
                      onChange={e => handleChange(ev.id, idx, e.target.value)}
                    >
                      <option value="">-- 請選擇參賽選手 --</option>
                      {studentOptions.map((name: string, i: number) => (
                        <option key={i} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" placeholder="請輸入姓名" className="flex-1 border p-2 rounded text-sm focus:ring-2 focus:ring-blue-400 outline-none" value={entry.studentName || ''} onChange={e => handleChange(ev.id, idx, e.target.value)} />
                  )}
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
            {pwStatusMsg && <div className={`text-xs p-2 rounded mb-3 font-bold ${pwStatusMsg.includes('成功') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{pwStatusMsg}</div>}
            <input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="請輸入新密碼 (至少4碼)" className="w-full border p-3 rounded-lg mb-4" />
            <div className="flex gap-2">
              <button onClick={() => { setShowPwModal(false); setPwStatusMsg(''); }} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200 transition">取消</button>
              <button onClick={handleUpdatePassword} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition">確認修改</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ config, results, selectedGrade, setSelectedGrade, isStaff, setPrintMode }: any) {
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
          <button onClick={() => { setPrintMode?.('results'); setTimeout(() => window.print(), 100); }} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-slate-700 flex items-center gap-2">
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
    if (entries.length === 0) return [{ class: c, score: '', student: '', val: null, idx: 0 }];
    return entries.map((e: any, idx: number) => ({ class: c, score: e.score, student: e.studentName, val: parseScore(e.score), idx }));
  });

  // 排序核心邏輯，自動判定是 asc (秒數小者贏) 或是 desc (距離大者贏)
  rows.sort((a: any, b: any) => {
    if (a.val === null && b.val === null) return a.class.id.localeCompare(b.class.id);
    if (a.val === null) return 1;
    if (b.val === null) return -1;
    return event.sortBy === 'asc' ? a.val - b.val : b.val - a.val;
  });

  // 輔助查找組別與道次
  const getParticipantHeatInfo = (classId: string, grade: number, idx: number) => {
    const eventHeats = config.heats?.[eventId]?.[grade] || [];
    for (const h of eventHeats) {
      const found = h.assignments.find((a: any) => a.classId === classId && (event.type === 'group' || a.studentIdx === idx));
      if (found) {
        return `${h.name}${found.lane ? ` (${found.lane})` : ''}`;
      }
    }
    return null;
  };

  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-slate-500 font-bold">
        <tr>
          <th className="p-4 w-16 text-center">排名</th>
          <th className="p-4">班級</th>
          {event.type === 'individual' && <th className="p-4">姓名</th>}
          <th className="p-4">組別/道次</th>
          <th className="p-4 text-right">成績</th>
          <th className="p-4 text-right">積分</th>
        </tr>
      </thead>
      <tbody className="divide-y">{rows.map((row: any, idx: number) => {
        const hasScore = row.val !== null;
        const pts = hasScore && idx < (event.rankPoints || DEFAULT_POINTS).length ? (event.rankPoints || DEFAULT_POINTS)[idx] : 0;
        const heatBadge = getParticipantHeatInfo(row.class.id, row.class.grade, row.idx);
        return (
          <tr key={`${row.class.id}-${row.idx}-${idx}`} className={hasScore && idx < 3 ? 'bg-yellow-50/30' : ''}>
            <td className="p-4 text-center font-bold text-slate-400">
                {hasScore && idx === 0 && '🥇'}
                {hasScore && idx === 1 && '🥈'}
                {hasScore && idx === 2 && '🥉'}
                {(!hasScore || idx > 2) && (hasScore ? idx + 1 : '-')}
            </td>
            <td className="p-4 font-bold text-lg">{row.class.name}</td>
            {event.type === 'individual' && <td className="p-4 text-slate-600">{row.student || '-'}</td>}
            <td className="p-4 text-xs text-slate-500">{heatBadge ? <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold">{heatBadge}</span> : '-'}</td>
            <td className="p-4 text-right font-mono font-bold text-blue-600 text-lg">{row.score || '-'}</td>
            <td className="p-4 text-right font-mono text-slate-500">{hasScore ? `+${pts}` : '-'}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function AdminInput({ config, results, isOffline, setResults, appId, db }: any) {
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
                <input type="text" placeholder={selectedEvent?.type === 'group' ? '名次' : '成績 (如 1:23.45 或 5.6)'} className="border p-2 rounded flex-1 font-mono font-bold text-blue-600 text-lg" value={entry.score} onChange={e => handleChange(c.id, idx, 'score', e.target.value)} />
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

function AdminSettings({ config, results, passwords, isOffline, setConfig, setResults, setPasswords, appId, db, setPrintMode }: any) {
  const [localConfig, setLocalConfig] = useState(() => {
    const copy = JSON.parse(JSON.stringify(config));
    if (!copy.heats) copy.heats = {};
    return copy;
  });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  const [newName, setNewName] = useState('');
  const [newPoints, setNewPoints] = useState('7,5,4,3,2,1');
  const [newType, setNewType] = useState<EventType>('group');
  const [newGender, setNewGender] = useState<Gender>('Mixed');
  const [newMax, setNewMax] = useState(1);
  const [newSortRule, setNewSortRule] = useState('名次_asc');
  
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [msg, setMsg] = useState('');
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);

  // 分組與賽程編排專用狀態
  const [heatEventId, setHeatEventId] = useState<string>(config.events[0]?.id || '');
  const [heatGrade, setHeatGrade] = useState<Grade>(7);
  const [autoAssignLanesCount, setAutoAssignLanesCount] = useState<number>(6);

  const parsePoints = (str: string) => str.split(/[,，]/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));

  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState<Grade>(7);
  const [classToDelete, setClassToDelete] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // 取得目前選擇項目與年級的分組列表
  const selectedHeatEvent = localConfig.events.find((e: SportEvent) => e.id === heatEventId);
  const currentGradeHeats: EventHeat[] = localConfig.heats?.[heatEventId]?.[heatGrade] || [];

  const updateCurrentHeats = (newHeats: EventHeat[]) => {
    setLocalConfig((prev: any) => ({
      ...prev,
      heats: {
        ...(prev.heats || {}),
        [heatEventId]: {
          ...(prev.heats?.[heatEventId] || {}),
          [heatGrade]: newHeats,
        },
      },
    }));
  };

  // 取得該年級在該項目所有可排入的選手或班級名單
  const availableParticipants = useMemo(() => {
    if (!selectedHeatEvent) return [];
    const gradeClasses = localConfig.classes.filter((c: ClassInfo) => c.grade === heatGrade);
    const list: { key: string; classId: string; className: string; studentIdx: number; studentName: string; label: string }[] = [];

    if (selectedHeatEvent.type === 'group') {
      gradeClasses.forEach((c: ClassInfo) => {
        list.push({
          key: `${c.id}_0`,
          classId: c.id,
          className: c.name,
          studentIdx: 0,
          studentName: `${c.name} 班`,
          label: `${c.name} 班`,
        });
      });
    } else {
      gradeClasses.forEach((c: ClassInfo) => {
        const entries = results[heatEventId]?.[c.id] || [];
        const max = selectedHeatEvent.maxParticipants || 1;
        for (let i = 0; i < max; i++) {
          const sName = entries[i]?.studentName?.trim() || '';
          list.push({
            key: `${c.id}_${i}`,
            classId: c.id,
            className: c.name,
            studentIdx: i,
            studentName: sName,
            label: sName ? `${c.name} 班 - ${sName}` : `${c.name} 班 (#${i + 1} 未填姓名)`,
          });
        }
      });
    }
    return list;
  }, [selectedHeatEvent, localConfig.classes, heatGrade, results, heatEventId]);

  const handleAddHeat = () => {
    if (!selectedHeatEvent) return;
    const nextIdx = currentGradeHeats.length + 1;
    const isGroup = selectedHeatEvent.type === 'group';
    const defaultName = isGroup ? `第 ${nextIdx} 場次 (第一輪)` : `第 ${nextIdx} 組`;
    const defaultAssignments: HeatAssignment[] = isGroup
      ? [
          { lane: '甲方 (左/紅)', classId: '', studentIdx: 0 },
          { lane: '乙方 (右/藍)', classId: '', studentIdx: 0 },
        ]
      : [
          { lane: '第 1 道', classId: '', studentIdx: 0 },
          { lane: '第 2 道', classId: '', studentIdx: 0 },
          { lane: '第 3 道', classId: '', studentIdx: 0 },
          { lane: '第 4 道', classId: '', studentIdx: 0 },
        ];

    updateCurrentHeats([
      ...currentGradeHeats,
      {
        id: `heat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: defaultName,
        assignments: defaultAssignments,
      },
    ]);
  };

  const handleRemoveHeat = (heatId: string) => {
    updateCurrentHeats(currentGradeHeats.filter((h) => h.id !== heatId));
  };

  const handleHeatNameChange = (heatId: string, newNameVal: string) => {
    updateCurrentHeats(
      currentGradeHeats.map((h) => (h.id === heatId ? { ...h, name: newNameVal } : h))
    );
  };

  const handleAddAssignmentSlot = (heatId: string) => {
    const isGroup = selectedHeatEvent?.type === 'group';
    updateCurrentHeats(
      currentGradeHeats.map((h) => {
        if (h.id !== heatId) return h;
        const nextNum = h.assignments.length + 1;
        const defaultLane = isGroup ? `隊伍 ${nextNum}` : `第 ${nextNum} 道`;
        return {
          ...h,
          assignments: [...h.assignments, { lane: defaultLane, classId: '', studentIdx: 0 }],
        };
      })
    );
  };

  const handleRemoveAssignmentSlot = (heatId: string, slotIdx: number) => {
    updateCurrentHeats(
      currentGradeHeats.map((h) => {
        if (h.id !== heatId) return h;
        return {
          ...h,
          assignments: h.assignments.filter((_, idx) => idx !== slotIdx),
        };
      })
    );
  };

  const handleAssignmentChange = (heatId: string, slotIdx: number, field: 'lane' | 'participantKey', val: string) => {
    updateCurrentHeats(
      currentGradeHeats.map((h) => {
        if (h.id !== heatId) return h;
        const nextAssign = [...h.assignments];
        if (field === 'lane') {
          nextAssign[slotIdx] = { ...nextAssign[slotIdx], lane: val };
        } else {
          if (!val) {
            nextAssign[slotIdx] = { ...nextAssign[slotIdx], classId: '', studentIdx: 0, studentName: '' };
          } else {
            const [cId, sIdxStr] = val.split('_');
            const sIdx = parseInt(sIdxStr || '0', 10);
            const foundP = availableParticipants.find((p) => p.key === val);
            nextAssign[slotIdx] = {
              ...nextAssign[slotIdx],
              classId: cId,
              studentIdx: sIdx,
              studentName: foundP?.studentName || '',
            };
          }
        }
        return { ...h, assignments: nextAssign };
      })
    );
  };

  const handleAutoGenerateHeats = () => {
    if (!selectedHeatEvent) return;
    const isGroup = selectedHeatEvent.type === 'group';

    // 篩選出有效名單 (個人賽優先挑有填寫名字的選手，若都沒填則用全部名額)
    let pool = [...availableParticipants];
    if (!isGroup) {
      const namedPool = pool.filter((p) => p.studentName !== '');
      if (namedPool.length > 0) {
        pool = namedPool;
      }
    }

    if (pool.length === 0) {
      setMsg('⚠️ 目前該年級無可編排的班級或選手');
      setTimeout(() => setMsg(''), 2500);
      return;
    }

    // 隨機洗牌
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const perHeat = isGroup ? 2 : Math.max(1, autoAssignLanesCount || 6);
    const newHeats: EventHeat[] = [];
    let heatCounter = 1;

    for (let i = 0; i < pool.length; i += perHeat) {
      const chunk = pool.slice(i, i + perHeat);
      const assignments: HeatAssignment[] = chunk.map((p, idx) => ({
        lane: isGroup ? (idx === 0 ? '甲方 (左/紅)' : idx === 1 ? '乙方 (右/藍)' : `隊伍 ${idx + 1}`) : `第 ${idx + 1} 道`,
        classId: p.classId,
        studentIdx: p.studentIdx,
        studentName: p.studentName,
      }));

      // 若是團體對戰且遇到單數輪空，補上一個輪空位置方便檢視
      if (isGroup && assignments.length === 1) {
        assignments.push({
          lane: '乙方 (輪空/種子)',
          classId: '',
          studentIdx: 0,
          studentName: '輪空',
        });
      }

      newHeats.push({
        id: `heat_${Date.now()}_${heatCounter}`,
        name: isGroup ? `第 ${heatCounter} 場次 (第一輪)` : `第 ${heatCounter} 組`,
        assignments,
      });
      heatCounter++;
    }

    updateCurrentHeats(newHeats);
    setMsg('🎲 已自動隨機完成分組編排！(請記得點擊最下方儲存設定)');
    setTimeout(() => setMsg(''), 3500);
  };

  const handleAddClass = () => {
    if (!newClassName.trim()) {
      setMsg('請輸入班級名稱');
      setTimeout(() => setMsg(''), 2000);
      return;
    }
    
    // Check if class ID already exists to prevent duplicates
    if (localConfig.classes.some((c: any) => c.id === newClassName.trim())) {
      setMsg('班級名稱已存在');
      setTimeout(() => setMsg(''), 2000);
      return;
    }

    setLocalConfig((prev: any) => ({
      ...prev,
      classes: [...prev.classes, { id: newClassName.trim(), name: newClassName.trim(), grade: newClassGrade }].sort((a, b) => a.id.localeCompare(b.id))
    }));
    setNewClassName('');
    setMsg('班級已加入 (尚未儲存)');
    setTimeout(() => setMsg(''), 2000);
  };

  const confirmRemoveClass = (id: string) => {
    setClassToDelete(id);
  };

  const executeRemoveClass = () => {
    if (!classToDelete) return;
    setLocalConfig((prev: any) => ({
      ...prev,
      classes: prev.classes.filter((c: any) => c.id !== classToDelete)
    }));
    setClassToDelete(null);
    setMsg('班級已移除 (尚未儲存)');
    setTimeout(() => setMsg(''), 2000);
  };

  const handleSaveEvent = () => {
    if (!newName) { setMsg('請輸入名稱'); setTimeout(()=>setMsg(''), 2000); return; }
    
    const parsedPoints = parsePoints(newPoints);
    if (parsedPoints.length === 0) { setMsg('請輸入有效的積分格式'); setTimeout(()=>setMsg(''), 2000); return; }

    const [unit, sortBy] = newSortRule.split('_');

    setLocalConfig((prev: any) => {
      if (editingEventId) {
        return {
          ...prev,
          events: prev.events.map((e: any) => 
            e.id === editingEventId 
              ? { ...e, name: newName, type: newType, gender: newGender, rankPoints: parsedPoints, maxParticipants: newType === 'individual' ? newMax : 1, unit, sortBy }
              : e
          )
        };
      } else {
        return {
          ...prev,
          events: [...prev.events, {
            id: `evt_${Date.now()}`,
            name: newName,
            type: newType,
            gender: newGender,
            unit,
            sortBy: sortBy as 'asc' | 'desc',
            rankPoints: parsedPoints,
            maxParticipants: newType === 'individual' ? newMax : 1
          }]
        };
      }
    });
    
    handleCancelEdit();
  };

  const handleEditEvent = (event: any) => {
    setEditingEventId(event.id);
    setNewName(event.name);
    setNewType(event.type);
    setNewGender(event.gender);
    setNewMax(event.maxParticipants || 1);
    setNewPoints(event.rankPoints ? event.rankPoints.join(', ') : '7,5,4,3,2,1');
    setNewSortRule(`${event.unit || '名次'}_${event.sortBy || 'asc'}`);
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setNewName('');
    setNewType('group');
    setNewGender('Mixed');
    setNewMax(1);
    setNewPoints('7,5,4,3,2,1');
    setNewSortRule('名次_asc');
  };

  const confirmRemoveEvent = (id: string) => {
    setEventToDelete(id);
  };

  const executeRemoveEvent = () => {
    if (!eventToDelete) return;
    setLocalConfig((prev: any) => ({ ...prev, events: prev.events.filter((e: any) => e.id !== eventToDelete) }));
    if(editingEventId === eventToDelete) handleCancelEdit();
    setEventToDelete(null);
  };

  const handleSave = async () => {
    setSaving(true);
    if (isOffline) {
        setConfig(localConfig);
        setMsg('✅ 已暫存設定 (預覽模式)');
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
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    try {
      if (isOffline) {
        setResults({});
        setMsg('已清空 (預覽模式)');
      } else {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), {});
        setMsg('成績已全部清空！');
      }
      setConfirmClear(false);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg('清空失敗');
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleExport = () => {
    const backup = { config, results, passwords };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sports_day_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.config && json.results) {
          if (isOffline) {
            setConfig(json.config);
            setResults(json.results);
            if (json.passwords) setPasswords(json.passwords);
            setLocalConfig(json.config);
            setMsg('✅ 已載入備份 (預覽模式)');
          } else {
            setSaving(true);
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main'), json.config);
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main'), json.results);
            if (json.passwords) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'passwords', 'main'), json.passwords);
            }
            setLocalConfig(json.config);
            setSaving(false);
            setMsg('✅ 備份還原成功！');
          }
        } else {
          setMsg('❌ 備份檔格式錯誤');
        }
      } catch (error) {
        setMsg('❌ 讀取檔案失敗');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const downloadCsvTemplate = () => {
    const BOM = "\uFEFF"; // 確保 Excel 開啟時能正常讀取 UTF-8
    const csvContent = BOM + "年級,班級,姓名\n7,701,王大明\n7,701,陳小華\n8,801,林美麗\n8,802,張大頭\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "學生名條匯入範本.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        setMsg('❌ 檔案格式錯誤或無資料');
        return;
      }
      const dataLines = lines.slice(1);
      const newClassesMap = new Map<string, ClassInfo>();
      
      dataLines.forEach(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length >= 3) {
          const grade = parseInt(cols[0]);
          const className = cols[1];
          const studentName = cols[2];
          
          if ([7, 8, 9].includes(grade) && className && studentName) {
            if (!newClassesMap.has(className)) {
              newClassesMap.set(className, { id: className, name: className, grade: grade as Grade, students: [] });
            }
            newClassesMap.get(className)!.students!.push(studentName);
          }
        }
      });

      if (newClassesMap.size > 0) {
        setLocalConfig((prev: any) => {
          const nextClasses = [...prev.classes];
          newClassesMap.forEach((newClass, className) => {
            const existingIdx = nextClasses.findIndex(c => c.id === className);
            if (existingIdx >= 0) {
              nextClasses[existingIdx] = { ...nextClasses[existingIdx], students: newClass.students, grade: newClass.grade };
            } else {
              nextClasses.push(newClass);
            }
          });
          return { ...prev, classes: nextClasses.sort((a,b) => a.id.localeCompare(b.id)) };
        });
        setMsg('✅ 名條匯入成功！(請點擊最下方儲存)');
        setTimeout(() => setMsg(''), 4000);
      } else {
        setMsg('❌ 找不到有效的資料行，請檢查範本格式');
        setTimeout(() => setMsg(''), 4000);
      }
      if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // 統計某選手/班級是否已被排入當前項目分組中
  const assignedKeysSet = useMemo(() => {
    const s = new Set<string>();
    currentGradeHeats.forEach((h) => {
      h.assignments.forEach((a) => {
        if (a.classId) s.add(`${a.classId}_${a.studentIdx}`);
      });
    });
    return s;
  }, [currentGradeHeats]);

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto relative">
      <div className="bg-white p-6 rounded-xl shadow flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">📝 開放各班線上報名</h3>
          <p className="text-sm text-slate-500">報名截止後請關閉，各班將無法再修改選手名單。</p>
        </div>
        <button onClick={() => setLocalConfig((p:any) => ({...p, registrationOpen: !p.registrationOpen}))} className={`w-14 h-8 rounded-full transition-colors relative ${localConfig.registrationOpen ? 'bg-green-500' : 'bg-slate-300'}`}>
           <div className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${localConfig.registrationOpen ? 'translate-x-6' : ''}`}></div>
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl shadow flex flex-col justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">🖨️ 匯出各班報名總表</h3>
            <p className="text-xs text-slate-500 mt-1">依班級列出「個人賽」所有報名選手名單，方便各班核對。</p>
          </div>
          <button onClick={() => { setPrintMode('registration'); setTimeout(() => window.print(), 100); }} className="bg-slate-800 text-white px-4 py-2.5 rounded-lg font-bold shadow hover:bg-slate-700 text-sm w-full">
            預覽與列印報名表
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl shadow flex flex-col justify-between gap-3 border-2 border-blue-100">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2 text-blue-700">📋 匯出分組賽程與檢錄單</h3>
            <p className="text-xs text-slate-500 mt-1">列印已排定的各項目「組別、跑道、拔河對戰表」，供現場檢錄與張貼公告。</p>
          </div>
          <button onClick={() => {
            // 列印前同步確保預覽能讀取到最新編輯的 localConfig
            setConfig(localConfig);
            setPrintMode('heats');
            setTimeout(() => window.print(), 150);
          }} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold shadow hover:bg-blue-700 text-sm w-full">
            預覽與列印賽程公告單
          </button>
        </div>
      </div>

      {}
      <div className="bg-white p-6 rounded-xl shadow border-t-4 border-blue-600">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 border-b pb-3">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <span className="text-blue-600">🏁</span> 賽程分組與道次/對戰編排
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              可針對個人賽設定「第幾組、第幾跑道」，或針對拔河等團體賽安排「第一輪對戰班級」。編排後請記得點擊最下方「儲存所有設定」。
            </p>
          </div>
        </div>

        {/* 選擇要編排的項目與年級 */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="sm:col-span-5">
            <label className="text-xs font-bold text-slate-500 block mb-1">1. 選擇比賽項目</label>
            <select
              className="w-full border border-slate-300 p-2 rounded-lg font-bold text-slate-700 bg-white"
              value={heatEventId}
              onChange={(e) => setHeatEventId(e.target.value)}
            >
              {localConfig.events.map((ev: SportEvent) => (
                <option key={ev.id} value={ev.id}>
                  [{ev.type === 'group' ? '團體' : '個人'}] {getEventDisplayName(ev)}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <label className="text-xs font-bold text-slate-500 block mb-1">2. 選擇年級</label>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              {([7, 8, 9] as const).map((g) => {
                const count = (localConfig.heats?.[heatEventId]?.[g] || []).length;
                return (
                  <button
                    key={g}
                    onClick={() => setHeatGrade(g)}
                    className={`flex-1 py-1.5 rounded-md font-bold text-xs transition flex items-center justify-center gap-1 ${
                      heatGrade === g ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    <span>{g}年級</span>
                    {count > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-3 flex flex-col justify-end">
            <button
              onClick={handleAddHeat}
              className="w-full bg-blue-600 text-white py-2 px-3 rounded-lg font-bold hover:bg-blue-700 shadow text-sm flex items-center justify-center gap-1"
            >
              ➕ 新增{selectedHeatEvent?.type === 'group' ? '對戰場次' : '分組'}
            </button>
          </div>
        </div>

        {/* 快速自動隨機編排工具列 */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-lg text-xs">
          <div className="flex items-center gap-2 text-indigo-800 font-bold">
            <span>🎲 快速抽籤編排：</span>
            {selectedHeatEvent?.type === 'individual' ? (
              <div className="flex items-center gap-1 font-normal">
                <span>每組最多</span>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={autoAssignLanesCount}
                  onChange={(e) => setAutoAssignLanesCount(parseInt(e.target.value) || 6)}
                  className="w-12 border border-indigo-200 rounded px-1.5 py-0.5 text-center font-bold bg-white"
                />
                <span>個跑道/人</span>
              </div>
            ) : (
              <span className="font-normal text-indigo-600">將 {heatGrade} 年級各班兩兩隨機配對產生第一輪對戰表</span>
            )}
          </div>
          <button
            onClick={handleAutoGenerateHeats}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded font-bold hover:bg-indigo-700 transition shadow-sm"
          >
            ⚡ 依報名名單隨機分組/抽道次
          </button>
        </div>

        {/* 顯示尚未被分配的選手或班級提示 */}
        <div className="mb-4 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
          <div className="font-bold text-slate-600 mb-1">
            📌 {heatGrade} 年級可編排{selectedHeatEvent?.type === 'group' ? '班級' : '報名選手'}狀態（已排入 {assignedKeysSet.size} / 共 {availableParticipants.length}）：
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableParticipants.map((p) => {
              const isAssigned = assignedKeysSet.has(p.key);
              const hasName = p.studentName !== '';
              return (
                <span
                  key={p.key}
                  className={`px-2 py-0.5 rounded border ${
                    isAssigned
                      ? 'bg-green-50 border-green-300 text-green-700 font-bold'
                      : hasName
                      ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                      : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {isAssigned ? '✓ ' : ''}{p.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* 各組別 / 場次編輯卡片 */}
        {currentGradeHeats.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
            目前 {heatGrade} 年級「{selectedHeatEvent ? getEventDisplayName(selectedHeatEvent) : ''}」尚未建立任何分組或賽程。<br />
            請點擊上方「➕ 新增{selectedHeatEvent?.type === 'group' ? '對戰場次' : '分組'}」或「⚡ 隨機分組」開始編排。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentGradeHeats.map((heat) => (
              <div key={heat.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col">
                <div className="bg-slate-100 px-3 py-2 border-b flex justify-between items-center gap-2">
                  <input
                    type="text"
                    value={heat.name}
                    onChange={(e) => handleHeatNameChange(heat.id, e.target.value)}
                    className="font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 text-sm flex-1 focus:ring-2 focus:ring-blue-400 outline-none"
                    placeholder="輸入組別或場次名稱 (如: 第一組、第一輪A場)"
                  />
                  <button
                    onClick={() => handleRemoveHeat(heat.id)}
                    className="text-red-500 hover:bg-red-100 px-2 py-1 rounded text-xs font-bold transition"
                    title="刪除此組別/場次"
                  >
                    🗑️ 刪除
                  </button>
                </div>

                <div className="p-3 space-y-2 flex-1">
                  <div className="flex text-[11px] font-bold text-slate-400 px-1">
                    <div className="w-28">{selectedHeatEvent?.type === 'group' ? '對戰方/位置' : '道次/順序'}</div>
                    <div className="flex-1">{selectedHeatEvent?.type === 'group' ? '參賽班級' : '參賽選手 (班級 - 姓名)'}</div>
                    <div className="w-6"></div>
                  </div>

                  {heat.assignments.map((assign, sIdx) => {
                    const selectedKey = assign.classId ? `${assign.classId}_${assign.studentIdx}` : '';
                    return (
                      <div key={sIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={assign.lane}
                          onChange={(e) => handleAssignmentChange(heat.id, sIdx, 'lane', e.target.value)}
                          placeholder={selectedHeatEvent?.type === 'group' ? '甲方/乙方' : '第1道'}
                          className="w-28 border border-slate-200 rounded p-1.5 text-xs font-bold text-blue-700 bg-blue-50/40 focus:bg-white outline-none"
                        />
                        <select
                          value={selectedKey}
                          onChange={(e) => handleAssignmentChange(heat.id, sIdx, 'participantKey', e.target.value)}
                          className="flex-1 border border-slate-200 rounded p-1.5 text-xs font-bold text-slate-700 bg-white focus:ring-2 focus:ring-blue-400 outline-none"
                        >
                          <option value="">-- 請選擇{selectedHeatEvent?.type === 'group' ? '班級 (或輪空)' : '參賽選手'} --</option>
                          {availableParticipants.map((p) => {
                            const isUsedElsewhere = assignedKeysSet.has(p.key) && p.key !== selectedKey;
                            return (
                              <option key={p.key} value={p.key}>
                                {p.label} {isUsedElsewhere ? '(已排入他組)' : ''}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          onClick={() => handleRemoveAssignmentSlot(heat.id, sIdx)}
                          className="text-slate-300 hover:text-red-500 w-6 text-center font-bold"
                          title="移除此道次/位置"
                        >
                          ✖
                        </button>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => handleAddAssignmentSlot(heat.id)}
                    className="w-full mt-2 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition"
                  >
                    + 新增{selectedHeatEvent?.type === 'group' ? '對戰隊伍位置' : '跑道 / 參賽位'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><span className="text-yellow-500">🏆</span> 比賽項目管理</h3>
        
        <div className={`grid grid-cols-12 gap-2 mb-6 p-4 border-2 border-dashed rounded-lg items-end transition-colors ${editingEventId ? 'bg-yellow-50 border-yellow-300' : 'bg-slate-50 border-slate-200'}`}>
          {editingEventId && <div className="col-span-12 text-sm font-bold text-yellow-600 mb-2">✏️ 正在修改現有項目</div>}
          
          <div className="col-span-12 md:col-span-3">
            <label className="text-xs font-bold text-slate-400 block mb-1">名稱</label>
            <input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-400 outline-none" value={newName} onChange={e => setNewName(e.target.value)} placeholder="項目名稱" />
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
          <div className="col-span-12 md:col-span-5">
            <label className="text-xs font-bold text-slate-400 block mb-1">計算與排名規則</label>
            <select className="w-full border p-2 rounded" value={newSortRule} onChange={e => setNewSortRule(e.target.value)}>
              <option value="名次_asc">名次 (數值越小，排名越前)</option>
              <option value="秒_asc">時間/分秒 (數值越小，排名越前)</option>
              <option value="公尺_desc">距離/公尺 (數值越大，排名越前)</option>
              <option value="次_desc">次數/個 (數值越大，排名越前)</option>
            </select>
          </div>
          
          {newType === 'individual' && (
            <div className="col-span-6 md:col-span-2">
              <label className="text-xs font-bold text-slate-400 block mb-1">每班人數</label>
              <input type="number" className="w-full border p-2 rounded" value={newMax} onChange={e => setNewMax(parseInt(e.target.value))} min="1" max="20" />
            </div>
          )}
          <div className="col-span-12 md:col-span-4">
            <label className="text-xs font-bold text-slate-400 block mb-1">名次積分 (依序逗號分隔)</label>
            <input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-400 outline-none" value={newPoints} onChange={e => setNewPoints(e.target.value)} placeholder="如: 14,10,8,6,4,2" />
          </div>
          
          <div className="col-span-12 flex items-end gap-2 mt-2">
            {editingEventId ? (
              <>
                <button onClick={handleSaveEvent} className="flex-1 bg-green-600 text-white py-2 rounded font-bold hover:bg-green-700 shadow flex items-center justify-center gap-1">💾 儲存修改</button>
                <button onClick={handleCancelEdit} className="w-24 bg-slate-400 text-white py-2 rounded font-bold hover:bg-slate-500 shadow">取消</button>
              </>
            ) : (
              <button onClick={handleSaveEvent} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 shadow flex items-center justify-center gap-1">➕ 新增項目</button>
            )}
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {localConfig.events.map((e: any) => (
            <div key={e.id} className={`flex gap-2 items-center border p-2 rounded transition ${editingEventId === e.id ? 'bg-yellow-100 border-yellow-400' : 'bg-white hover:bg-slate-50'}`}>
              <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${e.type === 'group' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{e.type === 'group' ? '團體' : '個人'}</span>
              
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                <span className="font-bold">{getEventDisplayName(e)}</span>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {e.type === 'individual' && <span className="border border-slate-200 px-1 rounded bg-slate-50">每班 {e.maxParticipants} 人</span>}
                  <span className="border border-slate-200 px-1 rounded bg-slate-50" title="計分規則">{e.sortBy === 'asc' ? '小者前' : '大者前'}</span>
                  <span className="border border-slate-200 px-1 rounded bg-slate-50" title="各名次對應積分">分: {e.rankPoints?.join(', ')}</span>
                </div>
              </div>
              
              <button onClick={() => handleEditEvent(e)} className="text-blue-500 px-2 py-1 hover:bg-blue-100 rounded bg-blue-50 transition" title="編輯項目">✏️</button>
              <button onClick={() => confirmRemoveEvent(e.id)} className="text-red-500 px-2 py-1 hover:bg-red-100 rounded bg-red-50 transition" title="刪除項目">🗑️</button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-3">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2"><span className="text-indigo-500">🏫</span> 班級與學生名單管理</h3>
            <p className="text-sm text-slate-500">新增或移除班級，或透過「CSV」大量匯入學生名單供報名系統下拉使用。</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={downloadCsvTemplate} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg border border-slate-300 font-bold transition">📋 下載匯入範本</button>
            <input type="file" accept=".csv" className="hidden" ref={csvInputRef} onChange={handleImportCsv} />
            <button onClick={() => csvInputRef.current?.click()} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-bold transition shadow flex items-center gap-1">📥 匯入學生名條</button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-end gap-2 mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-bold text-slate-400 block mb-1">選擇年級</label>
            <select className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-400 outline-none" value={newClassGrade} onChange={e => setNewClassGrade(Number(e.target.value) as Grade)}>
              <option value={7}>7 年級</option>
              <option value={8}>8 年級</option>
              <option value={9}>9 年級</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-bold text-slate-400 block mb-1">班級名稱 (如: 706)</label>
            <input type="text" className="w-full border p-2 rounded focus:ring-2 focus:ring-blue-400 outline-none" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="輸入新班級" />
          </div>
          <button onClick={handleAddClass} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold hover:bg-indigo-700 shadow h-[42px] whitespace-nowrap">➕ 新增班級</button>
        </div>

        <div className="space-y-6">
          {[7, 8, 9].map(grade => {
            const gradeClasses = localConfig.classes.filter((c: any) => c.grade === grade);
            return (
              <div key={grade} className="border border-slate-100 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-3 py-2 font-bold text-slate-700 border-b">
                  {grade} 年級 <span className="text-xs text-slate-500 ml-2 font-normal">共 {gradeClasses.length} 班</span>
                </div>
                <div className="p-3 flex flex-wrap gap-2 bg-white">
                  {gradeClasses.length > 0 ? (
                    gradeClasses.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <span className="font-bold text-slate-700">{c.name}</span>
                        {c.students && c.students.length > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 rounded-full font-bold">{c.students.length}人</span>}
                        <button onClick={() => confirmRemoveClass(c.id)} className="text-slate-400 hover:text-red-500 ml-1 transition" title="移除班級">✖</button>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 text-sm italic w-full text-center py-2">目前無班級設定</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow mt-6">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><span className="text-teal-500">💾</span> 系統資料備份與還原</h3>
        <p className="text-sm text-slate-500 mb-4">將目前的賽事設定、班級、報名名單與成績等打包下載為 JSON 備份檔，或從備份檔還原。</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={handleExport} className="border-2 border-teal-500 text-teal-600 bg-teal-50 hover:bg-teal-100 px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition">
            📤 匯出備份資料 (.json)
          </button>
          
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
          <button onClick={() => fileInputRef.current?.click()} className="border-2 border-orange-500 text-orange-600 bg-orange-50 hover:bg-orange-100 px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition">
            📥 匯入備份資料還原
          </button>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 p-6 rounded-xl shadow-sm mt-6">
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

      {eventToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-2 text-red-600">確定刪除此項目嗎？</h3>
            <p className="text-sm text-slate-600 mb-4">這將會隱藏該項目的所有成績與報名資料！</p>
            <div className="flex gap-2">
              <button onClick={() => setEventToDelete(null)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200">取消</button>
              <button onClick={executeRemoveEvent} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700">確定刪除</button>
            </div>
          </div>
        </div>
      )}

      {classToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-2 text-red-600">確定刪除 {classToDelete} 班嗎？</h3>
            <p className="text-sm text-slate-600 mb-4">刪除班級後，雖然該班先前登錄的成績資料不會從資料庫完全抹除，但將<span className="font-bold">不會</span>顯示在任何報表、看板或成績排名中。請確認是否要刪除？</p>
            <div className="flex gap-2">
              <button onClick={() => setClassToDelete(null)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold hover:bg-slate-200">取消</button>
              <button onClick={executeRemoveClass} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700">確定刪除</button>
            </div>
          </div>
        </div>
      )}
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

  const getSortedEventResults = (event: any, grade: number) => {
    const eventResults = results[event.id] || {};
    const gradeClasses = config.classes.filter((c: any) => c.grade === grade);
    
    let rows = gradeClasses.flatMap((c: any) => {
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

    return rows;
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

      <h2 className="text-xl font-bold border-b-2 border-black pb-2 mb-4 break-before-page">🏃 各項比賽得獎名單 (前三名)</h2>
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

      <h2 className="text-xl font-bold border-b-2 border-black pb-2 mb-4 break-before-page">📋 各項比賽詳細成績 (全表)</h2>
      <div className="space-y-6">
        {config.events.map((event: any) => (
          <div key={event.id} className="break-inside-avoid border border-gray-400 p-4 rounded-lg">
            <h3 className="font-bold text-lg mb-3 bg-gray-100 p-2 text-center shadow-sm">{getEventDisplayName(event)}</h3>
            <div className="grid grid-cols-3 gap-6">
              {[7, 8, 9].map(grade => {
                const rows = getSortedEventResults(event, grade);
                return (
                  <div key={grade}>
                    <h4 className="font-bold text-md text-center bg-gray-200 border border-b-0 border-gray-400 p-1">{grade} 年級</h4>
                    <table className="w-full text-xs border-collapse border border-gray-400">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 p-1 w-10">名次</th>
                          <th className="border border-gray-300 p-1 w-12">班級</th>
                          {event.type === 'individual' && <th className="border border-gray-300 p-1">姓名</th>}
                          <th className="border border-gray-300 p-1">成績</th>
                          <th className="border border-gray-300 p-1 w-10">積分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row: any, idx: number) => {
                          const hasScore = row.val !== null;
                          const pts = hasScore && idx < (event.rankPoints || DEFAULT_POINTS).length ? (event.rankPoints || DEFAULT_POINTS)[idx] : 0;
                          return (
                            <tr key={`${row.class.id}-${idx}`}>
                              <td className="border border-gray-300 p-1 text-center font-bold">{hasScore ? idx + 1 : '-'}</td>
                              <td className="border border-gray-300 p-1 text-center font-bold text-sm">{row.class.name}</td>
                              {event.type === 'individual' && <td className="border border-gray-300 p-1 text-center">{row.student || '-'}</td>}
                              <td className="border border-gray-300 p-1 text-right font-mono pr-2">{row.score || '-'}</td>
                              <td className="border border-gray-300 p-1 text-center">{hasScore ? pts : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
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

function PrintHeats({ config, results }: any) {
  if (!config) return null;
  const heatsData: HeatsData = config.heats || {};

  // 檢查是否有任何已編排的分組資料
  const hasAnyHeats = config.events.some((ev: SportEvent) =>
    [7, 8, 9].some((g) => (heatsData[ev.id]?.[g] || []).length > 0)
  );

  return (
    <div className="hidden print:block bg-white text-black p-8">
      <div className="text-center mb-6 border-b-2 border-black pb-4">
        <h1 className="text-3xl font-extrabold tracking-wider">嘉新國中運動會 - 各項比賽分組賽程與檢錄表</h1>
        <p className="text-sm text-gray-600 mt-1">請各班參賽選手依組別與道次/場次提早至檢錄處集合檢錄</p>
      </div>

      {!hasAnyHeats ? (
        <div className="text-center py-20 text-gray-500 text-lg border-2 border-dashed border-gray-300 rounded-xl">
          目前尚未編排任何分組賽程資料。請先由管理員後台「賽程分組與道次/對戰編排」進行設定。
        </div>
      ) : (
        <div className="space-y-8">
          {config.events.map((event: SportEvent) => {
            const eventHeatsByGrade = heatsData[event.id] || {};
            const gradesWithHeats = ([7, 8, 9] as const).filter(
              (g) => (eventHeatsByGrade[g] || []).length > 0
            );

            if (gradesWithHeats.length === 0) return null;

            return (
              <div key={event.id} className="break-inside-avoid border-2 border-black rounded-lg overflow-hidden mb-6">
                <div className="bg-gray-200 px-4 py-2 border-b-2 border-black flex justify-between items-center">
                  <h2 className="text-xl font-bold">
                    {event.type === 'group' ? '👥 團體賽' : '🏃 個人賽'} — {getEventDisplayName(event)}
                  </h2>
                  <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-gray-400">
                    成績單位：{event.unit}
                  </span>
                </div>

                <div className="p-4 space-y-6">
                  {gradesWithHeats.map((grade) => {
                    const gradeHeats = eventHeatsByGrade[grade] || [];
                    return (
                      <div key={grade} className="break-inside-avoid">
                        <h3 className="font-bold text-lg mb-3 border-l-4 border-black pl-2 bg-gray-100 py-1">
                          {grade} 年級 賽程分組表
                        </h3>

                        {event.type === 'group' ? (
                          <div className="grid grid-cols-2 gap-4">
                            {gradeHeats.map((heat: EventHeat) => {
                              const teamA = heat.assignments[0];
                              const teamB = heat.assignments[1];
                              const extraTeams = heat.assignments.slice(2);
                              return (
                                <div key={heat.id} className="border border-gray-400 rounded p-3 break-inside-avoid">
                                  <div className="font-bold text-center bg-gray-100 border-b border-gray-300 pb-1 mb-2 text-sm">
                                    {heat.name}
                                  </div>
                                  <div className="flex items-center justify-around py-2 text-center">
                                    <div className="flex-1">
                                      <div className="text-[11px] text-gray-500">{teamA?.lane || '甲方'}</div>
                                      <div className="text-lg font-extrabold mt-0.5">
                                        {teamA?.classId ? `${teamA.classId} 班` : '輪空 / 待定'}
                                      </div>
                                    </div>
                                    <div className="px-3 font-black text-gray-500 text-sm">VS</div>
                                    <div className="flex-1">
                                      <div className="text-[11px] text-gray-500">{teamB?.lane || '乙方'}</div>
                                      <div className="text-lg font-extrabold mt-0.5">
                                        {teamB?.classId ? `${teamB.classId} 班` : '輪空 / 待定'}
                                      </div>
                                    </div>
                                  </div>
                                  {extraTeams.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-dashed border-gray-300 text-xs space-y-1">
                                      {extraTeams.map((t, idx) => (
                                        <div key={idx} className="flex justify-between">
                                          <span className="text-gray-600">{t.lane}：</span>
                                          <span className="font-bold">{t.classId ? `${t.classId} 班` : '-'}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-600 flex justify-between">
                                    <span>勝方紀錄：________________</span>
                                    <span>裁判簽章：__________</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            {gradeHeats.map((heat: EventHeat) => (
                              <div key={heat.id} className="border border-gray-400 rounded overflow-hidden break-inside-avoid">
                                <div className="font-bold bg-gray-100 px-3 py-1.5 border-b border-gray-400 text-center text-sm">
                                  {heat.name}
                                </div>
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-gray-50 border-b border-gray-300">
                                      <th className="border-r border-gray-300 p-1.5 w-20 text-center">道次</th>
                                      <th className="border-r border-gray-300 p-1.5 w-16 text-center">班級</th>
                                      <th className="border-r border-gray-300 p-1.5 text-left pl-2">選手姓名</th>
                                      <th className="p-1.5 w-24 text-center">成績紀錄 ({event.unit})</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {heat.assignments.map((assign: HeatAssignment, idx: number) => {
                                      // 即時從最新 results 抓取學生姓名，確保就算報名表後來改名也能同步更新
                                      const latestName =
                                        assign.classId
                                          ? results[event.id]?.[assign.classId]?.[assign.studentIdx]?.studentName || assign.studentName || ''
                                          : '';
                                      return (
                                        <tr key={idx} className="border-b border-gray-200 last:border-0">
                                          <td className="border-r border-gray-300 p-1.5 text-center font-bold">{assign.lane}</td>
                                          <td className="border-r border-gray-300 p-1.5 text-center font-bold text-sm">
                                            {assign.classId || '-'}
                                          </td>
                                          <td className="border-r border-gray-300 p-1.5 pl-2 font-medium">
                                            {latestName || (assign.classId ? '(未填姓名)' : '-')}
                                          </td>
                                          <td className="p-1.5"></td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}