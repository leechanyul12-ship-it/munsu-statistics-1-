import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import {
  Plus,
  Users,
  BarChart3,
  Table2,
  FileText,
  Trash2,
  ArrowLeft,
  CheckCircle2,
  Printer,
  ListOrdered,
  Sparkles,
  Send,
  QrCode,
  Lock,
  Unlock,
  ShieldCheck,
  Download,
  Heart,
  MessageSquare,
  Award,
  X
} from 'lucide-react';

// 선생님 전용 Firebase 설정
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

const CLASSES = ['1반', '2반', '3반', '4반', '5반', '6반'];
const TEACHER_PIN = '1234'; // 교사 관리자 비밀번호

const GUIDE_TEMPLATES = [
  {
    label: '최빈 계급 분석',
    text: '• 가장 도수가 큰 계급은 (   ) 이상 (   ) 미만으로, 전체의 (   )%를 차지한다.\n'
  },
  {
    label: '대표값 비교',
    text: '• 평균은 (   ), 중앙값은 (   )이며, 극단적인 값의 영향으로 (평균/중앙값)이 자료를 더 잘 대표한다.\n'
  },
  {
    label: '전체 분포 특징',
    text: '• 전체적으로 자료가 (왼쪽/가운데/오른쪽) 계급에 몰려 있으며, 이를 통해 우리 반 학생들은 ~하다는 사실을 알 수 있다.\n'
  }
];

export default function App() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('1반');
  const [selectedId, setSelectedId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // 모달 상태
  const [showQrModal, setShowQrModal] = useState(false);
  const [isTeacherMode, setIsTeacherMode] = useState(false);

  // 새 설문 생성 폼 상태
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState('');
  const [topic, setTopic] = useState('');
  const [unit, setUnit] = useState('');
  const [roomPin, setRoomPin] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'surveys'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setSurveys(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const classSurveys = useMemo(
    () => surveys.filter((s) => (s.className || '1반') === selectedClass),
    [surveys, selectedClass]
  );

  const currentSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedId) || null,
    [surveys, selectedId]
  );

  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || !topic.trim() || !unit.trim() || !roomPin.trim()) return;

    const docRef = await addDoc(collection(db, 'surveys'), {
      className: selectedClass,
      groupName: groupName.trim(),
      members: members.trim(),
      topic: topic.trim(),
      unit: unit.trim(),
      pin: roomPin.trim(),
      isLocked: false,
      entries: [],
      classStart: 0,
      classWidth: 10,
      interpretation: '',
      rubric: { table: 20, graph: 15, analysis: 15 },
      individualSubmissions: [],
      likes: 0,
      comments: [],
      createdAt: serverTimestamp(),
    });

    setGroupName('');
    setMembers('');
    setTopic('');
    setUnit('');
    setRoomPin('');
    setIsCreating(false);
    setSelectedId(docRef.id);
  };

  const handleDeleteSurvey = async (survey, e) => {
    e.stopPropagation();
    const inputPin = window.prompt(
      `[${survey.groupName}] 설문을 삭제하려면 모둠 비밀번호(4자리) 또는 교사 번호를 입력하세요.`
    );
    if (!inputPin) return;
    if (inputPin !== survey.pin && inputPin !== TEACHER_PIN) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!window.confirm('정말 이 모둠의 모든 자료와 평가 기록을 삭제할까요?')) return;
    await deleteDoc(doc(db, 'surveys', survey.id));
    if (selectedId === survey.id) setSelectedId(null);
  };

  const handleOpenTeacherMode = () => {
    if (isTeacherMode) {
      setIsTeacherMode(false);
      return;
    }
    const pin = window.prompt('교사 관리자 비밀번호를 입력하세요 (초기값: 1234)');
    if (pin === TEACHER_PIN) {
      setIsTeacherMode(true);
      setSelectedId(null);
      setIsCreating(false);
    } else if (pin !== null) {
      alert('비밀번호가 틀렸습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600 font-medium">
        실시간 수행평가 데이터를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* 상단 헤더 */}
      <header className="bg-indigo-600 text-white shadow-sm no-print">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => {
              setSelectedId(null);
              setIsCreating(false);
              setIsTeacherMode(false);
            }}
          >
            <BarChart3 className="w-7 h-7 text-indigo-200" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">중1 수학 통계 수행평가</h1>
              <p className="text-xs text-indigo-200">모둠별 설문 · 자료 분석 · 개인별 성취도 평가</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-3 py-2 rounded-lg text-xs transition"
            >
              <QrCode className="w-4 h-4" />
              QR코드
            </button>

            <button
              onClick={handleOpenTeacherMode}
              className={`flex items-center gap-1.5 font-semibold px-3 py-2 rounded-lg text-xs transition ${
                isTeacherMode
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-indigo-800 hover:bg-indigo-900 text-indigo-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              {isTeacherMode ? '교사 모드 종료' : '교사 관리·채점'}
            </button>

            {!selectedId && !isCreating && !isTeacherMode && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1.5 bg-white text-indigo-600 hover:bg-indigo-50 font-bold px-3.5 py-2 rounded-lg text-xs shadow transition"
              >
                <Plus className="w-4 h-4" />
                새 모둠 만들기
              </button>
            )}
          </div>
        </div>

        {/* 반별 탭 바 */}
        {!selectedId && !isCreating && (
          <div className="bg-indigo-700/80 border-t border-indigo-500/40">
            <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto py-1.5">
              {CLASSES.map((cls) => {
                const count = surveys.filter((s) => (s.className || '1반') === cls).length;
                return (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                      selectedClass === cls
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-indigo-100 hover:bg-indigo-600'
                    }`}
                  >
                    {cls} ({count})
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 교사 관리자 대시보드 */}
        {isTeacherMode && (
          <TeacherDashboard
            selectedClass={selectedClass}
            surveys={classSurveys}
          />
        )}

        {/* 새 모둠 설문 생성 화면 */}
        {!isTeacherMode && isCreating && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <button
              onClick={() => setIsCreating(false)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> {selectedClass} 목록으로 돌아가기
            </button>
            <h2 className="text-xl font-bold mb-1">[{selectedClass}] 새 모둠 설문 방 개설</h2>
            <p className="text-sm text-slate-500 mb-5">삭제 방지용 비밀번호 4자리를 꼭 기억해 주세요.</p>

            <form onSubmit={handleCreateSurvey} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1">모둠 이름 *</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 1모둠"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">방 비밀번호 (4자리) *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="예: 1111"
                    value={roomPin}
                    onChange={(e) => setRoomPin(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">모둠원 학번·이름 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 10101 김민준, 10105 이서연, 10112 박지훈"
                  value={members}
                  onChange={(e) => setMembers(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">조사 주제 (설문 질문) *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 하루 평균 스마트폰 사용 시간은 몇 분인가요?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">변량의 단위 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 분, 회, 권, 시간"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition shadow-sm"
              >
                설문 방 생성하고 시작하기
              </button>
            </form>
          </div>
        )}

        {/* 반별 모둠 목록 화면 */}
        {!isTeacherMode && !isCreating && !currentSurvey && (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedClass} 모둠별 통계 수행평가</h2>
                <p className="text-sm text-slate-500">모둠을 선택해 설문 응답에 참여하고 통계 분석 및 개인 평가를 진행하세요.</p>
              </div>
              <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                {selectedClass} · 총 {classSurveys.length}개 모둠
              </span>
            </div>

            {classSurveys.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">{selectedClass}에 아직 개설된 모둠 설문이 없습니다.</p>
                <p className="text-sm text-slate-500 mb-5">오른쪽 위 [새 모둠 만들기] 버튼을 눌러 첫 설문을 시작해 보세요!</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition"
                >
                  <Plus className="w-4 h-4" /> {selectedClass} 새 모둠 만들기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classSurveys.map((s) => {
                  const entries = s.entries || [];
                  const subs = s.individualSubmissions || [];
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md">
                              {s.groupName}
                            </span>
                            {s.isLocked && (
                              <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded flex items-center gap-1">
                                <Lock className="w-3 h-3" /> 투표 마감
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => handleDeleteSurvey(s, e)}
                            className="text-slate-400 hover:text-rose-500 p-1"
                            title="설문 삭제 (비밀번호 필요)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <h3 className="font-bold text-lg text-slate-800 mb-1">{s.topic}</h3>
                        <p className="text-xs text-slate-500 mb-3">모둠원: {s.members}</p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-slate-600">
                          <span>설문 응답: <strong className="text-indigo-600">{entries.length}명</strong></span>
                          <span>개인평가 완료: <strong className="text-emerald-600">{subs.length}명</strong></span>
                          <span className="flex items-center gap-0.5 text-rose-500">
                            <Heart className="w-3.5 h-3.5 fill-rose-500" /> {s.likes || 0}
                          </span>
                        </div>
                        <span className="text-indigo-600 font-bold text-sm">입장하기 →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 선택된 모둠 상세 워크스페이스 */}
        {!isTeacherMode && !isCreating && currentSurvey && (
          <SurveyWorkspace
            survey={currentSurvey}
            onBack={() => setSelectedId(null)}
          />
        )}
      </main>

      {/* QR코드 팝업 모달 */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-lg mb-1">학생 접속용 QR코드</h3>
            <p className="text-xs text-slate-500 mb-4">태블릿 카메라로 스캔하면 바로 접속됩니다.</p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 inline-block mb-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  window.location.href
                )}`}
                alt="접속 QR코드"
                className="w-52 h-52 mx-auto"
              />
            </div>
            <p className="text-xs text-slate-600 break-all bg-slate-100 p-2 rounded-lg font-mono">
              {window.location.href}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   모둠 상세 워크스페이스 (5개 탭)
   ========================================================= */
function SurveyWorkspace({ survey, onBack }) {
  const [activeTab, setActiveTab] = useState('vote');
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [singleVal, setSingleVal] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  const [classStart, setClassStart] = useState(survey.classStart ?? 0);
  const [classWidth, setClassWidth] = useState(survey.classWidth ?? 10);
  const [interpretation, setInterpretation] = useState(survey.interpretation ?? '');
  const [savedNotice, setSavedNotice] = useState(false);

  const [showHist, setShowHist] = useState(true);
  const [showPoly, setShowPoly] = useState(true);
  const [commentInput, setCommentInput] = useState('');

  useEffect(() => {
    setClassStart(survey.classStart ?? 0);
    setClassWidth(survey.classWidth ?? 10);
    setInterpretation(survey.interpretation ?? '');
  }, [survey.id, survey.classStart, survey.classWidth, survey.interpretation]);

  const entries = survey.entries || [];
  const values = useMemo(() => entries.map((e) => Number(e.value)), [entries]);

  const handleToggleLock = async () => {
    const pin = window.prompt('투표 상태를 변경하려면 모둠 비밀번호 또는 교사 번호를 입력하세요.');
    if (pin !== survey.pin && pin !== TEACHER_PIN) {
      if (pin !== null) alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    await updateDoc(doc(db, 'surveys', survey.id), {
      isLocked: !survey.isLocked,
    });
  };

  const handleAddVote = async (e) => {
    e.preventDefault();
    if (survey.isLocked) {
      alert('이미 마감된 설문입니다.');
      return;
    }
    const cleanId = studentId.trim();
    const cleanName = studentName.trim();
    const num = Number(singleVal);

    if (!cleanId || !cleanName || singleVal.trim() === '' || isNaN(num)) return;

    const already = entries.some((item) => item.studentId === cleanId);
    if (already) {
      alert(`학번 [${cleanId}] 학생은 이미 이 설문에 응답했습니다.`);
      return;
    }

    await updateDoc(doc(db, 'surveys', survey.id), {
      entries: [...entries, { studentId: cleanId, studentName: cleanName, value: num }],
    });
    setStudentId('');
    setStudentName('');
    setSingleVal('');
  };

  const handleRemoveEntry = async (idxToRemove) => {
    const pin = window.prompt('응답을 삭제하려면 모둠 비밀번호 또는 교사 번호를 입력하세요.');
    if (pin !== survey.pin && pin !== TEACHER_PIN) {
      if (pin !== null) alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    const next = entries.filter((_, i) => i !== idxToRemove);
    await updateDoc(doc(db, 'surveys', survey.id), {
      entries: next,
    });
  };

  const handleSaveAnalysis = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      classStart: Number(classStart),
      classWidth: Math.max(1, Number(classWidth)),
      interpretation,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleAddLike = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      likes: (survey.likes || 0) + 1,
    });
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    await updateDoc(doc(db, 'surveys', survey.id), {
      comments: [...(survey.comments || []), commentInput.trim()],
    });
    setCommentInput('');
  };

  const stats = useMemo(() => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = Number((sum / n).toFixed(1));
    const median =
      n % 2 === 1
        ? sorted[Math.floor(n / 2)]
        : Number(((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(1));

    const freqMap = {};
    sorted.forEach((v) => {
      freqMap[v] = (freqMap[v] || 0) + 1;
    });
    const maxFreq = Math.max(...Object.values(freqMap));
    const modes = Object.keys(freqMap)
      .filter((k) => freqMap[k] === maxFreq)
      .map(Number);

    return {
      n,
      min: sorted[0],
      max: sorted[n - 1],
      mean,
      median,
      modeText: maxFreq === 1 && n > 1 ? '없음 (모두 1회)' : `${modes.join(', ')} (${maxFreq}회)`,
      sorted,
    };
  }, [values]);

  const stemAndLeaf = useMemo(() => {
    if (values.length === 0) return [];
    const map = {};
    values.forEach((v) => {
      const intVal = Math.floor(Math.abs(v));
      const stem = Math.floor(intVal / 10);
      const leaf = intVal % 10;
      if (!map[stem]) map[stem] = [];
      map[stem].push(leaf);
    });
    return Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map((stem) => ({
        stem,
        leaves: map[stem].sort((a, b) => a - b),
      }));
  }, [values]);

  const freqTable = useMemo(() => {
    if (values.length === 0) return [];
    const start = Number(classStart) || 0;
    const width = Math.max(1, Number(classWidth) || 10);
    const maxVal = Math.max(...values);

    const rows = [];
    let cur = start;
    while (cur <= maxVal || rows.length === 0) {
      const end = cur + width;
      const count = values.filter((v) => v >= cur && v < end).length;
      rows.push({
        min: cur,
        max: end,
        mid: (cur + end) / 2,
        count,
        relFreq: values.length > 0 ? Number((count / values.length).toFixed(2)) : 0,
      });
      cur = end;
      if (rows.length > 30) break;
    }
    return rows;
  }, [values, classStart, classWidth]);

  const displayedEntries = useMemo(() => {
    const indexed = entries.map((item, idx) => ({ ...item, idx }));
    if (sortAsc) {
      return indexed.sort((a, b) => Number(a.value) - Number(b.value));
    }
    return indexed;
  }, [entries, sortAsc]);

  return (
    <div>
      {/* 상단 내비게이션 */}
      <div className="mb-5 no-print">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> {survey.className || '1반'} 전체 모둠 목록으로
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded">
                {survey.className || '1반'} · {survey.groupName}
              </span>
              <span className="text-xs text-slate-500">모둠원: {survey.members}</span>
              <button
                onClick={handleToggleLock}
                className={`text-xs font-bold px-2.5 py-0.5 rounded flex items-center gap-1 transition ${
                  survey.isLocked
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                }`}
              >
                {survey.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {survey.isLocked ? '투표 마감됨 (해제)' : '투표 진행 중 (마감하기)'}
              </button>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{survey.topic}</h2>
            <p className="text-xs text-slate-500 mt-0.5">단위: {survey.unit} · 수집된 자료: {values.length}개</p>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl">
            <TabBtn active={activeTab === 'vote'} onClick={() => setActiveTab('vote')} icon={<Send className="w-3.5 h-3.5" />} label="1. 설문 투표" />
            <TabBtn active={activeTab === 'stem'} onClick={() => setActiveTab('stem')} icon={<ListOrdered className="w-3.5 h-3.5" />} label="2. 줄기와 잎" />
            <TabBtn active={activeTab === 'freq'} onClick={() => setActiveTab('freq')} icon={<Table2 className="w-3.5 h-3.5" />} label="3. 도수분포표·그래프" />
            <TabBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText className="w-3.5 h-3.5" />} label="4. 모둠 보고서" />
            <TabBtn active={activeTab === 'individual'} onClick={() => setActiveTab('individual')} icon={<Award className="w-3.5 h-3.5" />} label="5. 개인별 평가" />
          </div>
        </div>
      </div>

      {/* 탭 1: 설문 투표 */}
      {activeTab === 'vote' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-base mb-1">1인 1응답 설문 참여</h3>
              <p className="text-xs text-slate-500 mb-4">중복 응답 방지를 위해 학번과 이름을 정확히 입력해 주세요.</p>
              {survey.isLocked ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-xs text-amber-800 font-semibold">
                  모둠장이 설문 투표를 마감했습니다. 이제 도수분포표와 보고서를 작성하세요!
                </div>
              ) : (
                <form onSubmit={handleAddVote} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="학번 (예: 10105)"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      required
                      placeholder="이름 (예: 홍길동)"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder={`응답 숫자 (${survey.unit})`}
                      value={singleVal}
                      onChange={(e) => setSingleVal(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-sm shrink-0"
                    >
                      제출
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">수집된 원시 자료 ({entries.length}명 응답)</h3>
                <p className="text-xs text-slate-500">장난/오입력 항목은 클릭 후 비밀번호를 입력해 삭제할 수 있습니다.</p>
              </div>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  sortAsc
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {sortAsc ? '✓ 작은 값부터 정렬됨' : '크기순 정렬'}
              </button>
            </div>

            {entries.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                아직 입력된 자료가 없습니다. 왼쪽에서 학번과 숫자를 입력해 주세요!
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-6">
                  {displayedEntries.map((item) => (
                    <button
                      key={`${item.idx}-${item.studentId}`}
                      onClick={() => handleRemoveEntry(item.idx)}
                      title={`${item.studentId} ${item.studentName} (클릭 시 삭제)`}
                      className="bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-300 px-3 py-1.5 rounded-xl text-left transition"
                    >
                      <span className="block text-[10px] text-slate-400">{item.studentId} {item.studentName}</span>
                      <span className="font-bold text-sm">{item.value}{survey.unit}</span>
                    </button>
                  ))}
                </div>

                {stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                    <StatBox label="조사 인원" value={`${stats.n}명`} />
                    <StatBox label="평균" value={`${stats.mean} ${survey.unit}`} />
                    <StatBox label="중앙값" value={`${stats.median} ${survey.unit}`} />
                    <StatBox label="최빈값" value={stats.modeText} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 탭 2: 줄기와 잎 그림 */}
      {activeTab === 'stem' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-lg">줄기와 잎 그림</h3>
              <p className="text-xs text-slate-500">십의 자리 이상을 줄기로, 일의 자리를 잎으로 크기순 정렬했습니다.</p>
            </div>
            {stemAndLeaf.length > 0 && (
              <div className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg">
                범례: {stemAndLeaf[0].stem} | {stemAndLeaf[0].leaves[0]} 은(는) {stemAndLeaf[0].stem * 10 + stemAndLeaf[0].leaves[0]}{survey.unit}을 뜻함
              </div>
            )}
          </div>

          {stemAndLeaf.length === 0 ? (
            <p className="text-center py-12 text-slate-400 text-sm">먼저 [1. 설문 투표]에서 자료를 입력해 주세요.</p>
          ) : (
            <div className="max-w-lg mx-auto overflow-hidden border border-slate-300 rounded-xl">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-indigo-50 text-indigo-900 font-bold text-sm border-b border-slate-300">
                    <th className="w-28 py-3 border-r-2 border-indigo-400">줄기</th>
                    <th className="py-3 text-left pl-6">잎</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-base">
                  {stemAndLeaf.map((row) => (
                    <tr key={row.stem} className="hover:bg-slate-50">
                      <td className="py-3 font-bold text-indigo-700 border-r-2 border-indigo-400 bg-slate-50/50">
                        {row.stem}
                      </td>
                      <td className="py-3 text-left pl-6 tracking-[0.5em] font-medium text-slate-800">
                        {row.leaves.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 탭 3: 도수분포표 및 그래프 */}
      {activeTab === 'freq' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">첫 계급의 시작값</label>
                <input
                  type="number"
                  value={classStart}
                  onChange={(e) => setClassStart(Number(e.target.value))}
                  className="w-28 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">계급의 크기</label>
                <input
                  type="number"
                  min={1}
                  value={classWidth}
                  onChange={(e) => setClassWidth(Math.max(1, Number(e.target.value)))}
                  className="w-28 border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={handleSaveAnalysis}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
              >
                계급 설정 저장
              </button>
              {savedNotice && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 저장되었습니다!
                </span>
              )}
            </div>
            {stats && (
              <p className="text-xs text-slate-500">
                최솟값: <strong>{stats.min}</strong> / 최댓값: <strong>{stats.max}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-base mb-3">도수분포표 및 상대도수</h3>
              {freqTable.length === 0 ? (
                <p className="text-center py-10 text-slate-400 text-sm">자료가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-center border border-slate-300">
                    <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-300">
                      <tr>
                        <th className="py-2.5 px-2 border-r border-slate-300">계급 ({survey.unit})</th>
                        <th className="py-2.5 px-2 border-r border-slate-300">계급값</th>
                        <th className="py-2.5 px-2 border-r border-slate-300">도수 (명)</th>
                        <th className="py-2.5 px-2">상대도수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {freqTable.map((r, i) => (
                        <tr key={i}>
                          <td className="py-2 px-2 border-r border-slate-300">{r.min} 이상 ~ {r.max} 미만</td>
                          <td className="py-2 px-2 border-r border-slate-300 text-slate-600">{r.mid}</td>
                          <td className="py-2 px-2 border-r border-slate-300 font-bold text-indigo-600">{r.count}</td>
                          <td className="py-2 px-2">{r.relFreq.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="bg-indigo-50/70 font-bold border-t-2 border-slate-300">
                        <td className="py-2 border-r border-slate-300">합계</td>
                        <td className="py-2 border-r border-slate-300">-</td>
                        <td className="py-2 border-r border-slate-300 text-indigo-700">{values.length}</td>
                        <td className="py-2">1.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-base">히스토그램 & 도수분포다각형</h3>
                <div className="flex gap-2 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={showHist} onChange={(e) => setShowHist(e.target.checked)} />
                    히스토그램
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={showPoly} onChange={(e) => setShowPoly(e.target.checked)} />
                    도수분포다각형
                  </label>
                </div>
              </div>
              <HistogramChart rows={freqTable} unit={survey.unit} showHist={showHist} showPoly={showPoly} />
            </div>
          </div>
        </div>
      )}

      {/* 탭 4: 모둠 자료 해석 보고서 & 상호 피드백 */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 no-print">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-lg">모둠 자료 해석 작성하기</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">아래 가이드 버튼을 누르면 문장 틀이 자동으로 추가됩니다.</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {GUIDE_TEMPLATES.map((tpl) => (
