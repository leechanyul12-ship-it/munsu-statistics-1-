import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import {
  Plus, Users, BarChart3, Table2, FileText, Trash2, ArrowLeft, CheckCircle2, Printer,
  ListOrdered, Sparkles, Send, QrCode, Lock, Unlock, ShieldCheck, Download, Heart,
  MessageSquare, Award, X, UserPlus, UserMinus, LogOut, AlertCircle, RefreshCw, ArrowRightLeft
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyCFph01cvdwbpf8Cwj2-eXf-lPHOB_857M",
  authDomain: "munsu-statistics.firebaseapp.com",
  projectId: "munsu-statistics",
  storageBucket: "munsu-statistics.firebasestorage.app",
  messagingSenderId: "727648531808",
  appId: "1:727648531808:web:8696140334355acefa5a05",
  measurementId: "G-Y2H0M1S7SG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TEACHER_PIN = '문수중12!';
const MAX_CLASS_STUDENTS = 29;
const MAX_GROUPS_PER_CLASS = 7;
const MAX_GROUP_MEMBERS = 5;
const MAX_SURVEY_RESPONSES = 25;
const MAX_USER_PARTICIPATIONS = 7;

const GUIDE_TEMPLATES = [
  { label: '최빈 계급 분석', text: '• 가장 도수가 큰 계급은 (   ) 이상 (   ) 미만으로, 전체의 (   )%를 차지한다.\n' },
  { label: '대표값 비교', text: '• 평균은 (   ), 중앙값은 (   )이며, 두 값의 차이를 볼 때 (평균/중앙값)이 자료를 더 잘 대표한다.\n' },
  { label: '전체 분포 특징', text: '• 전체적으로 자료가 (왼쪽/가운데/오른쪽) 계급에 몰려 있으며, 이를 통해 우리 반 학생들은 ~하다는 사실을 알 수 있다.\n' },
  { label: '구간 누적 비율 분석', text: '• (   ) 이상인 학생은 전체의 (   )%이며, 반대로 (   ) 미만인 학생은 (   )%를 차지한다.\n' },
  { label: '조사 결론 및 제언', text: '• 이번 통계 조사를 종합해 볼 때, 우리 반의 ~한 문제를 개선(또는 유지)하기 위해 ~할 필요가 있다.\n' }
];

function parseStudentId(rawId) {
  const clean = rawId.trim();
  if (!/^\d{4}$/.test(clean)) return null;
  const stuNum = Number(clean.slice(2, 4));
  if (stuNum < 1 || stuNum > 35) return null;
  return { studentId: clean, className: `${clean[1]}반` };
}

function computeStats(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / n).toFixed(1));
  const median = n % 2 === 1 ? sorted[Math.floor(n / 2)] : Number(((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(1));
  const freqMap = {};
  sorted.forEach((v) => { freqMap[v] = (freqMap[v] || 0) + 1; });
  const maxFreq = Math.max(...Object.values(freqMap));
  const modes = Object.keys(freqMap).filter((k) => freqMap[k] === maxFreq).map(Number);
  return {
    n, min: sorted[0], max: sorted[n - 1], range: Number((sorted[n - 1] - sorted[0]).toFixed(1)),
    mean, median, modeText: maxFreq === 1 && n > 1 ? '없음(모두 1회)' : `${modes.join(', ')} (${maxFreq}회)`
  };
}

function buildFreqTable(survey) {
  const values = (survey?.entries || []).map((e) => Number(e.value));
  if (values.length === 0) return [];
  const start = Number(survey.classStart) || 0;
  const width = Math.max(1, Number(survey.classWidth) || 10);
  const maxVal = Math.max(...values);
  const rows = [];
  let cur = start;
  while (cur <= maxVal || rows.length === 0) {
    const end = cur + width;
    const count = values.filter((v) => v >= cur && v < end).length;
    rows.push({ min: cur, max: end, mid: (cur + end) / 2, count, relFreq: Number((count / values.length).toFixed(2)) });
    cur = end;
    if (rows.length > 20) break;
  }
  return rows;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('munsu_stats_user')); } catch { return null; }
  });
  const [loginId, setLoginId] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginError, setLoginError] = useState('');

  const [surveys, setSurveys] = useState([]);
  const [classSettings, setClassSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [teacherClass, setTeacherClass] = useState('1반');

  const [groupName, setGroupName] = useState('');
  const [topic, setTopic] = useState('');
  const [unit, setUnit] = useState('');
  const [roomPin, setRoomPin] = useState('');

  useEffect(() => {
    const unsub1 = onSnapshot(query(collection(db, 'surveys'), orderBy('createdAt', 'asc')), (snap) => {
      setSurveys(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsub2 = onSnapshot(collection(db, 'classSettings'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => { map[d.id] = d.data(); });
      setClassSettings(map);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const resets = classSettings[currentUser.className]?.resetStudents || [];
    if (resets.includes(currentUser.studentId)) {
      alert('선생님에 의해 계정이 초기화되었습니다. 올바른 학번과 이름으로 다시 로그인해 주세요.');
      setCurrentUser(null);
      setSelectedId(null);
      setIsCreating(false);
      sessionStorage.removeItem('munsu_stats_user');
    }
  }, [classSettings, currentUser]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const parsed = parseStudentId(loginId);
    const cleanName = loginName.trim();
    if (!parsed) return setLoginError('학번은 4자리 숫자로 입력해 주세요. (예: 1212)');
    if (!/^[가-힣]{2,5}$/.test(cleanName)) return setLoginError('이름은 한글 2~5자로 입력해 주세요.');

    const clsSurveys = surveys.filter((s) => s.className === parsed.className);
    const known = new Map();
    clsSurveys.forEach((s) => {
      (s.memberList || []).forEach((m) => known.set(m.studentId, m.studentName));
      (s.entries || []).forEach((ent) => known.set(ent.studentId, ent.studentName));
    });

    if (known.has(parsed.studentId) && known.get(parsed.studentId) !== cleanName) {
      return setLoginError(`학번 [${parsed.studentId}]은 이미 [${known.get(parsed.studentId)}] 학생으로 등록되어 있습니다.`);
    }
    if (!known.has(parsed.studentId) && known.size >= MAX_CLASS_STUDENTS) {
      return setLoginError(`${parsed.className} 최대 정원(${MAX_CLASS_STUDENTS}명)이 초과되었습니다.`);
    }

    const resets = classSettings[parsed.className]?.resetStudents || [];
    if (resets.includes(parsed.studentId)) {
      await setDoc(doc(db, 'classSettings', parsed.className), {
        resetStudents: resets.filter((id) => id !== parsed.studentId)
      }, { merge: true });
    }

    const userObj = { studentId: parsed.studentId, studentName: cleanName, className: parsed.className };
    setCurrentUser(userObj);
    sessionStorage.setItem('munsu_stats_user', JSON.stringify(userObj));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedId(null);
    setIsCreating(false);
    setIsTeacherMode(false);
    sessionStorage.removeItem('munsu_stats_user');
  };

  const activeClass = isTeacherMode ? teacherClass : currentUser?.className || '1반';
  const classSurveys = useMemo(() => surveys.filter((s) => (s.className || '1반') === activeClass), [surveys, activeClass]);
  const myGroup = useMemo(() => {
    if (!currentUser) return null;
    return classSurveys.find((s) => (s.memberList || []).some((m) => m.studentId === currentUser.studentId)) || null;
  }, [classSurveys, currentUser]);

  const currentPhase = classSettings[activeClass]?.phase || 1;
  const currentSurvey = useMemo(() => surveys.find((s) => s.id === selectedId) || null, [surveys, selectedId]);

  const myPartStats = useMemo(() => {
    if (!currentUser) return { totalAnswered: 0, openLeft: 0 };
    const totalAnswered = classSurveys.filter((s) => (s.entries || []).some((e) => e.studentId === currentUser.studentId)).length;
    const openLeft = classSurveys.filter((s) => {
      const ents = s.entries || [];
      const already = ents.some((e) => e.studentId === currentUser.studentId);
      const closed = s.isLocked || ents.length >= MAX_SURVEY_RESPONSES || currentPhase === 2;
      return !already && !closed;
    }).length;
    return { totalAnswered, openLeft };
  }, [classSurveys, currentUser, currentPhase]);

  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    if (!currentUser || myGroup) return;
    if (classSurveys.length >= MAX_GROUPS_PER_CLASS) {
      return alert(`우리 반은 최대 ${MAX_GROUPS_PER_CLASS}개 모둠까지만 개설할 수 있습니다.`);
    }
    const randomGraphMission = Math.random() < 0.5 ? 'hist' : 'poly';
    const docRef = await addDoc(collection(db, 'surveys'), {
      className: currentUser.className,
      groupName: groupName.trim(),
      leaderId: currentUser.studentId,
      memberList: [{ studentId: currentUser.studentId, studentName: currentUser.studentName, role: '모둠장' }],
      topic: topic.trim(),
      unit: unit.trim(),
      pin: roomPin.trim(),
      isLocked: false,
      entries: [],
      classStart: 0,
      classWidth: 10,
      randomGraphMission,
      missionStatus: { stem: false, table: false, hist: false, poly: false },
      interpretation: '',
      rubricAnalysis: 20,
      individualSubmissions: [],
      likes: 0,
      comments: [],
      createdAt: serverTimestamp()
    });
    setGroupName(''); setTopic(''); setUnit(''); setRoomPin('');
    setIsCreating(false);
    setSelectedId(docRef.id);
  };

  const handleJoinGroup = async (survey, e) => {
    e.stopPropagation();
    if (!currentUser || myGroup) return;
    const members = survey.memberList || [];
    if (members.length >= MAX_GROUP_MEMBERS) return alert(`모둠 정원(${MAX_GROUP_MEMBERS}명)이 가득 찼습니다.`);
    const pin = window.prompt(`[${survey.groupName}] 합류 비밀번호를 입력하세요.`);
    if (pin !== survey.pin && pin !== TEACHER_PIN) return pin !== null && alert('비밀번호 불일치');
    await updateDoc(doc(db, 'surveys', survey.id), {
      memberList: [...members, { studentId: currentUser.studentId, studentName: currentUser.studentName, role: '모둠원' }]
    });
    setSelectedId(survey.id);
  };

  const handleDeleteSurvey = async (survey, e) => {
    e.stopPropagation();
    const pin = window.prompt(`[${survey.groupName}] 삭제 비밀번호를 입력하세요.`);
    if (pin !== survey.pin && pin !== TEACHER_PIN) return pin !== null && alert('비밀번호 불일치');
    if (!window.confirm('정말 이 모둠의 모든 자료를 삭제할까요?')) return;
    await deleteDoc(doc(db, 'surveys', survey.id));
    if (selectedId === survey.id) setSelectedId(null);
  };

  const handleOpenTeacherMode = () => {
    if (isTeacherMode) return setIsTeacherMode(false);
    const pin = window.prompt('교사 관리자 비밀번호를 입력하세요.');
    if (pin === TEACHER_PIN) { setIsTeacherMode(true); setSelectedId(null); setIsCreating(false); }
    else if (pin !== null) alert('비밀번호가 틀렸습니다.');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-600">불러오는 중...</div>;

  if (!currentUser && !isTeacherMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600"><BarChart3 className="w-7 h-7" /></div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">문수중 통계 수행평가</h1>
                <p className="text-xs text-slate-500">중학교 1학년 수학 · 자료의 정리와 해석</p>
              </div>
            </div>
            <button onClick={handleOpenTeacherMode} className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 교사
            </button>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-5 text-xs text-indigo-900 space-y-1">
            <p className="font-bold">📌 접속 안내</p>
            <p>• <strong>학번(4자리)</strong>과 <strong>이름</strong>을 입력하면 해당 반으로 자동 입장됩니다.</p>
            <p>• 2차시 수업에서도 동일 학번·이름으로 로그인하면 내 모둠 기록이 이어집니다.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="text" inputMode="numeric" maxLength={4} required placeholder="학번 4자리 (예: 1212)" value={loginId} onChange={(e) => setLoginId(e.target.value)} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base font-bold" />
            <input type="text" required placeholder="이름 (예: 홍길동)" value={loginName} onChange={(e) => setLoginName(e.target.value)} className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base font-bold" />
            {loginError && <div className="bg-rose-50 text-rose-700 text-xs font-semibold p-3 rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{loginError}</div>}
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-base shadow-md">수행평가 입장하기 →</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-indigo-600 text-white shadow-sm no-print">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => { setSelectedId(null); setIsCreating(false); }}>
            <BarChart3 className="w-7 h-7 text-indigo-200" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">중1 수학 통계 수행평가</h1>
                <span className="text-xs font-extrabold bg-white/20 px-2 py-0.5 rounded">
                  {activeClass} · {currentPhase === 1 ? '1차시: 조사·수집' : '2차시: 정리·평가'}
                </span>
              </div>
              {currentUser && <p className="text-xs text-indigo-100">접속자: <strong>{currentUser.studentId} {currentUser.studentName}</strong> {myGroup ? `(${myGroup.groupName})` : '(미지정)'}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowQrModal(true)} className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-400 px-3 py-2 rounded-lg text-xs font-semibold"><QrCode className="w-4 h-4" /> QR</button>
            <button onClick={handleOpenTeacherMode} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold ${isTeacherMode ? 'bg-amber-400 text-slate-900' : 'bg-indigo-800 text-indigo-100'}`}>
              <ShieldCheck className="w-4 h-4" /> {isTeacherMode ? '교사 종료' : '교사 관리'}
            </button>
            {currentUser && <button onClick={handleLogout} className="flex items-center gap-1 bg-indigo-700 px-3 py-2 rounded-lg text-xs font-semibold"><LogOut className="w-3.5 h-3.5" /> 나가기</button>}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {isTeacherMode && (
          <TeacherDashboard teacherClass={teacherClass} setTeacherClass={setTeacherClass} surveys={classSurveys} allSurveys={surveys} currentPhase={currentPhase} classSettings={classSettings} />
        )}

        {!isTeacherMode && currentUser && !isCreating && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center justify-between gap-4 shadow-sm no-print">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="font-bold text-slate-500">내 모둠: </span>
                {myGroup ? (
                  <button onClick={() => setSelectedId(myGroup.id)} className="font-extrabold text-indigo-600 underline">{myGroup.groupName} 바로가기 →</button>
                ) : <span className="text-rose-600 font-bold">미지정 (모둠 개설 또는 합류 필요)</span>}
              </div>
              <div>
                <span className="font-bold text-slate-500">설문 참여: </span>
                <strong className="text-emerald-600">{myPartStats.totalAnswered}회 완료</strong>
                <span className="text-slate-400 ml-1">(6회 이상 또는 남은 빈방 모두 참여 시 만점)</span>
              </div>
              {myGroup && (
                <div className="flex flex-wrap gap-1">
                  <Badge label="줄기와잎" done={myGroup.missionStatus?.stem} />
                  <Badge label="도수분포표" done={myGroup.missionStatus?.table} />
                  <Badge label={myGroup.randomGraphMission === 'poly' ? '다각형(랜덤)' : '히스토그램(랜덤)'} done={myGroup.missionStatus?.[myGroup.randomGraphMission || 'hist']} />
                </div>
              )}
            </div>
            {!selectedId && !myGroup && currentPhase === 1 && classSurveys.length < MAX_GROUPS_PER_CLASS && (
              <button onClick={() => setIsCreating(true)} className="flex items-center gap-1.5 bg-indigo-600 text-white font-bold px-4 py-2 rounded-xl text-xs shadow">
                <Plus className="w-4 h-4" /> 새 모둠·주제 만들기
              </button>
            )}
          </div>
        )}

        {!isTeacherMode && isCreating && currentUser && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-6">
            <button onClick={() => setIsCreating(false)} className="flex items-center gap-1 text-sm text-slate-500 mb-4"><ArrowLeft className="w-4 h-4" /> 돌아가기</button>
            <h2 className="text-xl font-bold mb-2">[{currentUser.className}] 새 모둠 개설 ({classSurveys.length + 1}/{MAX_GROUPS_PER_CLASS}모둠)</h2>
            {classSurveys.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900">
                <p className="font-bold mb-1">⚠️ 이미 등록된 우리 반 주제 (중복 회피):</p>
                {classSurveys.map((s) => <div key={s.id}>• {s.groupName}: {s.topic}</div>)}
              </div>
            )}
            <form onSubmit={handleCreateSurvey} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" required placeholder="모둠 이름 (예: 1모둠)" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
                <input type="text" required maxLength={6} placeholder="방 비밀번호 (4자리)" value={roomPin} onChange={(e) => setRoomPin(e.target.value)} className="border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
              </div>
              <input type="text" required placeholder="조사 주제 (예: 하루 평균 스마트폰 사용 시간)" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
              <input type="text" required placeholder="단위 (예: 분, 회, 권)" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm" />
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm">모둠 방 생성하기</button>
            </form>
          </div>
        )}

        {!isTeacherMode && !isCreating && !currentSurvey && currentUser && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">{currentUser.className} 모둠 목록 ({classSurveys.length}/{MAX_GROUPS_PER_CLASS}모둠)</h2>
              <span className="text-xs text-slate-500">모둠당 최대 {MAX_SURVEY_RESPONSES}명 컷 · 인당 최대 {MAX_USER_PARTICIPATIONS}회 참여</span>
            </div>
            {classSurveys.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-4">아직 개설된 모둠이 없습니다.</p>
                {currentPhase === 1 && <button onClick={() => setIsCreating(true)} className="bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm">+ 새 모둠·주제 만들기</button>}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classSurveys.map((s) => {
                  const entries = s.entries || [];
                  const members = s.memberList || [];
                  const isMyGroup = members.some((m) => m.studentId === currentUser.studentId);
                  const iAnswered = entries.some((ent) => ent.studentId === currentUser.studentId);
                  const isFull = entries.length >= MAX_SURVEY_RESPONSES;
                  return (
                    <div key={s.id} onClick={() => setSelectedId(s.id)} className={`bg-white rounded-2xl border p-5 hover:shadow-md transition cursor-pointer flex flex-col justify-between ${isMyGroup ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded">{s.groupName} ({members.length}/{MAX_GROUP_MEMBERS}명)</span>
                            {isMyGroup && <span className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 rounded">내 모둠</span>}
                            {iAnswered ? <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">✓ 참여완료</span> : (!isFull && !s.isLocked && currentPhase === 1 && <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded">미참여</span>)}
                            {(s.isLocked || isFull || currentPhase === 2) && <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded flex items-center gap-1"><Lock className="w-3 h-3" /> {isFull ? '25명 마감' : '마감'}</span>}
                          </div>
                          <button onClick={(e) => handleDeleteSurvey(s, e)} className="text-slate-400 hover:text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">{s.topic}</h3>
                        <p className="text-xs text-slate-500 mb-3">모둠원: {members.map((m) => `${m.studentId} ${m.studentName}`).join(', ')}</p>
                      </div>
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-slate-600">
                          <span>응답: <strong className="text-indigo-600">{entries.length}/{MAX_SURVEY_RESPONSES}명</strong></span>
                          <span className="flex items-center gap-0.5 text-rose-500"><Heart className="w-3.5 h-3.5 fill-rose-500" /> {s.likes || 0}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {!myGroup && members.length < MAX_GROUP_MEMBERS && currentPhase === 1 && (
                            <button onClick={(e) => handleJoinGroup(s, e)} className="flex items-center gap-1 bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg"><UserPlus className="w-3.5 h-3.5" /> 모둠 합류</button>
                          )}
                          <span className="text-indigo-600 font-bold text-sm">입장 →</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!isTeacherMode && !isCreating && currentSurvey && currentUser && (
          <SurveyWorkspace survey={currentSurvey} classSurveys={classSurveys} currentUser={currentUser} currentPhase={currentPhase} myTotalAnswered={myPartStats.totalAnswered} onBack={() => setSelectedId(null)} />
        )}
      </main>

      {showQrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center relative">
            <button onClick={() => setShowQrModal(false)} className="absolute right-4 top-4 text-slate-400"><X className="w-5 h-5" /></button>
            <h3 className="font-bold text-lg mb-3">학생 접속용 QR코드</h3>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(window.location.href)}`} alt="QR" className="w-52 h-52 mx-auto mb-3 border rounded-xl p-2" />
            <p className="text-xs text-slate-600 break-all bg-slate-100 p-2 rounded font-mono">{window.location.href}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   원 자료 상단 참고 패널 (2번 줄기와 잎, 3번 표·그래프 탭 공통 표시)
   ========================================================= */
function RawDataReferencePanel({ entries, unit }) {
  const [sortAsc, setSortAsc] = useState(true);
  if (!entries || entries.length === 0) return null;

  const list = useMemo(() => {
    const arr = entries.map((e) => Number(e.value));
    return sortAsc ? arr.sort((a, b) => a - b) : arr;
  }, [entries, sortAsc]);

  return (
    <div className="bg-slate-100/90 border border-slate-300 rounded-2xl p-4 mb-5 no-print">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold bg-slate-800 text-white px-2.5 py-0.5 rounded">
            📋 수집된 원 자료 ({entries.length}명)
          </span>
          <span className="text-xs text-slate-500">아래 수치를 보며 표와 그래프를 완성하세요</span>
        </div>
        <button
          type="button"
          onClick={() => setSortAsc(!sortAsc)}
          className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition ${
            sortAsc
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {sortAsc ? '✓ 작은 값부터 정렬됨' : '입력 순서대로 보기'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((val, i) => (
          <span
            key={i}
            className="bg-white border border-slate-300 px-2.5 py-1 rounded-lg text-xs font-extrabold text-slate-800 shadow-2xs"
          >
            {val}{unit}
          </span>
        ))}
      </div>
    </div>
  );
}

function SurveyWorkspace({ survey, classSurveys, currentUser, currentPhase, myTotalAnswered, onBack }) {
  const [activeTab, setActiveTab] = useState('vote');
  const [singleVal, setSingleVal] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [classStart, setClassStart] = useState(survey.classStart ?? 0);
  const [classWidth, setClassWidth] = useState(survey.classWidth ?? 10);
  const [interpretation, setInterpretation] = useState(survey.interpretation ?? '');
  const [savedNotice, setSavedNotice] = useState(false);
  const [commentInput, setCommentInput] = useState('');

  useEffect(() => {
    setClassStart(survey.classStart ?? 0);
    setClassWidth(survey.classWidth ?? 10);
    setInterpretation(survey.interpretation ?? '');
  }, [survey.id, survey.classStart, survey.classWidth, survey.interpretation]);

  const entries = survey.entries || [];
  const members = survey.memberList || [];
  const values = useMemo(() => entries.map((e) => Number(e.value)), [entries]);
  const isMember = members.some((m) => m.studentId === currentUser.studentId);
  const isLeader = survey.leaderId === currentUser.studentId;
  const isSurveyClosed = survey.isLocked || entries.length >= MAX_SURVEY_RESPONSES || currentPhase === 2;
  const randomGraphMission = survey.randomGraphMission || 'hist';
  const missionStatus = survey.missionStatus || {};

  const handleToggleLock = async () => {
    if (currentPhase === 2) return alert('2차시 단계에서는 투표를 다시 열 수 없습니다.');
    const pin = window.prompt('비밀번호를 입력하세요.');
    if (pin !== survey.pin && pin !== TEACHER_PIN) return pin !== null && alert('비밀번호 불일치');
    await updateDoc(doc(db, 'surveys', survey.id), { isLocked: !survey.isLocked });
  };

  const handleKickMember = async (target) => {
    if (target.studentId === survey.leaderId) return alert('모둠장은 강퇴할 수 없습니다.');
    const pin = window.prompt(`[${target.studentName}] 강퇴 비밀번호를 입력하세요.`);
    if (pin !== survey.pin && pin !== TEACHER_PIN) return pin !== null && alert('비밀번호 불일치');
    await updateDoc(doc(db, 'surveys', survey.id), {
      memberList: members.filter((m) => m.studentId !== target.studentId),
      individualSubmissions: (survey.individualSubmissions || []).filter((s) => s.studentId !== target.studentId)
    });
  };

  const handleAddVote = async (e) => {
    e.preventDefault();
    if (isSurveyClosed || entries.length >= MAX_SURVEY_RESPONSES) return alert('마감된 설문입니다.');
    if (myTotalAnswered >= MAX_USER_PARTICIPATIONS) return alert(`인당 최대 ${MAX_USER_PARTICIPATIONS}회까지만 참여 가능합니다.`);
    const num = Number(singleVal);
    if (singleVal.trim() === '' || isNaN(num)) return;
    if (entries.some((item) => item.studentId === currentUser.studentId)) return alert('이미 응답했습니다.');
    await updateDoc(doc(db, 'surveys', survey.id), {
      entries: [...entries, { studentId: currentUser.studentId, studentName: currentUser.studentName, value: num }]
    });
    setSingleVal('');
  };

  const handleRemoveEntry = async (idx) => {
    const pin = window.prompt('응답 삭제 비밀번호를 입력하세요.');
    if (pin !== survey.pin && pin !== TEACHER_PIN) return pin !== null && alert('비밀번호 불일치');
    await updateDoc(doc(db, 'surveys', survey.id), { entries: entries.filter((_, i) => i !== idx) });
  };

  const handleSaveClassSetting = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      classStart: Number(classStart),
      classWidth: Math.max(1, Number(classWidth)),
      missionStatus: { stem: missionStatus.stem || false, table: false, hist: false, poly: false }
    });
    setSavedNotice(true); setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleSaveInterpretation = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), { interpretation });
    setSavedNotice(true); setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleCompleteMission = async (key) => {
    if (!missionStatus[key]) await updateDoc(doc(db, 'surveys', survey.id), { [`missionStatus.${key}`]: true });
  };

  const stats = useMemo(() => computeStats(values), [values]);
  const stemAndLeaf = useMemo(() => {
    if (values.length === 0) return [];
    const map = {};
    values.forEach((v) => {
      const iv = Math.floor(Math.abs(v));
      const stem = Math.floor(iv / 10);
      if (!map[stem]) map[stem] = [];
      map[stem].push(iv % 10);
    });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map((stem) => ({ stem, leaves: map[stem].sort((a, b) => a - b) }));
  }, [values]);

  const freqTable = useMemo(() => buildFreqTable({ ...survey, classStart, classWidth }), [survey, classStart, classWidth]);
  const displayedEntries = useMemo(() => {
    const idxed = entries.map((item, idx) => ({ ...item, idx }));
    return sortAsc ? idxed.sort((a, b) => Number(a.value) - Number(b.value)) : idxed;
  }, [entries, sortAsc]);

  const iAlreadyVoted = entries.some((item) => item.studentId === currentUser.studentId);

  return (
    <div>
      <div className="mb-5 no-print">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 mb-3"><ArrowLeft className="w-4 h-4" /> 목록으로</button>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded">{survey.className} · {survey.groupName}</span>
                <button onClick={handleToggleLock} className={`text-xs font-bold px-2.5 py-0.5 rounded flex items-center gap-1 ${isSurveyClosed ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {isSurveyClosed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />} {isSurveyClosed ? '마감됨' : '진행 중'}
                </button>
              </div>
              <h2 className="text-xl font-bold">{survey.topic}</h2>
              <p className="text-xs text-slate-500">단위: {survey.unit} · 응답: {values.length}/{MAX_SURVEY_RESPONSES}명</p>
            </div>
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl">
              <TabBtn active={activeTab === 'vote'} onClick={() => setActiveTab('vote')} icon={<Send className="w-3.5 h-3.5" />} label="1. 설문" />
              <TabBtn active={activeTab === 'stem'} onClick={() => setActiveTab('stem')} icon={<ListOrdered className="w-3.5 h-3.5" />} label="2. 줄기와잎" />
              <TabBtn active={activeTab === 'freq'} onClick={() => setActiveTab('freq')} icon={<Table2 className="w-3.5 h-3.5" />} label="3. 표·그래프" />
              <TabBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText className="w-3.5 h-3.5" />} label="4. 보고서" />
              {isMember && <TabBtn active={activeTab === 'individual'} onClick={() => setActiveTab('individual')} icon={<Award className="w-3.5 h-3.5" />} label="5. 개인평가" />}
            </div>
          </div>
          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-500">모둠원:</span>
              {members.map((m) => (
                <span key={m.studentId} className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {m.studentId} {m.studentName}
                  {(isLeader || isMember) && m.studentId !== survey.leaderId && (
                    <button onClick={() => handleKickMember(m)} className="text-rose-500 ml-0.5"><UserMinus className="w-3.5 h-3.5" /></button>
                  )}
                </span>
              ))}
            </div>
            {isMember && <span className="text-indigo-700 font-bold">🎯 직접 제작: 줄기와잎(필수) + 도수분포표(필수) + {randomGraphMission === 'poly' ? '다각형(랜덤)' : '히스토그램(랜덤)'}</span>}
          </div>
        </div>
      </div>

      {activeTab === 'vote' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-base mb-2">내 응답 제출하기</h3>
            {iAlreadyVoted ? (
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl text-xs font-bold">✓ 이미 응답했습니다!</div>
            ) : isSurveyClosed ? (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-xs font-bold">마감된 설문입니다.</div>
            ) : myTotalAnswered >= MAX_USER_PARTICIPATIONS ? (
              <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-xs font-bold">최대 {MAX_USER_PARTICIPATIONS}회 참여 완료</div>
            ) : (
              <form onSubmit={handleAddVote} className="flex gap-2">
                <input type="number" step="any" required placeholder={`숫자 (${survey.unit})`} value={singleVal} onChange={(e) => setSingleVal(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold" />
                <button type="submit" className="bg-indigo-600 text-white font-bold px-4 py-2 rounded-lg text-sm shrink-0">제출</button>
              </form>
            )}
          </div>
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base">수집된 자료 ({entries.length}/{MAX_SURVEY_RESPONSES}명)</h3>
              <button onClick={() => setSortAsc(!sortAsc)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border">{sortAsc ? '✓ 크기순 정렬됨' : '크기순 정렬'}</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {displayedEntries.map((item) => (
                <button key={`${item.idx}-${item.studentId}`} onClick={() => handleRemoveEntry(item.idx)} className="bg-slate-100 hover:bg-rose-50 border px-3 py-1.5 rounded-xl text-left">
                  <span className="block text-[10px] text-slate-400">{item.studentId} {item.studentName}</span>
                  <span className="font-bold text-sm">{item.value}{survey.unit}</span>
                </button>
              ))}
            </div>
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
                <StatBox label="인원" value={`${stats.n}명`} />
                <StatBox label="평균" value={`${stats.mean}${survey.unit}`} />
                <StatBox label="중앙값" value={`${stats.median}${survey.unit}`} />
                <StatBox label="최빈값" value={stats.modeText} />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'stem' && (
        <div>
          <RawDataReferencePanel entries={entries} unit={survey.unit} />
          <StemSection survey={survey} stemAndLeaf={stemAndLeaf} isMember={isMember} isCompleted={!!missionStatus.stem} onComplete={() => handleCompleteMission('stem')} />
        </div>
      )}

      {activeTab === 'freq' && (
        <div className="space-y-6">
          <RawDataReferencePanel entries={entries} unit={survey.unit} />
          {isMember && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1">첫 계급 시작값</label>
                  <input type="number" value={classStart} onChange={(e) => setClassStart(Number(e.target.value))} className="w-24 border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1">계급의 크기</label>
                  <input type="number" min={1} value={classWidth} onChange={(e) => setClassWidth(Math.max(1, Number(e.target.value)))} className="w-24 border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <button onClick={handleSaveClassSetting} className="bg-indigo-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">계급 확정</button>
                {savedNotice && <span className="text-xs text-emerald-600 font-bold">✓ 저장됨</span>}
              </div>
              {stats && <p className="text-xs text-slate-500">최솟값: <strong>{stats.min}</strong> / 최댓값: <strong>{stats.max}</strong></p>}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FreqTableSection survey={survey} freqTable={freqTable} totalCount={values.length} isMember={isMember} isCompleted={!!missionStatus.table} onComplete={() => handleCompleteMission('table')} />
            <GraphSection survey={survey} freqTable={freqTable} isMember={isMember} randomGraphMission={randomGraphMission} isHistCompleted={!!missionStatus.hist} isPolyCompleted={!!missionStatus.poly} onCompleteHist={() => handleCompleteMission('hist')} onCompletePoly={() => handleCompleteMission('poly')} />
          </div>
        </div>
      )}

      {activeTab === 'report' && (
        <div className="space-y-6">
          {isMember && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 no-print">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-1.5"><Sparkles className="w-5 h-5 text-indigo-600" /> 모둠 자료 해석 작성 (가이드 5종)</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {GUIDE_TEMPLATES.map((tpl) => (
                  <button key={tpl.label} type="button" onClick={() => setInterpretation((p) => p + tpl.text)} className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg border border-indigo-200">+ {tpl.label}</button>
                ))}
              </div>
              <textarea rows={5} value={interpretation} onChange={(e) => setInterpretation(e.target.value)} placeholder="자료 해석을 작성하세요..." className="w-full border rounded-xl p-3 text-sm mb-3" />
              <div className="flex justify-between">
                <button onClick={handleSaveInterpretation} className="bg-indigo-600 text-white font-semibold px-5 py-2 rounded-xl text-sm">해석 저장하기 {savedNotice && '✓'}</button>
                <button onClick={() => window.print()} className="bg-slate-800 text-white font-semibold px-5 py-2 rounded-xl text-sm flex items-center gap-1"><Printer className="w-4 h-4" /> 인쇄/PDF</button>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border-2 border-slate-300 p-8">
            <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
              <div>
                <p className="text-xs font-bold text-indigo-600">중1 수학 통계 수행평가 보고서 ({survey.className})</p>
                <h2 className="text-2xl font-extrabold">{survey.topic}</h2>
              </div>
              <div className="text-right text-sm">
                <p className="font-bold">{survey.groupName}</p>
                <p className="text-xs text-slate-600">{members.map((m) => `${m.studentId} ${m.studentName}`).join(', ')}</p>
              </div>
            </div>
            {stats && (
              <div className="grid grid-cols-4 gap-3 mb-6">
                <StatBox label="조사 인원" value={`${stats.n}명`} />
                <StatBox label="평균" value={`${stats.mean}${survey.unit}`} />
                <StatBox label="중앙값" value={`${stats.median}${survey.unit}`} />
                <StatBox label="최빈값" value={stats.modeText} />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h4 className="font-bold text-sm mb-2">1. 도수분포표</h4>
                <table className="w-full text-xs text-center border border-slate-400">
                  <thead className="bg-slate-100 font-bold border-b border-slate-400">
                    <tr><th className="py-1.5 border-r">계급</th><th className="py-1.5 border-r">계급값</th><th className="py-1.5 border-r">도수</th><th className="py-1.5">상대도수</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {freqTable.map((r, i) => <tr key={i}><td className="py-1 border-r">{r.min}~{r.max}</td><td className="py-1 border-r">{r.mid}</td><td className="py-1 border-r font-bold">{r.count}</td><td className="py-1">{r.relFreq.toFixed(2)}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="font-bold text-sm mb-2">2. 히스토그램 & 도수분포다각형</h4>
                <ChartSvg rows={freqTable} unit={survey.unit} showHist={true} showPoly={true} />
              </div>
            </div>
            <div>
              <h4 className="font-bold text-sm mb-2">3. 모둠 자료 해석</h4>
              <div className="min-h-[100px] border rounded-xl p-4 bg-slate-50 text-sm whitespace-pre-wrap">{interpretation || '미작성'}</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border p-5 no-print">
            <div className="flex justify-between mb-3">
              <h4 className="font-bold text-sm flex items-center gap-1"><MessageSquare className="w-4 h-4 text-indigo-600" /> 친구들 피드백</h4>
              <button onClick={() => updateDoc(doc(db, 'surveys', survey.id), { likes: (survey.likes || 0) + 1 })} className="bg-rose-50 text-rose-600 font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1"><Heart className="w-3.5 h-3.5 fill-rose-500" /> {survey.likes || 0}</button>
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); if (!commentInput.trim()) return; await updateDoc(doc(db, 'surveys', survey.id), { comments: [...(survey.comments || []), `${currentUser.studentName}: ${commentInput.trim()}`] }); setCommentInput(''); }} className="flex gap-2 mb-3">
              <input type="text" placeholder="피드백 입력..." value={commentInput} onChange={(e) => setCommentInput(e.target.value)} className="w-full border rounded-lg px-3 py-1.5 text-sm" />
              <button type="submit" className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-sm shrink-0">등록</button>
            </form>
            <div className="space-y-1.5">{(survey.comments || []).map((c, i) => <div key={i} className="bg-slate-50 border rounded-lg px-3 py-1.5 text-xs">{c}</div>)}</div>
          </div>
        </div>
      )}

      {activeTab === 'individual' && isMember && (
        <IndividualTab survey={survey} classSurveys={classSurveys} currentUser={currentUser} currentPhase={currentPhase} stats={stats} freqTable={freqTable} />
      )}
    </div>
  );
}

function StemSection({ survey, stemAndLeaf, isMember, isCompleted, onComplete }) {
  const [userLeaves, setUserLeaves] = useState({});
  const [err, setErr] = useState('');
  if (stemAndLeaf.length === 0) return <div className="bg-white rounded-2xl border p-10 text-center text-slate-400 text-sm">먼저 설문 자료를 입력해 주세요.</div>;
  if (isCompleted || !isMember) {
    return (
      <div className="bg-white rounded-2xl border p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">줄기와 잎 그림 {isCompleted && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full ml-2">✓ 필수 통과(6점)</span>}</h3>
          <span className="text-xs bg-amber-50 text-amber-800 px-3 py-1 rounded-lg">범례: {stemAndLeaf[0].stem} | {stemAndLeaf[0].leaves[0]} = {stemAndLeaf[0].stem * 10 + stemAndLeaf[0].leaves[0]}{survey.unit}</span>
        </div>
        <table className="max-w-md mx-auto w-full text-center border rounded-xl overflow-hidden">
          <thead className="bg-indigo-50 font-bold text-sm border-b"><tr><th className="w-24 py-2.5 border-r-2 border-indigo-400">줄기</th><th className="py-2.5 text-left pl-6">잎</th></tr></thead>
          <tbody className="divide-y">{stemAndLeaf.map((r) => <tr key={r.stem}><td className="py-2.5 font-bold text-indigo-700 border-r-2 border-indigo-400 bg-slate-50">{r.stem}</td><td className="py-2.5 text-left pl-6 tracking-[0.4em] font-medium">{r.leaves.join(' ')}</td></tr>)}</tbody>
        </table>
      </div>
    );
  }
  const check = () => {
    for (const r of stemAndLeaf) {
      const arr = (userLeaves[r.stem] || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (arr.length !== r.leaves.length || arr.some((v, i) => v !== r.leaves[i])) return setErr(`줄기 [${r.stem}]의 잎 숫자 또는 크기순 정렬을 확인하세요.`);
    }
    setErr(''); onComplete(); alert('줄기와 잎 그림 필수 미션 통과!');
  };
  return (
    <div className="bg-white rounded-2xl border-2 border-amber-400 p-6">
      <span className="text-xs font-extrabold bg-amber-500 text-white px-2.5 py-0.5 rounded">필수 직접 제작 (6점)</span>
      <h3 className="font-bold text-lg mt-1 mb-1">줄기와 잎 그림 직접 완성하기</h3>
      <p className="text-xs text-slate-500 mb-4">각 줄기의 잎(일의 자리)을 작은 값부터 띄어쓰기로 입력하세요. (예: 1 3 5)</p>
      <table className="max-w-md mx-auto w-full text-center border mb-4">
        <thead className="bg-indigo-50 font-bold text-sm border-b"><tr><th className="w-24 py-2 border-r-2 border-indigo-400">줄기</th><th className="py-2 text-left pl-4">잎 입력</th></tr></thead>
        <tbody className="divide-y">{stemAndLeaf.map((r) => <tr key={r.stem}><td className="py-2 font-bold border-r-2 border-indigo-400 bg-slate-50">{r.stem}</td><td className="p-2"><input type="text" value={userLeaves[r.stem] || ''} onChange={(e) => setUserLeaves({ ...userLeaves, [r.stem]: e.target.value })} className="w-full border rounded px-3 py-1 text-sm font-mono" /></td></tr>)}</tbody>
      </table>
      {err && <p className="text-center text-xs font-bold text-rose-600 mb-2">{err}</p>}
      <div className="text-center"><button onClick={check} className="bg-indigo-600 text-white font-bold px-6 py-2 rounded-xl text-sm">정답 확인</button></div>
    </div>
  );
}

function FreqTableSection({ survey, freqTable, totalCount, isMember, isCompleted, onComplete }) {
  const [inputs, setInputs] = useState({});
  const [err, setErr] = useState('');
  if (freqTable.length === 0) return <div className="bg-white rounded-2xl border p-5 text-center text-slate-400 text-sm">자료 없음</div>;
  if (isCompleted || !isMember) {
    return (
      <div className="bg-white rounded-2xl border p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-base">도수분포표 및 상대도수</h3>
          {isCompleted && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">✓ 필수 통과(7점)</span>}
        </div>
        <table className="w-full text-xs text-center border">
          <thead className="bg-slate-100 font-bold border-b"><tr><th className="py-2 border-r">계급({survey.unit})</th><th className="py-2 border-r">계급값</th><th className="py-2 border-r">도수</th><th className="py-2">상대도수</th></tr></thead>
          <tbody className="divide-y">
            {freqTable.map((r, i) => <tr key={i}><td className="py-1.5 border-r">{r.min}~{r.max}</td><td className="py-1.5 border-r">{r.mid}</td><td className="py-1.5 border-r font-bold text-indigo-600">{r.count}</td><td className="py-1.5">{r.relFreq.toFixed(2)}</td></tr>)}
            <tr className="bg-indigo-50 font-bold"><td className="py-1.5 border-r">합계</td><td className="py-1.5 border-r">-</td><td className="py-1.5 border-r">{totalCount}</td><td className="py-1.5">1.00</td></tr>
          </tbody>
        </table>
      </div>
    );
  }
  const check = () => {
    for (let i = 0; i < freqTable.length; i++) {
      const r = freqTable[i]; const row = inputs[i] || {};
      if (Math.abs(Number(row.mid) - r.mid) > 0.05) return setErr(`${i + 1}번째 계급값 오류`);
      if (Number(row.count) !== r.count || row.count === '' || row.count === undefined) return setErr(`${i + 1}번째 도수 오류`);
      if (Math.abs(Number(row.rel) - r.relFreq) > 0.015 || !row.rel) return setErr(`${i + 1}번째 상대도수 오류(소수 둘째자리)`);
    }
    setErr(''); onComplete(); alert('도수분포표 필수 미션 통과!');
  };
  return (
    <div className="bg-white rounded-2xl border-2 border-amber-400 p-5">
      <span className="text-xs font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded">필수 직접 제작 (7점)</span>
      <h3 className="font-bold text-base mt-1 mb-2">도수분포표 빈칸 채우기</h3>
      <table className="w-full text-xs text-center border mb-3">
        <thead className="bg-slate-100 font-bold border-b"><tr><th className="py-1.5 border-r">계급</th><th className="py-1.5 border-r">계급값</th><th className="py-1.5 border-r">도수</th><th className="py-1.5">상대도수</th></tr></thead>
        <tbody className="divide-y">
          {freqTable.map((r, i) => (
            <tr key={i}>
              <td className="py-1 border-r">{r.min}~{r.max}</td>
              <td className="p-1 border-r"><input type="number" step="any" className="w-14 border rounded text-center py-0.5" value={inputs[i]?.mid ?? ''} onChange={(e) => setInputs({ ...inputs, [i]: { ...inputs[i], mid: e.target.value } })} /></td>
              <td className="p-1 border-r"><input type="number" className="w-12 border rounded text-center py-0.5" value={inputs[i]?.count ?? ''} onChange={(e) => setInputs({ ...inputs, [i]: { ...inputs[i], count: e.target.value } })} /></td>
              <td className="p-1"><input type="number" step="0.01" placeholder="0.00" className="w-14 border rounded text-center py-0.5" value={inputs[i]?.rel ?? ''} onChange={(e) => setInputs({ ...inputs, [i]: { ...inputs[i], rel: e.target.value } })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-xs font-bold text-rose-600 mb-2 text-center">{err}</p>}
      <button onClick={check} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl text-xs">정답 확인</button>
    </div>
  );
}

function GraphSection({ survey, freqTable, isMember, randomGraphMission, isHistCompleted, isPolyCompleted, onCompleteHist, onCompletePoly }) {
  const [bars, setBars] = useState([]);
  const [poly, setPoly] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => { setBars(freqTable.map(() => 0)); setPoly(Array(freqTable.length + 2).fill(0)); }, [freqTable.length]);
  if (freqTable.length === 0) return <div className="bg-white rounded-2xl border p-5 text-center text-slate-400 text-sm">데이터 없음</div>;
  const isDone = randomGraphMission === 'hist' ? isHistCompleted : isPolyCompleted;
  if (!isMember || isDone) {
    return (
      <div className="bg-white rounded-2xl border p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-base">히스토그램 & 도수분포다각형</h3>
          {isDone && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">✓ 랜덤 미션 통과(7점)</span>}
        </div>
        <ChartSvg rows={freqTable} unit={survey.unit} showHist={true} showPoly={true} />
      </div>
    );
  }
  const isHist = randomGraphMission === 'hist';
  const target = isHist ? freqTable.map((r) => r.count) : [0, ...freqTable.map((r) => r.count), 0];
  const curArr = isHist ? bars : poly;
  const setCurArr = isHist ? setBars : setPoly;
  const check = () => {
    for (let i = 0; i < target.length; i++) {
      if (Number(curArr[i]) !== target[i]) return setErr(isHist ? `${freqTable[i].min}~${freqTable[i].max} 막대 높이 오류` : '양 끝점(0) 또는 계급 중앙 점 높이 오류');
    }
    setErr(''); isHist ? onCompleteHist() : onCompletePoly(); alert('그래프 랜덤 미션 통과!');
  };
  return (
    <div className="bg-white rounded-2xl border-2 border-amber-400 p-5">
      <span className="text-xs font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded">랜덤 선택 미션 (7점)</span>
      <h3 className="font-bold text-base mt-1 mb-2">{isHist ? '히스토그램 막대 높이 맞추기' : '도수분포다각형 꼭짓점 찍기'}</h3>
      <ChartSvg rows={isHist ? freqTable.map((r, i) => ({ ...r, count: bars[i] ?? 0 })) : freqTable} customPolyValues={isHist ? null : poly} maxOverride={Math.max(...freqTable.map((r) => r.count), 4)} unit={survey.unit} showHist={isHist} showPoly={!isHist} />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 my-3">
        {target.map((_, i) => {
          const lbl = isHist ? `${freqTable[i].min}~${freqTable[i].max}` : (i === 0 ? '왼쪽끝' : i === target.length - 1 ? '오른쪽끝' : `${freqTable[i - 1].mid}`);
          return (
            <div key={i} className="bg-slate-50 border rounded p-1.5 text-center text-xs">
              <span className="block font-bold text-slate-600 truncate">{lbl}</span>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <button type="button" onClick={() => { const n = [...curArr]; n[i] = Math.max(0, (n[i] || 0) - 1); setCurArr(n); }} className="w-5 h-5 bg-white border rounded font-bold">-</button>
                <span className="font-extrabold text-indigo-600">{curArr[i] ?? 0}</span>
                <button type="button" onClick={() => { const n = [...curArr]; n[i] = (n[i] || 0) + 1; setCurArr(n); }} className="w-5 h-5 bg-white border rounded font-bold">+</button>
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="text-xs font-bold text-rose-600 mb-2 text-center">{err}</p>}
      <button onClick={check} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl text-xs">정답 확인</button>
    </div>
  );
}

function IndividualTab({ survey, classSurveys, currentUser, currentPhase, stats, freqTable }) {
  const [insight, setInsight] = useState('');
  const [ans, setAns] = useState(['', '', '', '', '']);
  const members = survey.memberList || [];
  const subs = survey.individualSubmissions || [];
  const seed = Number(currentUser.studentId) || 1;
  const others = useMemo(() => classSurveys.filter((s) => s.id !== survey.id && (s.entries || []).length >= 3), [classSurveys, survey.id]);
  const otherSurvey = others.length > 0 ? others[seed % others.length] : null;
  const otherTable = useMemo(() => (otherSurvey ? buildFreqTable(otherSurvey) : []), [otherSurvey]);
  const otherMode = seed % 3;

  if (!stats || freqTable.length === 0) return <div className="bg-white rounded-2xl border p-10 text-center text-slate-500 text-sm">자료 수집 및 계급 확정 후 응시 가능합니다.</div>;

  const maxRow = freqTable.reduce((b, r) => (r.count > b.count ? r : b), freqTable[0]);
  const minRow = freqTable.reduce((b, r) => (r.count < b.count ? r : b), freqTable[0]);
  const tRow = freqTable[seed % freqTable.length];

  const q1 = seed % 3 === 0 ? { q: `Q1. [우리 모둠] 전체 자료(${stats.n}개)의 평균은? (소수 첫째자리)`, a: stats.mean }
    : seed % 3 === 1 ? { q: `Q1. [우리 모둠] 전체 자료(${stats.n}개)의 중앙값은?`, a: stats.median }
    : { q: `Q1. [우리 모둠] 최댓값과 최솟값의 차이(범위)는?`, a: stats.range };

  const q2 = Math.floor(seed / 3) % 2 === 0 ? { q: `Q2. [우리 모둠] [${tRow.min}~${tRow.max}] 계급의 계급값은?`, a: tRow.mid }
    : { q: `Q2. [우리 모둠] 도수가 가장 큰 계급의 도수(명)는?`, a: maxRow.count };

  const q3 = Math.floor(seed / 7) % 3 === 0 ? { q: `Q3. [우리 모둠] 도수가 가장 큰 계급의 상대도수는? (소수 둘째자리)`, a: maxRow.relFreq }
    : Math.floor(seed / 7) % 3 === 1 ? { q: `Q3. [우리 모둠] 도수가 가장 작은 계급의 상대도수는? (소수 둘째자리)`, a: minRow.relFreq }
    : { q: `Q3. [우리 모둠] [${tRow.min}~${tRow.max}] 계급의 상대도수는? (소수 둘째자리)`, a: tRow.relFreq };

  let q4 = { q: `Q4. [추가] 우리 모둠 도수분포표의 계급 크기는?`, a: freqTable[0].max - freqTable[0].min };
  let q5 = { q: `Q5. [추가] 우리 모둠 도수분포표의 총 계급 개수는?`, a: freqTable.length };
  if (otherSurvey && otherTable.length > 0) {
    const oMax = otherTable.reduce((b, r) => (r.count > b.count ? r : b), otherTable[0]);
    const oT = otherTable[(seed + 1) % otherTable.length];
    q4 = { q: `Q4. [타 모둠 자료] 위 자료의 전체 조사 인원(총 도수)은 몇 명인가요?`, a: (otherSurvey.entries || []).length };
    q5 = seed % 2 === 0 ? { q: `Q5. [타 모둠 자료] 도수가 가장 큰 계급의 도수(명)는?`, a: oMax.count }
      : { q: `Q5. [타 모둠 자료] [${oT.min}~${oT.max}] 계급의 상대도수는? (소수 둘째자리)`, a: oT.relFreq };
  }
  const questions = [q1, q2, q3, q4, q5];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!insight.trim()) return;
    let quizScore = 0;
    questions.forEach((item, idx) => {
      if (Math.abs(Number(ans[idx]) - Number(item.a)) < 0.06) quizScore += 8;
    });
    const nextSubs = [...subs.filter((s) => s.studentId !== currentUser.studentId), {
      studentId: currentUser.studentId, studentName: currentUser.studentName,
      personalInsight: insight.trim(), quizScore,
      submittedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }];
    await updateDoc(doc(db, 'surveys', survey.id), { individualSubmissions: nextSubs });
    alert(`${currentUser.studentName} 학생의 답안이 정상적으로 제출되었습니다. 수고하셨습니다!`);
    setAns(['', '', '', '', '']);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl border p-6">
        <h3 className="font-bold text-lg mb-1">개인별 수행평가 제출 (5문항 · 점수 비공개)</h3>
        <p className="text-xs text-slate-500 mb-4">우리 모둠 3문항 + 타 모둠 랜덤 자료 해석 2문항입니다. 제출 후 점수는 공개되지 않습니다.</p>
        {currentPhase === 1 ? (
          <div className="bg-amber-50 text-amber-900 p-6 rounded-xl text-center text-sm font-bold">2차시(정리·평가 단계) 전환 후 응시할 수 있습니다.</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-2.5">
              <h4 className="font-bold text-sm text-indigo-900">1부. 우리 모둠({survey.groupName}) 분석 (3문항)</h4>
              {questions.slice(0, 3).map((item, idx) => (
                <div key={idx}>
                  <label className="block text-xs font-semibold mb-1">{item.q}</label>
                  <input type="number" step="any" required value={ans[idx]} onChange={(e) => { const n = [...ans]; n[idx] = e.target.value; setAns(n); }} className="w-full bg-white border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              ))}
            </div>
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 space-y-2.5">
              <h4 className="font-bold text-sm text-emerald-900">2부. 타 모둠({otherSurvey ? `${otherSurvey.groupName}: ${otherSurvey.topic}` : '추가'}) 자료 해석 (2문항)</h4>
              {otherSurvey && otherTable.length > 0 && (
                <div className="bg-white border rounded-xl p-3">
                  {otherMode === 0 && (
                    <table className="w-full text-xs text-center border">
                      <thead className="bg-slate-100 font-bold border-b"><tr><th className="py-1 border-r">계급({otherSurvey.unit})</th><th className="py-1 border-r">계급값</th><th className="py-1">도수</th></tr></thead>
                      <tbody className="divide-y">{otherTable.map((r, i) => <tr key={i}><td className="py-1 border-r">{r.min}~{r.max}</td><td className="py-1 border-r">{r.mid}</td><td className="py-1 font-bold">{r.count}</td></tr>)}</tbody>
                    </table>
                  )}
                  {otherMode === 1 && <ChartSvg rows={otherTable} unit={otherSurvey.unit} showHist={true} showPoly={false} />}
                  {otherMode === 2 && <ChartSvg rows={otherTable} unit={otherSurvey.unit} showHist={false} showPoly={true} />}
                </div>
              )}
              {questions.slice(3, 5).map((item, idx) => (
                <div key={idx + 3}>
                  <label className="block text-xs font-semibold mb-1">{item.q}</label>
                  <input type="number" step="any" required value={ans[idx + 3]} onChange={(e) => { const n = [...ans]; n[idx + 3] = e.target.value; setAns(n); }} className="w-full bg-white border rounded-lg px-3 py-1.5 text-sm" />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">개인 소감 및 발견한 통계적 사실 1가지 *</label>
              <textarea rows={3} required value={insight} onChange={(e) => setInsight(e.target.value)} className="w-full border rounded-lg p-3 text-sm" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm">개인별 평가 제출하기</button>
          </form>
        )}
      </div>
      <div className="bg-white rounded-2xl border p-5">
        <h4 className="font-bold text-base mb-3">모둠원 제출 현황 ({subs.length}/{members.length}명)</h4>
        <div className="space-y-2">
          {members.map((m) => {
            const sub = subs.find((s) => s.studentId === m.studentId);
            return (
              <div key={m.studentId} className="border rounded-xl p-3 bg-slate-50 flex justify-between items-center text-xs">
                <div><strong className="block">{m.studentId} {m.studentName}</strong><span className="text-slate-400">{sub ? `${sub.submittedAt} 제출` : '미제출'}</span></div>
                <span className={`px-2 py-0.5 rounded-full font-bold ${sub ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{sub ? '✓ 제출됨' : '대기'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({ teacherClass, setTeacherClass, surveys, allSurveys, currentPhase, classSettings }) {
  const classes = ['1반', '2반', '3반', '4반', '5반', '6반'];
  const [moveTargets, setMoveTargets] = useState({});

  const handleSetPhase = (phase) => setDoc(doc(db, 'classSettings', teacherClass), { phase }, { merge: true });
  const handleRubric = (s, val) => updateDoc(doc(db, 'surveys', s.id), { rubricAnalysis: Number(val) });

  const handleKick = async (s, stu) => {
    if (!window.confirm(`[${stu.studentName}] 학생을 [${s.groupName}]에서 제외할까요?`)) return;
    await updateDoc(doc(db, 'surveys', s.id), {
      memberList: (s.memberList || []).filter((m) => m.studentId !== stu.studentId),
      individualSubmissions: (s.individualSubmissions || []).filter((sub) => sub.studentId !== stu.studentId)
    });
  };

  const handleMove = async (fromS, stu) => {
    const destId = moveTargets[stu.studentId];
    const destS = surveys.find((s) => s.id === destId);
    if (!destS || destS.id === fromS.id) return alert('이동할 모둠을 선택하세요.');
    if ((destS.memberList || []).length >= MAX_GROUP_MEMBERS) return alert('대상 모둠 정원 초과');
    await updateDoc(doc(db, 'surveys', fromS.id), {
      memberList: (fromS.memberList || []).filter((m) => m.studentId !== stu.studentId),
      individualSubmissions: (fromS.individualSubmissions || []).filter((sub) => sub.studentId !== stu.studentId)
    });
    await updateDoc(doc(db, 'surveys', destS.id), {
      memberList: [...(destS.memberList || []), { studentId: stu.studentId, studentName: stu.studentName, role: '모둠원' }]
    });
  };

  const handleResetAccount = async (studentId, studentName) => {
    if (!window.confirm(`[${studentId} ${studentName}] 계정을 초기화할까요? 학생 화면이 강제 로그아웃됩니다.`)) return;
    for (const s of surveys) {
      await updateDoc(doc(db, 'surveys', s.id), {
        memberList: (s.memberList || []).filter((m) => m.studentId !== studentId),
        entries: (s.entries || []).filter((e) => e.studentId !== studentId),
        individualSubmissions: (s.individualSubmissions || []).filter((sub) => sub.studentId !== studentId)
      });
    }
    const prev = classSettings[teacherClass]?.resetStudents || [];
    if (!prev.includes(studentId)) {
      await setDoc(doc(db, 'classSettings', teacherClass), { resetStudents: [...prev, studentId] }, { merge: true });
    }
  };

  const allStudents = useMemo(() => {
    const map = new Map();
    surveys.forEach((s) => {
      (s.memberList || []).forEach((m) => map.set(m.studentId, { ...m, group: s }));
      (s.entries || []).forEach((e) => { if (!map.has(e.studentId)) map.set(e.studentId, { studentId: e.studentId, studentName: e.studentName, group: null, role: '미소속' }); });
    });
    return Array.from(map.values()).sort((a, b) => a.studentId.localeCompare(b.studentId));
  }, [surveys]);

  const scoreRows = useMemo(() => {
    const rows = [];
    surveys.forEach((s) => {
      const st = s.missionStatus || {};
      const rk = s.randomGraphMission || 'hist';
      const missionTotal = (st.stem ? 6 : 0) + (st.table ? 7 : 0) + (st[rk] ? 7 : 0);
      const analysisScore = Number(s.rubricAnalysis ?? 20);
      (s.memberList || []).forEach((m) => {
        const sub = (s.individualSubmissions || []).find((item) => item.studentId === m.studentId);
        const quizScore = sub ? Number(sub.quizScore) : 0;
        const totalAns = surveys.filter((item) => (item.entries || []).some((e) => e.studentId === m.studentId)).length;
        const openLeft = surveys.filter((item) => {
          const ents = item.entries || [];
          return !ents.some((e) => e.studentId === m.studentId) && !(item.isLocked || ents.length >= MAX_SURVEY_RESPONSES || currentPhase === 2);
        }).length;
        const partScore = totalAns >= 6 || openLeft === 0 ? 20 : Math.round((totalAns / 6) * 20);
        const total100 = missionTotal + analysisScore + quizScore + partScore;
        rows.push({
          className: s.className, studentId: m.studentId, studentName: m.studentName, groupName: s.groupName, topic: s.topic,
          submitted: sub ? '제출' : '미제출', missionTotal, analysisScore, quizScore, totalAns, partScore,
          total100, converted30: Number(((total100 / 100) * 30).toFixed(1)), insight: sub?.personalInsight || ''
        });
      });
    });
    return rows.sort((a, b) => a.studentId.localeCompare(b.studentId));
  }, [surveys, currentPhase]);

  const downloadCsv = () => {
    const headers = ['반', '학번', '이름', '소속모둠', '조사주제', '제출여부', '직접제작미션(20)', '자료해석루브릭(20)', '개인맞춤퀴즈(40)', '설문참여횟수', '설문참여점수(20)', '최종총점(100)', '30점환산', '개인통계해석'];
    const lines = [headers.join(','), ...scoreRows.map((r) => [
      r.className, r.studentId, r.studentName, `"${r.groupName}"`, `"${r.topic.replace(/"/g, '""')}"`, r.submitted,
      r.missionTotal, r.analysisScore, r.quizScore, r.totalAns, r.partScore, r.total100, r.converted30, `"${r.insight.replace(/"/g, '""')}"`
    ].join(','))];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `문수중_통계수행평가_${teacherClass}.csv`; a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-bold">교사 관리자 및 성적 산출 ({teacherClass})</h2>
            <p className="text-xs text-slate-600">배점: 직접제작(20) + 자료해석(20) + 개인퀴즈(40) + 설문참여(20) = 100점</p>
          </div>
          <button onClick={downloadCsv} className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-1"><Download className="w-4 h-4" /> 엑셀(CSV) 다운로드</button>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-amber-200">
          <div className="flex gap-1">{classes.map((c) => <button key={c} onClick={() => setTeacherClass(c)} className={`px-3 py-1 rounded text-xs font-bold ${teacherClass === c ? 'bg-slate-900 text-white' : 'bg-white border'}`}>{c} ({allSurveys.filter((s) => s.className === c).length})</button>)}</div>
          <div className="flex gap-1.5 text-xs">
            <button onClick={() => handleSetPhase(1)} className={`px-3 py-1 rounded font-bold ${currentPhase === 1 ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>1차시 (수집)</button>
            <button onClick={() => handleSetPhase(2)} className={`px-3 py-1 rounded font-bold ${currentPhase === 2 ? 'bg-rose-600 text-white' : 'bg-white border'}`}>2차시 (마감·평가)</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-bold text-base mb-3">1. 학생 계정 초기화 · 모둠 이동 · 강퇴 ({allStudents.length}명)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border">
            <thead className="bg-slate-100 font-bold border-b"><tr><th className="py-2 border-r">학번</th><th className="py-2 border-r">이름</th><th className="py-2 border-r">소속</th><th className="py-2 border-r">모둠 이동</th><th className="py-2">관리</th></tr></thead>
            <tbody className="divide-y">
              {allStudents.map((stu) => (
                <tr key={stu.studentId}>
                  <td className="py-1.5 border-r">{stu.studentId}</td>
                  <td className="py-1.5 border-r font-bold">{stu.studentName}</td>
                  <td className="py-1.5 border-r">{stu.group ? stu.group.groupName : '미소속'}</td>
                  <td className="p-1 border-r">
                    {stu.group ? (
                      <div className="flex justify-center gap-1">
                        <select value={moveTargets[stu.studentId] || ''} onChange={(e) => setMoveTargets({ ...moveTargets, [stu.studentId]: e.target.value })} className="border rounded px-1.5 py-0.5">
                          <option value="">선택</option>
                          {surveys.filter((s) => s.id !== stu.group.id).map((s) => <option key={s.id} value={s.id}>{s.groupName}</option>)}
                        </select>
                        <button onClick={() => handleMove(stu.group, stu)} className="bg-indigo-600 text-white px-2 py-0.5 rounded font-bold inline-flex items-center gap-0.5"><ArrowRightLeft className="w-3 h-3" /> 이동</button>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="p-1 flex justify-center gap-1">
                    {stu.group && <button onClick={() => handleKick(stu.group, stu)} className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold">제외</button>}
                    <button onClick={() => handleResetAccount(stu.studentId, stu.studentName)} className="bg-rose-600 text-white px-2 py-0.5 rounded font-bold inline-flex items-center gap-0.5"><RefreshCw className="w-3 h-3" /> 초기화</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-bold text-base mb-3">2. 모둠별 자료해석 루브릭 채점 (20점)</h3>
        <div className="space-y-2.5">
          {surveys.map((s) => (
            <div key={s.id} className="border rounded-xl p-3.5 flex flex-col sm:flex-row justify-between gap-3">
              <div>
                <span className="font-bold text-indigo-700 text-sm">{s.groupName}</span> <span className="text-xs text-slate-500">({s.topic})</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-1">{s.interpretation || '미작성'}</p>
              </div>
              <select value={s.rubricAnalysis ?? 20} onChange={(e) => handleRubric(s, e.target.value)} className="border rounded-lg px-3 py-1.5 text-xs font-bold h-fit">
                <option value={20}>상 (20점)</option><option value={16}>중 (16점)</option><option value={12}>하 (12점)</option><option value={0}>미작성 (0점)</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-5">
        <h3 className="font-bold text-base mb-3">3. 개인별 최종 성적표 ({scoreRows.length}명)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border">
            <thead className="bg-slate-100 font-bold border-b">
              <tr><th className="py-2 border-r">학번</th><th className="py-2 border-r">이름</th><th className="py-2 border-r">모둠</th><th className="py-2 border-r">상태</th><th className="py-2 border-r">미션(20)</th><th className="py-2 border-r">해석(20)</th><th className="py-2 border-r">퀴즈(40)</th><th className="py-2 border-r">설문(20)</th><th className="py-2 border-r bg-indigo-50">총점(100)</th><th className="py-2 bg-emerald-50">30점환산</th></tr>
            </thead>
            <tbody className="divide-y">
              {scoreRows.map((r) => (
                <tr key={r.studentId}>
                  <td className="py-1.5 border-r">{r.studentId}</td><td className="py-1.5 border-r font-bold">{r.studentName}</td><td className="py-1.5 border-r">{r.groupName}</td>
                  <td className="py-1.5 border-r">{r.submitted}</td><td className="py-1.5 border-r">{r.missionTotal}</td><td className="py-1.5 border-r">{r.analysisScore}</td>
                  <td className="py-1.5 border-r">{r.quizScore}</td><td className="py-1.5 border-r">{r.partScore}</td>
                  <td className="py-1.5 border-r font-extrabold text-indigo-700 bg-indigo-50/40">{r.total100}</td>
                  <td className="py-1.5 font-extrabold text-emerald-700 bg-emerald-50/40">{r.converted30}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Badge({ label, done }) {
  return <span className={`px-2 py-0.5 rounded font-bold ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{label} {done ? '✓' : '미완료'}</span>;
}

function TabBtn({ active, onClick, icon, label }) {
  return <button onClick={onClick} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold ${active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white'}`}>{icon}{label}</button>;
}

function StatBox({ label, value }) {
  return <div className="bg-slate-50 border rounded-xl p-2.5 text-center"><p className="text-[11px] text-slate-500">{label}</p><p className="font-bold text-sm">{value}</p></div>;
}

function ChartSvg({ rows, unit, showHist, showPoly, maxOverride, customPolyValues }) {
  if (!rows || rows.length === 0) return <div className="py-12 text-center text-slate-400 text-xs">데이터 없음</div>;
  const maxC = Math.max(...rows.map((r) => r.count), maxOverride || 1, 1);
  const yMax = Math.ceil((maxC + 1) / 2) * 2;
  const W = 440, H = 230, pL = 38, pR = 20, pT = 20, pB = 38;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const slotW = plotW / (rows.length + 2);
  const getY = (v) => pT + plotH - (v / yMax) * plotH;
  const polyVals = customPolyValues || [0, ...rows.map((r) => r.count), 0];
  const pts = polyVals.map((v, i) => ({ x: pL + slotW * (i + 0.5), y: getY(v) }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto border rounded-xl bg-white">
      {Array.from({ length: yMax + 1 }).map((_, v) => (yMax > 10 && v % 2 !== 0 ? null : (
        <g key={v}><line x1={pL} y1={getY(v)} x2={W - pR} y2={getY(v)} stroke="#e2e8f0" /><text x={pL - 6} y={getY(v) + 3} textAnchor="end" fontSize="9" fill="#64748b">{v}</text></g>
      )))}
      {showHist && rows.map((r, i) => <rect key={i} x={pL + slotW * (i + 1)} y={getY(r.count)} width={slotW} height={pT + plotH - getY(r.count)} fill="rgba(99,102,241,0.28)" stroke="#4f46e5" strokeWidth="1.5" />)}
      {showPoly && <><polyline fill="none" stroke="#e11d48" strokeWidth="2.5" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />{pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#e11d48" />)}</>}
      <line x1={pL} y1={pT} x2={pL} y2={pT + plotH} stroke="#334155" strokeWidth="1.5" />
      <line x1={pL} y1={pT + plotH} x2={W - pR} y2={pT + plotH} stroke="#334155" strokeWidth="1.5" />
      {rows.map((r, i) => <text key={i} x={pL + slotW * (i + 1)} y={pT + plotH + 14} textAnchor="middle" fontSize="9">{r.min}</text>)}
      <text x={pL + slotW * (rows.length + 1)} y={pT + plotH + 14} textAnchor="middle" fontSize="9">{rows[rows.length - 1].max}</text>
      <text x={pL - 6} y={12} textAnchor="end" fontSize="9" fontWeight="bold">(명)</text>
      <text x={W - 6} y={pT + plotH + 26} textAnchor="end" fontSize="9" fontWeight="bold">({unit})</text>
    </svg>
  );
}
