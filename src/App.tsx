import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc 
} from 'firebase/firestore';
import {
  Trophy,
  Users,
  Settings,
  Edit,
  Save,
  LogOut,
  Plus,
  Trash2,
  ChevronRight,
  Medal,
  Activity,
  X,
  Crown,
  BarChart3,
  ListOrdered,
  AlertTriangle,
  CheckCircle2,
  User,
  Clipboard,
  FileText,
  Info
} from 'lucide-react';

// --- Firebase Initialization (設定區域) ---

// -----------------------------------------------------------------------
// [區域 A]：預覽環境專用 (目前在此網頁上運作使用)
// 在 StackBlitz 中，這一段必須被註解掉，否則會出現白畫面
// -----------------------------------------------------------------------
/*
const firebaseConfig = JSON.parse(
  typeof __firebase_config !== "undefined"
    ? __firebase_config
    : "{}"
);
const appId =
  typeof __app_id !== "undefined" ? __app_id : "default-app-id";
const initialAuthToken =
  typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null;
*/

// -----------------------------------------------------------------------
// [區域 B]：正式環境專用 (StackBlitz / Vercel)
// 請將您的 Firebase Config 填入下方
// -----------------------------------------------------------------------

const firebaseConfig = {
  apiKey: 'AIzaSyBF6CWSPOS1AVIIKrV95r4okSyZpPJYCbE',
  authDomain: 'sports-day-2024-c035a.firebaseapp.com',
  projectId: 'sports-day-2024-c035a',
  storageBucket: 'sports-day-2024-c035a.firebasestorage.app',
  messagingSenderId: '43248608084',
  appId: '1:43248608084:web:24a598d59a27d0c8349ec1',
};

const appId = 'sports-day-2024';


// 正式環境不需要 Token
const initialAuthToken = null;


// 初始化 Firebase (這部分通用，不用動)
// 為了避免白畫面，我們加一個簡單的檢查
// 修正：明確指定型別為 any 以通過 TypeScript 嚴格檢查
let app: any;
let auth: any;
let db: any;

try {
  // 只有當設定檔看起來正常時才初始化
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "您的_API_KEY") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase 初始化失敗:", e);
}


// --- Types ---
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

// --- Default Data ---
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
  {
    id: 'evt_creative',
    name: '創意進場',
    type: 'group',
    gender: 'Mixed',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [14, 10, 8, 6, 4, 2],
    maxParticipants: 1,
  },
  {
    id: 'evt_tug',
    name: '拔河',
    type: 'group',
    gender: 'Mixed',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [14, 10, 8, 6, 4, 2],
    maxParticipants: 1,
  },
  {
    id: 'evt_fun',
    name: '趣味競賽',
    type: 'group',
    gender: 'Mixed',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_relay',
    name: '大隊接力',
    type: 'group',
    gender: 'Mixed',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [14, 10, 8, 6, 4, 2],
    maxParticipants: 1,
  },
  {
    id: 'evt_100m_m',
    name: '100m',
    type: 'individual',
    gender: 'M',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_100m_f',
    name: '100m',
    type: 'individual',
    gender: 'F',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_200m_m',
    name: '200m',
    type: 'individual',
    gender: 'M',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_200m_f',
    name: '200m',
    type: 'individual',
    gender: 'F',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_high_m',
    name: '跳高',
    type: 'individual',
    gender: 'M',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_high_f',
    name: '跳高',
    type: 'individual',
    gender: 'F',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_long_m',
    name: '跳遠',
    type: 'individual',
    gender: 'M',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
  {
    id: 'evt_long_f',
    name: '跳遠',
    type: 'individual',
    gender: 'F',
    unit: '名次',
    sortBy: 'asc',
    rankPoints: [7, 5, 4, 3, 2, 1],
    maxParticipants: 1,
  },
];

// --- Helper Functions ---
const parsePoints = (str: string) => {
  return str
    .split(/[,，]/)
    .map((s) => parseInt(s.trim()))
    .filter((n) => !isNaN(n));
};

const getEventDisplayName = (event: SportEvent) => {
  const genderLabel =
    event.gender === 'Mixed' ? '混合' : event.gender === 'M' ? '男' : '女';
  if (event.name.includes(genderLabel)) {
    return event.name;
  }
  return `${event.name} (${genderLabel})`;
};

// --- Toast Notification Component ---
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast = ({ message, type, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgClass =
    type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';

  return (
    <div className={`fixed top-4 right-4 ${bgClass} text-white px-6 py-3 rounded-lg shadow-xl z-[100] flex items-center gap-2 animate-fade-in`}>
      {type === 'success' && <CheckCircle2 size={20} />}
      {type === 'error' && <AlertTriangle size={20} />}
      {type === 'info' && <Info size={20} />}
      <span className="font-bold">{message}</span>
    </div>
  );
};

// --- Main App Component ---
export default function SportsDayApp() {
  const [user, setUser] = useState<any>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [results, setResults] = useState<ResultsData>({});
  const [currentView, setCurrentView] = useState<
    'dashboard' | 'admin_input' | 'settings'
  >('dashboard');
  const [selectedGrade, setSelectedGrade] = useState<Grade | 'all'>(7);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
  };

  // 檢查是否已設定 Firebase
  if (!app || !auth || !db) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-red-200 max-w-md">
          <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">尚未設定 Firebase</h1>
          <p className="text-slate-600 mb-4">
            請打開 <code>src/App.tsx</code> 檔案，找到 <code>firebaseConfig</code> 區塊，並填入您從 Firebase Console 取得的金鑰資訊。
          </p>
          <div className="bg-slate-100 p-3 rounded text-left text-xs font-mono text-slate-500 overflow-x-auto">
            apiKey: "您的_API_KEY",<br/>
            authDomain: "...",<br/>
            ...
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    const initAuth = async () => {
      if (initialAuthToken) {
        await signInWithCustomToken(auth, initialAuthToken);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // 路徑使用 'artifacts', appId, 'public', 'data' 結構
    // 這是為了在正式環境也能運作，建議保持這個結構
    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'main');
    const unsubConfig = onSnapshot(
      configRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as AppConfig;
          const migratedEvents = data.events.map((e) => ({
            ...e,
            rankPoints: e.rankPoints || DEFAULT_POINTS,
            maxParticipants: e.maxParticipants || 1,
          }));
          setConfig({ ...data, events: migratedEvents });
        } else {
          const initialConfig: AppConfig = {
            classes: DEFAULT_CLASSES,
            events: DEFAULT_EVENTS,
          };
          setDoc(configRef, initialConfig);
          setConfig(initialConfig);
        }
      },
      (err) => console.error('Config fetch error', err)
    );

    const resultsRef = doc(db, 'artifacts', appId, 'public', 'data', 'results', 'main');
    const unsubResults = onSnapshot(
      resultsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, any>;
          const normalizedResults: ResultsData = {};
          Object.keys(data).forEach((evtId) => {
            normalizedResults[evtId] = {};
            Object.keys(data[evtId]).forEach((classId) => {
              const entry = data[evtId][classId];
              if (Array.isArray(entry)) {
                normalizedResults[evtId][classId] = entry;
              } else {
                normalizedResults[evtId][classId] = [entry];
              }
            });
          });
          setResults(normalizedResults);
        } else {
          setDoc(resultsRef, {});
        }
      },
      (err) => console.error('Results fetch error', err)
    );

    return () => {
      unsubConfig();
      unsubResults();
    };
  }, [user]);

  const handleAdminLogin = () => {
    if (passwordInput === '8888') {
      setIsAdminMode(true);
      setCurrentView('admin_input');
      setPasswordInput('');
      document.getElementById('login-modal')?.classList.add('hidden');
      showToast('管理員登入成功', 'success');
    } else {
      showToast('密碼錯誤', 'error');
    }
  };

  const handleLogout = () => {
    setIsAdminMode(false);
    setCurrentView('dashboard');
    showToast('已登出', 'info');
  };

  if (!config)
    return (
      <div className="flex h-screen items-center justify-center text-blue-600 font-bold text-xl">
        資料載入中...
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      <header className="bg-blue-600 text-white p-3 shadow-lg sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setCurrentView('dashboard')}
          >
            <Trophy className="w-8 h-8 text-yellow-300 flex-shrink-0" />
            <div className="flex flex-col items-center leading-tight">
              <h1 className="text-xl font-bold tracking-wide">
                嘉新國中運動會
              </h1>
              <h2 className="text-base font-bold tracking-widest text-blue-100">
                即時看板
              </h2>
            </div>
          </div>
          <div>
            {isAdminMode ? (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-700 px-2 py-1 rounded hidden sm:inline">
                  管理員
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentView('dashboard')}
                  className={`p-2 rounded hover:bg-blue-500 ${
                    currentView === 'dashboard' ? 'bg-blue-800' : ''
                  }`}
                  title="看板"
                >
                  <Trophy size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('admin_input')}
                  className={`p-2 rounded hover:bg-blue-500 ${
                    currentView === 'admin_input' ? 'bg-blue-800' : ''
                  }`}
                  title="成績輸入"
                >
                  <Edit size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentView('settings')}
                  className={`p-2 rounded hover:bg-blue-500 ${
                    currentView === 'settings' ? 'bg-blue-800' : ''
                  }`}
                  title="設定"
                >
                  <Settings size={20} />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded hover:bg-red-500 bg-red-600 ml-1"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('login-modal')
                    ?.classList.remove('hidden')
                }
                className="text-sm bg-blue-700 hover:bg-blue-500 px-3 py-1.5 rounded flex items-center gap-1"
              >
                <Settings size={14} /> 登入
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {currentView === 'dashboard' && (
          <Dashboard
            config={config}
            results={results}
            selectedGrade={selectedGrade}
            setSelectedGrade={setSelectedGrade}
            isAdminMode={isAdminMode}
          />
        )}
        {currentView === 'admin_input' && isAdminMode && (
          <AdminInput config={config} results={results} showToast={showToast} />
        )}
        {currentView === 'settings' && isAdminMode && (
          <AdminSettings config={config} showToast={showToast} />
        )}
      </main>

      <div
        id="login-modal"
        className="hidden fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      >
        <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-700">工作人員登入</h3>
            <button
              type="button"
              onClick={() =>
                document.getElementById('login-modal')?.classList.add('hidden')
              }
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            請輸入工作人員通行碼以編輯成績。
          </p>
          <input
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            placeholder="請輸入通行碼"
            className="w-full border p-3 rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
          />
          <button
            type="button"
            onClick={handleAdminLogin}
            className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 transition"
          >
            登入
          </button>
        </div>
      </div>
    </div>
  );
}

// ... Sub-Components ...

function Dashboard({
  config,
  results,
  selectedGrade,
  setSelectedGrade,
  isAdminMode,
}: {
  config: AppConfig;
  results: ResultsData;
  selectedGrade: Grade | 'all';
  setSelectedGrade: (g: Grade | 'all') => void;
  isAdminMode: boolean;
}) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const standings = useMemo(() => {
    const classPoints: Record<string, number> = {};
    config.classes.forEach((c) => (classPoints[c.id] = 0));

    config.events.forEach((event) => {
      const eventResults = results[event.id] || {};
      const currentPointsSystem = event.rankPoints || DEFAULT_POINTS;

      [7, 8, 9].forEach((g) => {
        const gradeClasses = config.classes.filter((c) => c.grade === g);
        let allParticipants: { classId: string; val: number }[] = [];

        gradeClasses.forEach((c) => {
          const classEntries = eventResults[c.id] || [];
          classEntries.forEach((entry) => {
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

    const sortedClasses = [...config.classes].sort(
      (a, b) => classPoints[b.id] - classPoints[a.id]
    );

    const schoolChampion = sortedClasses[0];
    const gradeChampions: Record<number, ClassInfo> = {};
    [7, 8, 9].forEach((g) => {
      const best = sortedClasses.find((c) => c.grade === g);
      if (best) gradeChampions[g] = best;
    });

    return { classPoints, sortedClasses, schoolChampion, gradeChampions };
  }, [config, results]);

  const getTop3 = (eventId: string, grade: Grade) => {
    const event = config.events.find((e) => e.id === eventId);
    if (!event) return [];

    const eventResults = results[eventId] || {};
    const relevantClasses = config.classes.filter((c) => c.grade === grade);

    let allParticipants: {
      class: string;
      record: StudentResult;
      val: number;
    }[] = [];

    relevantClasses.forEach((c) => {
      const entries = eventResults[c.id] || [];
      entries.forEach((entry) => {
        if (entry.score) {
          allParticipants.push({
            class: c.name,
            record: entry,
            val: parseFloat(entry.score),
          });
        }
      });
    });

    allParticipants.sort((a, b) => {
      if (event.sortBy === 'asc') return a.val - b.val;
      return b.val - a.val;
    });

    return allParticipants.slice(0, 3);
  };

  return (
    <div className="space-y-6">
      {!selectedEventId && (
        <div
          className={`grid grid-cols-1 ${
            isAdminMode ? 'md:grid-cols-2' : ''
          } gap-4 mb-8`}
        >
          {isAdminMode && (
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl shadow-lg p-5 text-white flex items-center justify-between relative overflow-hidden">
              <div className="z-10">
                <div className="text-yellow-100 font-bold text-sm uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Crown size={16} /> 全校總冠軍 (僅管理員可見)
                </div>
                <div className="text-5xl font-extrabold">
                  {standings.schoolChampion?.name || '-'}
                </div>
                <div className="text-yellow-100 mt-1 font-bold">
                  積分:{' '}
                  {standings.classPoints[standings.schoolChampion?.id || ''] ||
                    0}
                </div>
              </div>
              <Trophy
                size={80}
                className="text-white/20 absolute -right-4 -bottom-4 rotate-12"
              />
            </div>
          )}

          <div className="bg-white rounded-xl shadow-md border border-slate-100 p-5 flex flex-col justify-between">
            <h3 className="font-bold text-slate-500 text-sm flex items-center gap-2 mb-3">
              <Medal size={16} /> 各年級領先
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {([7, 8, 9] as const).map((g) => (
                <div key={g} className="text-center bg-slate-50 rounded-lg p-2">
                  <div className="text-xs text-slate-400 font-bold mb-1">
                    {g}年級
                  </div>
                  <div className="text-xl font-bold text-blue-600">
                    {standings.gradeChampions[g]?.name || '-'}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">
                    {standings.classPoints[
                      standings.gradeChampions[g]?.id || ''
                    ] || 0}
                    分
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-2 overflow-x-auto py-2">
        {([7, 8, 9] as const).map((g) => (
          <button
            key={g}
            onClick={() => {
              setSelectedGrade(g);
              setSelectedEventId(null);
            }}
            className={`px-6 py-2 rounded-full font-bold shadow-sm transition whitespace-nowrap ${
              selectedGrade === g
                ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {g} 年級
          </button>
        ))}
        <button
          onClick={() => {
            setSelectedGrade('all');
            setSelectedEventId(null);
          }}
          className={`px-6 py-2 rounded-full font-bold shadow-sm transition whitespace-nowrap ${
            selectedGrade === 'all'
              ? 'bg-slate-800 text-white ring-2 ring-slate-400'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          全校列表
        </button>
      </div>

      {!selectedEventId && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-100 mb-6">
          <div className="bg-slate-50 p-3 border-b flex items-center gap-2">
            <BarChart3 size={18} className="text-slate-500" />
            <h3 className="font-bold text-slate-700">總錦標積分榜</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-400 border-b">
                  <th className="p-3 w-16 text-center">排名</th>
                  <th className="p-3">班級</th>
                  <th className="p-3 text-right">總積分</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {standings.sortedClasses
                  .filter(
                    (c) => selectedGrade === 'all' || c.grade === selectedGrade
                  )
                  .map((c, idx) => (
                    <tr key={c.id} className={idx < 3 ? 'bg-yellow-50/30' : ''}>
                      <td className="p-3 text-center font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-bold text-slate-700">{c.name}</td>
                      <td className="p-3 text-right font-mono font-bold text-blue-600">
                        {standings.classPoints[c.id]}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedEventId ? (
        <div className="bg-white rounded-xl shadow-md overflow-hidden animate-fade-in">
          <div className="bg-slate-100 p-4 border-b flex justify-between items-center sticky top-0">
            <button
              onClick={() => setSelectedEventId(null)}
              className="text-blue-600 font-bold flex items-center hover:bg-blue-100 px-3 py-1 rounded"
            >
              ← 返回列表
            </button>
            <h2 className="font-bold text-lg">
              {getEventDisplayName(
                config.events.find((e) => e.id === selectedEventId)!
              )}
              <span className="text-sm text-slate-500 ml-2">
                ({selectedGrade === 'all' ? '全校' : `${selectedGrade}年級`})
              </span>
            </h2>
          </div>
          <div className="p-0 overflow-x-auto">
            <ResultTable
              eventId={selectedEventId}
              config={config}
              results={results}
              gradeFilter={selectedGrade}
            />
          </div>
        </div>
      ) : (
        <>
          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Activity size={18} /> 各項比賽成績
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {config.events.map((event) => {
              const top3 =
                selectedGrade !== 'all'
                  ? getTop3(event.id, selectedGrade as Grade)
                  : [];
              if (selectedGrade === 'all') return null;

              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEventId(event.id)}
                  className="bg-white rounded-xl shadow border border-slate-100 hover:shadow-lg hover:border-blue-300 transition cursor-pointer group flex flex-col"
                >
                  <div className="p-4 border-b border-slate-50 bg-slate-50 group-hover:bg-blue-50 transition flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      {event.type === 'group' ? (
                        <Users size={18} className="text-purple-500" />
                      ) : (
                        <Activity size={18} className="text-orange-500" />
                      )}
                      <h3 className="font-bold text-slate-800">
                        {getEventDisplayName(event)}
                      </h3>
                    </div>
                    <ChevronRight
                      size={18}
                      className="text-slate-400 group-hover:text-blue-500"
                    />
                  </div>

                  <div className="p-4 flex-1">
                    {top3.length > 0 ? (
                      <div className="space-y-2">
                        {top3.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                  idx === 0
                                    ? 'bg-yellow-400'
                                    : idx === 1
                                    ? 'bg-gray-400'
                                    : 'bg-orange-400'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span className="font-medium text-slate-700">
                                {item.class}
                              </span>
                              {item.record?.studentName && (
                                <span className="text-slate-400 text-xs truncate max-w-[60px]">
                                  {item.record.studentName}
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-blue-600">
                              {item.record?.score} {event.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm italic py-4">
                        尚無成績
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-50 px-4 py-2 text-xs text-slate-400 border-t flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <ListOrdered size={12} /> 積分:{' '}
                      {(event.rankPoints || DEFAULT_POINTS)
                        .slice(0, 3)
                        .join('-')}
                      ...
                    </span>
                    {event.type === 'individual' &&
                      event.maxParticipants > 1 && (
                        <span className="flex items-center gap-1 bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                          <User size={10} /> {event.maxParticipants}人/班
                        </span>
                      )}
                  </div>
                </div>
              );
            })}
            {selectedGrade === 'all' && (
              <div className="col-span-full text-center text-slate-400 py-10 italic">
                請選擇年級以查看各項比賽詳細成績
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ResultTable({
  eventId,
  config,
  results,
  gradeFilter,
}: {
  eventId: string;
  config: AppConfig;
  results: ResultsData;
  gradeFilter: Grade | 'all';
}) {
  const event = config.events.find((e) => e.id === eventId);
  if (!event) return null;

  const eventResults = results[eventId] || {};
  const relevantClasses = config.classes.filter(
    (c) => gradeFilter === 'all' || c.grade === gradeFilter
  );

  const allEntries: {
    class: ClassInfo;
    score: string;
    student: string;
    val: number;
  }[] = [];

  relevantClasses.forEach((c) => {
    const entries = eventResults[c.id] || [];
    if (entries.length === 0) {
      allEntries.push({
        class: c,
        score: '',
        student: '',
        val: event.sortBy === 'asc' ? Infinity : -Infinity,
      });
    } else {
      entries.forEach((entry) => {
        allEntries.push({
          class: c,
          score: entry.score || '',
          student: entry.studentName || '',
          val: entry.score
            ? parseFloat(entry.score)
            : event.sortBy === 'asc'
            ? Infinity
            : -Infinity,
        });
      });
    }
  });

  const sortedData = [...allEntries].sort((a, b) => {
    if (a.score === '' && b.score === '') {
      return a.class.id.localeCompare(b.class.id);
    }
    if (a.score === '') return 1;
    if (b.score === '') return -1;

    if (event.sortBy === 'asc') return a.val - b.val;
    return b.val - a.val;
  });

  const pointsSystem = event.rankPoints || DEFAULT_POINTS;

  return (
    <table className="w-full text-left border-collapse">
      <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
        <tr>
          <th className="p-4 w-16 text-center">排名</th>
          <th className="p-4">班級</th>
          {event.type === 'individual' && <th className="p-4">姓名</th>}
          <th className="p-4 text-right">成績 ({event.unit})</th>
          <th className="p-4 text-right w-20">積分</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {sortedData.map((row, idx) => {
          const hasScore = row.score !== '';
          const rank = hasScore ? idx + 1 : '-';
          const points =
            hasScore && idx < pointsSystem.length ? pointsSystem[idx] : 0;

          return (
            <tr
              key={`${row.class.id}-${idx}`}
              className={hasScore && idx < 3 ? 'bg-yellow-50/50' : ''}
            >
              <td className="p-4 text-center font-bold text-slate-400">
                {hasScore && idx === 0 && (
                  <Medal
                    size={20}
                    className="mx-auto text-yellow-500 fill-current"
                  />
                )}
                {hasScore && idx === 1 && (
                  <Medal
                    size={20}
                    className="mx-auto text-gray-400 fill-current"
                  />
                )}
                {hasScore && idx === 2 && (
                  <Medal
                    size={20}
                    className="mx-auto text-orange-400 fill-current"
                  />
                )}
                {(!hasScore || idx > 2) && rank}
              </td>
              <td className="p-4 font-bold text-slate-700 text-lg">
                {row.class.name}
              </td>
              {event.type === 'individual' && (
                <td className="p-4 text-slate-600">{row.student || '-'}</td>
              )}
              <td className="p-4 text-right font-mono font-bold text-blue-600 text-lg">
                {row.score || '-'}
              </td>
              <td className="p-4 text-right text-slate-400 font-mono text-sm">
                {hasScore ? `+${points}` : '-'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AdminInput({
  config,
  results,
  showToast,
}: {
  config: AppConfig;
  results: ResultsData;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
  const [selectedEventId, setSelectedEventId] = useState(
    config.events[0]?.id || ''
  );
  const [selectedGrade, setSelectedGrade] = useState<Grade>(7);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchText, setBatchText] = useState('');

  const [localScores, setLocalScores] = useState<
    Record<string, StudentResult[]>
  >({});

  const selectedEvent = useMemo(
    () => config.events.find((e) => e.id === selectedEventId),
    [config.events, selectedEventId]
  );

  useEffect(() => {
    // 這裡我們加了 ?. 來保護 selectedEvent，萬一它還沒載入完成，就先用預設值 1
    const maxParticipants = selectedEvent?.maxParticipants || 1;
    
    if (!selectedEventId || !selectedEvent) return;
    const currentEventResults = results[selectedEventId] || {};

    const initializedScores: Record<string, StudentResult[]> = {};
    config.classes.forEach((c) => {
      const existingEntries = currentEventResults[c.id] || [];
      const entries = [];
      for (let i = 0; i < maxParticipants; i++) {
        entries.push(existingEntries[i] || { score: '', studentName: '' });
      }
      initializedScores[c.id] = entries;
    });

    setLocalScores(initializedScores);
    setConfirmClear(false);
  }, [selectedEventId, results, selectedEvent, config.classes]);

  const handleScoreChange = (
    classId: string,
    index: number,
    field: keyof StudentResult,
    value: string
  ) => {
    setLocalScores((prev) => {
      const classEntries = [...(prev[classId] || [])];
      if (!classEntries[index])
        classEntries[index] = { score: '', studentName: '' };
      classEntries[index] = { ...classEntries[index], [field]: value };
      return { ...prev, [classId]: classEntries };
    });
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const resultsRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'results',
        'main'
      );
      await updateDoc(resultsRef, {
        [selectedEventId]: localScores,
      });
      setTimeout(() => setSaving(false), 500);
      showToast('儲存成功', 'success');
    } catch (e) {
      console.error(e);
      showToast('儲存失敗', 'error');
      setSaving(false);
    }
  };

  const handleClearClick = () => {
    if (confirmClear) {
      performClear();
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  };

  const performClear = async () => {
    setSaving(true);
    try {
      const resultsRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'results',
        'main'
      );
      await updateDoc(resultsRef, {
        [selectedEventId]: {},
      });
      setConfirmClear(false);
      showToast('清除成功', 'success');
    } catch (e) {
      console.error(e);
      showToast('清除失敗', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchImport = () => {
    if (!batchText.trim()) return;
    const names = batchText
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n !== '');

    let nameIndex = 0;
    const newScores = { ...localScores };

    const relevantClasses = config.classes.filter(
      (c) => c.grade === selectedGrade
    );

    relevantClasses.forEach((c) => {
      const classEntries = [...(newScores[c.id] || [])];
      const maxPart = selectedEvent?.maxParticipants || 1;
      
      while (classEntries.length < maxPart) {
        classEntries.push({ score: '', studentName: '' });
      }

      for (let i = 0; i < maxPart; i++) {
        if (nameIndex < names.length) {
          classEntries[i] = {
            ...classEntries[i],
            studentName: names[nameIndex],
          };
          nameIndex++;
        }
      }
      newScores[c.id] = classEntries;
    });

    setLocalScores(newScores);
    setShowBatchModal(false);
    setBatchText('');
    showToast('批次匯入完成', 'success');
  };

  const relevantClasses = config.classes.filter(
    (c) => c.grade === selectedGrade
  );

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Edit className="text-blue-600" /> 成績登錄
        </h2>
        {selectedEvent?.type === 'individual' && (
          <button
            onClick={() => setShowBatchModal(true)}
            className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-blue-200 transition"
          >
            <Clipboard size={14} /> 批次貼上姓名
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-1">
            選擇年級
          </label>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {([7, 8, 9] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGrade(g)}
                className={`flex-1 py-2 rounded-md font-bold text-sm transition ${
                  selectedGrade === g
                    ? 'bg-white shadow text-blue-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {g} 年級
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-1">
            選擇比賽項目
          </label>
          <select
            className="w-full border-slate-200 border-2 rounded-lg p-2.5 font-bold text-slate-700"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            {config.events.map((e) => (
              <option key={e.id} value={e.id}>
                {getEventDisplayName(e)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex text-xs text-slate-400 px-2 font-bold uppercase">
          <div className="w-16">班級</div>
          {selectedEvent?.type === 'individual' && (
            <div className="w-24 mr-2">姓名</div>
          )}
          <div className="flex-1">輸入{selectedEvent?.unit}</div>
        </div>

        {relevantClasses.map((c) => {
          const entries = localScores[c.id] || [];
          return (
            <div
              key={c.id}
              className="border border-slate-100 rounded-lg p-2 bg-slate-50/50"
            >
              {/* 這裡我們也加上了 ?. 和 || 1 的保護措施 */}
              {Array.from({ length: selectedEvent?.maxParticipants || 1 }).map(
                (_, idx) => {
                  const record = entries[idx] || { score: '', studentName: '' };
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 mb-2 last:mb-0"
                    >
                      <div className="w-16 font-bold text-lg text-slate-700 flex items-center gap-1">
                        {c.name}
                        {/* 這裡也一樣，檢查 ?.maxParticipants */}
                        {(selectedEvent?.maxParticipants || 1) > 1 && (
                          <span className="text-xs text-slate-400 bg-white px-1 rounded border">
                            #{idx + 1}
                          </span>
                        )}
                      </div>

                      {selectedEvent?.type === 'individual' && (
                        <input
                          type="text"
                          placeholder="姓名"
                          className="w-24 border rounded px-2 py-2 text-sm"
                          value={record.studentName || ''}
                          onChange={(e) =>
                            handleScoreChange(
                              c.id,
                              idx,
                              'studentName',
                              e.target.value
                            )
                          }
                        />
                      )}

                      <input
                        type="number"
                        step={selectedEvent?.unit === '名次' ? '1' : '0.01'}
                        min={selectedEvent?.unit === '名次' ? '1' : undefined}
                        placeholder={`輸入${selectedEvent?.unit || ''}`}
                        className="flex-1 border rounded px-3 py-2 font-mono text-lg font-bold text-blue-600"
                        value={record.score || ''}
                        onChange={(e) =>
                          handleScoreChange(c.id, idx, 'score', e.target.value)
                        }
                        onKeyDown={(e) => {
                           if (selectedEvent?.unit === '名次' && (e.key === '.' || e.key === 'e')) {
                             e.preventDefault();
                           }
                        }}
                      />
                    </div>
                  );
                }
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={saveAll}
        disabled={saving}
        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition transform active:scale-95 mb-4 ${
          saving ? 'bg-slate-400' : 'bg-green-600 hover:bg-green-500 text-white'
        }`}
      >
        {saving ? (
          '儲存中...'
        ) : (
          <>
            <Save /> 儲存變更
          </>
        )}
      </button>

      <div className="mt-8 pt-6 border-t border-slate-100">
        <button
          type="button"
          onClick={handleClearClick}
          disabled={saving}
          className={`w-full py-3 rounded-xl font-bold border-2 transition flex items-center justify-center gap-2 text-sm ${
            confirmClear
              ? 'bg-red-600 text-white border-red-600 animate-pulse'
              : 'text-red-500 border-red-100 hover:bg-red-50 hover:border-red-200'
          }`}
        >
          {confirmClear ? (
            <>⚠️ 確定要清除嗎？(再次點擊執行)</>
          ) : (
            <>
              <Trash2 size={16} /> 清除此項目 ({selectedEvent?.name}) 所有成績
            </>
          )}
        </button>
      </div>

      {showBatchModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-2xl flex flex-col h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                <FileText size={20} /> 批次匯入姓名
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="bg-blue-50 text-blue-700 text-xs p-3 rounded mb-3">
              請直接從 Excel
              複製該年級所有選手名單並貼上。系統將依照班級順序自動填入。
            </div>
            <textarea
              className="flex-1 w-full border p-3 rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm resize-none"
              placeholder={`王小明\n李小華\n陳大文...`}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
            />
            <button
              onClick={handleBatchImport}
              className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 transition"
            >
              匯入
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventEditRow({
  event,
  onUpdate,
  onRemove,
}: {
  event: SportEvent;
  onUpdate: (id: string, updates: Partial<SportEvent>) => void;
  onRemove: (id: string) => void;
}) {
  const [pointsStr, setPointsStr] = useState(
    (event.rankPoints || DEFAULT_POINTS).join(',')
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [maxPartStr, setMaxPartStr] = useState(
    String(event.maxParticipants || 1)
  );

  useEffect(() => {
    setPointsStr((event.rankPoints || DEFAULT_POINTS).join(','));
    setMaxPartStr(String(event.maxParticipants || 1));
  }, [event.rankPoints, event.maxParticipants]);

  const handlePointsBlur = () => {
    const points = parsePoints(pointsStr);
    onUpdate(event.id, { rankPoints: points });
    setPointsStr(points.join(','));
  };

  const handleMaxPartChange = (val: string) => {
    setMaxPartStr(val);
    const num = parseInt(val);
    if (!isNaN(num) && num > 0) {
      onUpdate(event.id, { maxParticipants: num });
    }
  };

  const handleMaxPartBlur = () => {
    if (!maxPartStr || parseInt(maxPartStr) <= 0) {
      setMaxPartStr(String(event.maxParticipants || 1));
      onUpdate(event.id, { maxParticipants: event.maxParticipants || 1 });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onRemove(event.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center gap-3 p-3 border rounded bg-white hover:bg-slate-50 transition animate-fade-in">
      <div className="flex items-center gap-3 flex-1 w-full">
        <span
          className={`text-xs px-2 py-1 rounded whitespace-nowrap ${
            event.type === 'group'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-orange-100 text-orange-700'
          }`}
        >
          {event.type === 'group' ? '團體' : '個人'}
        </span>
        <span className="font-bold text-slate-700 flex-1">
          {getEventDisplayName(event)}
        </span>
        <span className="text-xs text-slate-400 whitespace-nowrap">
          (
          {event.gender === 'Mixed'
            ? '混合'
            : event.gender === 'M'
            ? '男'
            : '女'}
          )
        </span>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0 flex-wrap md:flex-nowrap justify-end">
        {event.type === 'individual' && (
          <div className="flex items-center text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded border">
            <User size={12} className="mr-1" />
            <input
              type="number"
              min="1"
              max="10"
              className="w-8 bg-transparent text-center font-bold outline-none border-b border-slate-300 focus:border-blue-500"
              value={maxPartStr}
              onChange={(e) => handleMaxPartChange(e.target.value)}
              onBlur={handleMaxPartBlur}
            />
            人/班
          </div>
        )}
        <div className="flex items-center">
          <ListOrdered
            size={16}
            className="text-slate-400 hidden md:block mr-1"
          />
          <input
            type="text"
            className="border rounded px-2 py-2 text-xs font-mono w-32 md:w-48 text-slate-600 focus:ring-2 focus:ring-blue-200 outline-none"
            value={pointsStr}
            onChange={(e) => setPointsStr(e.target.value)}
            onBlur={handlePointsBlur}
            placeholder="積分: 7,5,4..."
            title="編輯積分 (逗號分隔，離開儲存)"
          />
        </div>
        <button
          type="button"
          onClick={handleDeleteClick}
          className={`p-2 rounded ml-1 flex items-center gap-1 transition-all duration-200 ${
            confirmDelete
              ? 'bg-red-600 text-white w-24 justify-center text-xs font-bold'
              : 'bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700 w-10 justify-center'
          }`}
          title="刪除"
        >
          {confirmDelete ? '確認刪除?' : <Trash2 size={18} />}
        </button>
      </div>
    </div>
  );
}

function AdminSettings({ config, showToast }: { config: AppConfig; showToast: (msg: string, type: 'success'|'error'|'info') => void }) {
  const [localConfig, setLocalConfig] = useState<AppConfig>(
    JSON.parse(JSON.stringify(config))
  );
  const [newEventName, setNewEventName] = useState('');
  const [newEventPoints, setNewEventPoints] = useState('7,5,4,3,2,1');
  const [eventType, setEventType] = useState<EventType>('group');
  const [gender, setGender] = useState<Gender>('Mixed');
  const [maxParticipants, setMaxParticipants] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const updateConfig = async () => {
    setIsSaving(true);
    try {
      const configRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'config',
        'main'
      );
      await setDoc(configRef, localConfig);
      setIsSaving(false);
      showToast('設定已更新', 'success');
    } catch (e) {
      showToast('更新失敗', 'error');
      setIsSaving(false);
    }
  };

  const parsePoints = (str: string) => {
    return str
      .split(/[,，]/)
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));
  };

  const addEvent = () => {
    if (!newEventName.trim()) {
      showToast('請輸入比賽項目名稱！', 'error');
      return;
    }
    const newId = `evt_${Date.now()}`;
    const points = parsePoints(newEventPoints);

    setLocalConfig((prev) => ({
      ...prev,
      events: [
        ...prev.events,
        {
          id: newId,
          name: newEventName,
          type: eventType,
          gender: gender,
          unit: '名次', // 修改: 新增項目一律使用名次
          sortBy: 'asc', // 修改: 排序一律為 asc (1 < 2)
          rankPoints: points.length > 0 ? points : DEFAULT_POINTS,
          maxParticipants: eventType === 'individual' ? maxParticipants : 1,
        },
      ],
    }));
    setNewEventName('');
  };

  const removeEvent = (id: string) => {
    setLocalConfig((prev) => ({
      ...prev,
      events: prev.events.filter((e) => e.id !== id),
    }));
  };

  const handleUpdateEvent = (id: string, updates: Partial<SportEvent>) => {
    setLocalConfig((prev) => ({
      ...prev,
      events: prev.events.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  };

  const addClass = (grade: Grade) => {
    const count = localConfig.classes.filter((c) => c.grade === grade).length;
    const nextNum = count + 1;
    const className = `${grade}0${nextNum}`;
    const newClass: ClassInfo = { id: className, name: className, grade };
    setLocalConfig((prev) => ({
      ...prev,
      classes: [...prev.classes, newClass].sort((a, b) =>
        a.id.localeCompare(b.id)
      ),
    }));
  };

  const removeLastClass = (grade: Grade) => {
    const gradeClasses = localConfig.classes.filter((c) => c.grade === grade);
    if (gradeClasses.length === 0) return;
    const lastClass = gradeClasses[gradeClasses.length - 1];
    setLocalConfig((prev) => ({
      ...prev,
      classes: prev.classes.filter((c) => c.id !== lastClass.id),
    }));
  };

  return (
    <div className="space-y-8">
      {/* Classes Config */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Users className="text-blue-500" /> 班級管理
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {([7, 8, 9] as const).map((grade) => (
            <div
              key={grade}
              className="bg-slate-50 p-4 rounded-lg border border-slate-100"
            >
              <h4 className="font-bold text-center mb-3 text-lg">
                {grade} 年級
              </h4>
              <div className="flex flex-wrap gap-2 mb-4 justify-center">
                {localConfig.classes
                  .filter((c) => c.grade === grade)
                  .map((c) => (
                    <span
                      key={c.id}
                      className="bg-white px-2 py-1 rounded shadow-sm text-sm border"
                    >
                      {c.name}
                    </span>
                  ))}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => removeLastClass(grade)}
                  className="flex-1 bg-red-100 text-red-600 py-2 rounded hover:bg-red-200 font-bold"
                >
                  - 減少
                </button>
                <button
                  type="button"
                  onClick={() => addClass(grade)}
                  className="flex-1 bg-blue-100 text-blue-600 py-2 rounded hover:bg-blue-200 font-bold"
                >
                  + 增加
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Events Config */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Trophy className="text-yellow-500" /> 比賽項目管理
        </h3>

        {/* Add New Event Form */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-6 p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <div className="md:col-span-3">
            <label className="text-xs font-bold text-slate-400 block mb-1">
              新項目名稱
            </label>
            <input
              type="text"
              placeholder="例如: 400m接力"
              className="w-full border p-2 rounded text-sm"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-bold text-slate-400 block mb-1">
              類型
            </label>
            <select
              className="w-full border p-2 rounded text-sm"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
            >
              <option value="group">團體賽</option>
              <option value="individual">個人賽</option>
            </select>
          </div>
          {eventType === 'individual' && (
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-400 block mb-1">
                每班人數
              </label>
              <input
                type="number"
                min="1"
                max="10"
                className="w-full border p-2 rounded text-sm"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(parseInt(e.target.value))}
              />
            </div>
          )}
          <div
            className={
              eventType === 'individual' ? 'md:col-span-2' : 'md:col-span-4'
            }
          >
            <label className="text-xs font-bold text-slate-400 block mb-1">
              積分設定 (逗號分隔)
            </label>
            <input
              type="text"
              placeholder="7,5,4,3,2,1"
              className="w-full border p-2 rounded text-sm font-mono"
              value={newEventPoints}
              onChange={(e) => setNewEventPoints(e.target.value)}
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              onClick={addEvent}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 flex items-center justify-center gap-1 text-sm font-bold shadow"
            >
              <Plus size={16} /> 新增
            </button>
          </div>
        </div>

        {/* Existing Events List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {localConfig.events.map((event) => (
            <EventEditRow
              key={event.id}
              event={event}
              onUpdate={handleUpdateEvent}
              onRemove={removeEvent}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end sticky bottom-0 bg-white p-4 border-t shadow-inner rounded-b-xl z-10">
        <button
          type="button"
          onClick={updateConfig}
          disabled={isSaving}
          className="bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-green-500 transition w-full md:w-auto flex items-center justify-center gap-2"
        >
          {isSaving ? (
            '儲存中...'
          ) : (
            <>
              <CheckCircle2 /> 儲存所有設定
            </>
          )}
        </button>
      </div>
    </div>
  );
}