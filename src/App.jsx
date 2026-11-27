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
  setDoc,
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
  X,
  UserPlus,
  UserMinus,
  LogOut,
  CheckSquare,
  AlertCircle
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

const TEACHER_PIN = '문수중12!';
const MAX_CLASS_STUDENTS = 29;
const MAX_GROUP_MEMBERS = 5;
const MAX_SURVEY_RESPONSES = 25;

const MISSION_META = {
  stem: { key: 'stem', label: '줄기와 잎 그림 직접 완성' },
  table: { key: 'table', label: '도수분포표 빈칸 채우기' },
  hist: { key: 'hist', label: '히스토그램 막대 그리기' },
  poly: { key: 'poly', label: '도수분포다각형 꼭짓점 찍기' }
};

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

function parseStudentId(rawId) {
  const clean = rawId.trim();
  if (!/^\d{4}$/.test(clean)) return null;
  const grade = clean[0];
  const clsNum = clean[1];
  const stuNum = Number(clean.slice(2, 4));
  if (stuNum < 1 || stuNum > 35) return null;
  return {
    studentId: clean,
    grade,
    className: `${clsNum}반`,
    number: stuNum
  };
}

function pickTwoRandomMissions() {
  const keys = ['stem', 'table', 'hist', 'poly'];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return [keys[0], keys[1]];
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('munsu_stats_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
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

  // 새 설문 생성 폼 상태
  const [groupName, setGroupName] = useState('');
  const [topic, setTopic] = useState('');
  const [unit, setUnit] = useState('');
  const [roomPin, setRoomPin] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'surveys'), orderBy('createdAt', 'asc'));
    const unsubSurveys = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSurveys(list);
      setLoading(false);
    });

    const unsubSettings = onSnapshot(collection(db, 'classSettings'), (snapshot) => {
      const map = {};
      snapshot.docs.forEach((d) => {
        map[d.id] = d.data();
      });
      setClassSettings(map);
    });

    return () => {
      unsubSurveys();
      unsubSettings();
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError('');
    const parsed = parseStudentId(loginId);
    const cleanName = loginName.trim();

    if (!parsed) {
      setLoginError('학번은 4자리 숫자로 입력해 주세요. (예: 1212 → 1학년 2반 12번)');
      return;
    }
    if (!/^[가-힣]{2,5}$/.test(cleanName)) {
      setLoginError('이름은 한글 2~5자로 정확히 입력해 주세요.');
      return;
    }

    // 해당 반의 등록된 고유 학생 수 확인 (최대 29명)
    const clsSurveys = surveys.filter((s) => s.className === parsed.className);
    const knownStudents = new Map();
    clsSurveys.forEach((s) => {
      (s.memberList || []).forEach((m) => knownStudents.set(m.studentId, m.studentName));
      (s.entries || []).forEach((ent) => knownStudents.set(ent.studentId, ent.studentName));
    });

    if (knownStudents.has(parsed.studentId) && knownStudents.get(parsed.studentId) !== cleanName) {
      setLoginError(
        `학번 [${parsed.studentId}]은 이미 [${knownStudents.get(parsed.studentId)}] 학생으로 등록되어 있습니다.`
      );
      return;
    }

    if (!knownStudents.has(parsed.studentId) && knownStudents.size >= MAX_CLASS_STUDENTS) {
      setLoginError(`${parsed.className} 최대 정원(${MAX_CLASS_STUDENTS}명)이 초과되었습니다. 선생님께 문의하세요.`);
      return;
    }

    const userObj = {
      studentId: parsed.studentId,
      studentName: cleanName,
      className: parsed.className
    };
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
  const classSurveys = useMemo(
    () => surveys.filter((s) => (s.className || '1반') === activeClass),
    [surveys, activeClass]
  );

  // 현재 로그인한 학생이 속한 모둠 찾기
  const myGroup = useMemo(() => {
    if (!currentUser) return null;
    return (
      classSurveys.find((s) =>
        (s.memberList || []).some((m) => m.studentId === currentUser.studentId)
      ) || null
    );
  }, [classSurveys, currentUser]);

  // 현재 학생이 우리 반에서 응답한 설문 개수 (내 모둠 제외 타 모둠 참여 수)
  const myParticipationStats = useMemo(() => {
    if (!currentUser) return { totalAnswered: 0, otherAnswered: 0, otherTotal: 0 };
    const otherSurveys = classSurveys.filter((s) => s.id !== myGroup?.id);
    const otherAnswered = otherSurveys.filter((s) =>
      (s.entries || []).some((ent) => ent.studentId === currentUser.studentId)
    ).length;
    const totalAnswered = classSurveys.filter((s) =>
      (s.entries || []).some((ent) => ent.studentId === currentUser.studentId)
    ).length;
    return {
      totalAnswered,
      otherAnswered,
      otherTotal: otherSurveys.length
    };
  }, [classSurveys, currentUser, myGroup]);

  const currentPhase = classSettings[activeClass]?.phase || 1; // 1: 조사·수집 차시, 2: 정리·해석·평가 차시

  const currentSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedId) || null,
    [surveys, selectedId]
  );

  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    if (myGroup) {
      alert(`이미 [${myGroup.groupName}]에 소속되어 있습니다. 새 모둠을 만들 수 없습니다.`);
      return;
    }
    if (!groupName.trim() || !topic.trim() || !unit.trim() || !roomPin.trim()) return;

    const assignedMissions = pickTwoRandomMissions();

    const docRef = await addDoc(collection(db, 'surveys'), {
      className: currentUser.className,
      groupName: groupName.trim(),
      leaderId: currentUser.studentId,
      memberList: [
        {
          studentId: currentUser.studentId,
          studentName: currentUser.studentName,
          role: '모둠장'
        }
      ],
      topic: topic.trim(),
      unit: unit.trim(),
      pin: roomPin.trim(),
      isLocked: false,
      entries: [],
      classStart: 0,
      classWidth: 10,
      assignedMissions, // 4종 중 랜덤 2종
      missionStatus: { stem: false, table: false, hist: false, poly: false },
      interpretation: '',
      rubricAnalysis: 20, // 교사 자료해석 루브릭 채점 (20점 만점)
      individualSubmissions: [],
      peerRatings: [], // { fromId, toId, score }
      likes: 0,
      comments: [],
      createdAt: serverTimestamp(),
    });

    setGroupName('');
    setTopic('');
    setUnit('');
    setRoomPin('');
    setIsCreating(false);
    setSelectedId(docRef.id);
  };

  // 기존 모둠 합류하기
  const handleJoinGroup = async (survey, e) => {
    e.stopPropagation();
    if (!currentUser) return;
    if (myGroup) {
      alert(`이미 [${myGroup.groupName}]에 소속되어 있습니다.`);
      return;
    }
    const members = survey.memberList || [];
    if (members.length >= MAX_GROUP_MEMBERS) {
      alert(`이 모둠은 정원(${MAX_GROUP_MEMBERS}명)이 가득 찼습니다.`);
      return;
    }
    const inputPin = window.prompt(`[${survey.groupName}]에 합류하려면 모둠 비밀번호를 입력하세요.`);
    if (inputPin !== survey.pin && inputPin !== TEACHER_PIN) {
      if (inputPin !== null) alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    await updateDoc(doc(db, 'surveys', survey.id), {
      memberList: [
        ...members,
        {
          studentId: currentUser.studentId,
          studentName: currentUser.studentName,
          role: '모둠원'
        }
      ]
    });
    alert(`[${survey.groupName}] 모둠원으로 합류했습니다!`);
    setSelectedId(survey.id);
  };

  // 모둠 삭제 (교사 또는 모둠장 비밀번호)
  const handleDeleteSurvey = async (survey, e) => {
    e.stopPropagation();
    const inputPin = window.prompt(
      `[${survey.groupName}] 설문을 삭제하려면 모둠 비밀번호 또는 교사 비밀번호를 입력하세요.`
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
    const pin = window.prompt('교사 관리자 비밀번호를 입력하세요.');
    if (pin === TEACHER_PIN) {
      setIsTeacherMode(true);
      setSelectedId(null);
      setIsCreating(false);
    } else if (pin !== null) {
      alert('비밀번호가 일치하지 않습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600 font-medium">
        실시간 수행평가 데이터를 불러오는 중입니다...
      </div>
    );
  }

  /* =========================================================
     1. 초기 로그인 화면 (학번 + 이름 입력)
     ========================================================= */
  if (!currentUser && !isTeacherMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
                <BarChart3 className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">문수중 통계 수행평가</h1>
                <p className="text-xs text-slate-500">중학교 1학년 수학 · 자료의 정리와 해석</p>
              </div>
            </div>
            <button
              onClick={handleOpenTeacherMode}
              className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-lg"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> 교사
            </button>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-6 text-xs text-indigo-900 space-y-1">
            <p className="font-bold">📌 접속 안내</p>
            <p>• 본인의 <strong>학번(4자리)</strong>과 <strong>이름</strong>을 입력하면 해당 반으로 자동 입장됩니다.</p>
            <p>• 2차시 수업에서도 같은 학번·이름으로 로그인하면 내 모둠 기록이 이어집니다.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">학번 (4자리 숫자)</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="예: 1212 (1학년 2반 12번)"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base font-bold tracking-wider focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">이름</label>
              <input
                type="text"
                required
                placeholder="예: 홍길동"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {loginError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold p-3 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl text-base shadow-md transition"
            >
              수행평가 입장하기 →
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* =========================================================
     2. 메인 애플리케이션 화면
     ========================================================= */
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
            }}
          >
            <BarChart3 className="w-7 h-7 text-indigo-200" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">중1 수학 통계 수행평가</h1>
                <span className="text-xs font-extrabold bg-white/20 px-2 py-0.5 rounded">
                  {activeClass} · {currentPhase === 1 ? '1차시: 조사·수집 단계' : '2차시: 정리·해석·평가 단계'}
                </span>
              </div>
              {currentUser && (
                <p className="text-xs text-indigo-100">
                  접속자: <strong>{currentUser.studentId} {currentUser.studentName}</strong>
                  {myGroup ? ` · 소속: ${myGroup.groupName}` : ' · 소속 모둠 미지정'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQrModal(true)}
              className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold px-3 py-2 rounded-lg text-xs transition"
            >
              <QrCode className="w-4 h-4" /> QR
            </button>

            <button
              onClick={handleOpenTeacherMode}
              className={`flex items-center gap-1 font-semibold px-3 py-2 rounded-lg text-xs transition ${
                isTeacherMode
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-indigo-800 hover:bg-indigo-900 text-indigo-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              {isTeacherMode ? '교사 모드 종료' : '교사 관리'}
            </button>

            {currentUser && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 bg-indigo-700 hover:bg-indigo-800 text-indigo-100 font-semibold px-3 py-2 rounded-lg text-xs transition"
                title="로그아웃 (학번 변경)"
              >
                <LogOut className="w-3.5 h-3.5" /> 나가기
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 교사 관리자 대시보드 */}
        {isTeacherMode && (
          <TeacherDashboard
            teacherClass={teacherClass}
            setTeacherClass={setTeacherClass}
            surveys={classSurveys}
            allSurveys={surveys}
            currentPhase={currentPhase}
          />
        )}

        {/* 학생 내 수행평가 진행 현황 바 */}
        {!isTeacherMode && currentUser && !isCreating && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 flex flex-wrap items-center justify-between gap-4 shadow-sm no-print">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">내 모둠:</span>
                {myGroup ? (
                  <button
                    onClick={() => setSelectedId(myGroup.id)}
                    className="font-extrabold text-indigo-600 underline hover:text-indigo-800"
                  >
                    {myGroup.groupName} 바로가기 →
                  </button>
                ) : (
                  <span className="text-rose-600 font-bold">아직 없음 (모둠을 만들거나 합류하세요)</span>
                )}
              </div>

              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              <div>
                <span className="font-bold text-slate-500">타 모둠 설문 참여: </span>
                <strong className="text-emerald-600">
                  {myParticipationStats.otherAnswered} / {myParticipationStats.otherTotal}개 모둠 완료
                </strong>
                <span className="text-slate-400 ml-1">(많이 참여할수록 점수 반영)</span>
              </div>

              {myGroup && (
                <>
                  <div className="h-4 w-px bg-slate-200 hidden sm:block" />
                  <div>
                    <span className="font-bold text-slate-500">모둠 랜덤 과제: </span>
                    {(myGroup.assignedMissions || []).map((mKey) => {
                      const done = myGroup.missionStatus?.[mKey];
                      return (
                        <span
                          key={mKey}
                          className={`inline-block mr-1.5 px-2 py-0.5 rounded font-bold ${
                            done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {MISSION_META[mKey]?.label.split(' ')[0]} {done ? '✓' : '미완료'}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {!selectedId && !myGroup && currentPhase === 1 && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow transition"
              >
                <Plus className="w-4 h-4" /> 새 모둠·주제 만들기
              </button>
            )}
          </div>
        )}

        {/* 새 모둠 설문 생성 화면 */}
        {!isTeacherMode && isCreating && currentUser && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <button
              onClick={() => setIsCreating(false)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> {currentUser.className} 목록으로 돌아가기
            </button>
            <h2 className="text-xl font-bold mb-1">[{currentUser.className}] 새 모둠 및 설문 주제 개설</h2>
            <p className="text-xs text-slate-500 mb-4">
              모둠장: <strong>{currentUser.studentId} {currentUser.studentName}</strong> · 개설 시 4가지 통계 표현 중 2가지 직접 제작 미션이 랜덤 배정됩니다.
            </p>

            {/* 다른 모둠과 주제 중복 방지 안내 */}
            {classSurveys.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900">
                <p className="font-bold mb-1">⚠️ 이미 등록된 우리 반 주제 (중복을 피해 주세요):</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {classSurveys.map((s) => (
                    <li key={s.id}>{s.groupName}: {s.topic}</li>
                  ))}
                </ul>
              </div>
            )}

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
                  <label className="block text-sm font-semibold mb-1">모둠 비밀번호 (4자리) *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="모둠원 합류·관리용"
                    value={roomPin}
                    onChange={(e) => setRoomPin(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
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
                모둠 방 생성하고 시작하기
              </button>
            </form>
          </div>
        )}

        {/* 반별 모둠 목록 화면 */}
        {!isTeacherMode && !isCreating && !currentSurvey && currentUser && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{currentUser.className} 모둠별 설문 목록</h2>
                <p className="text-xs text-slate-500">
                  다른 모둠 카드에 들어가 설문에 응답해 주세요! (모둠별 최대 {MAX_SURVEY_RESPONSES}명까지 응답 가능)
                </p>
              </div>
              <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                총 {classSurveys.length}개 모둠
              </span>
            </div>

            {classSurveys.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">{currentUser.className}에 아직 개설된 모둠이 없습니다.</p>
                <p className="text-sm text-slate-500 mb-5">모둠장이 [새 모둠·주제 만들기] 버튼을 눌러 방을 개설해 주세요!</p>
                {currentPhase === 1 && (
                  <button
                    onClick={() => setIsCreating(true)}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition"
                  >
                    <Plus className="w-4 h-4" /> 새 모둠·주제 만들기
                  </button>
                )}
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
                    <div
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`bg-white rounded-2xl border p-5 hover:shadow-md transition cursor-pointer flex flex-col justify-between ${
                        isMyGroup ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md">
                              {s.groupName} ({members.length}/{MAX_GROUP_MEMBERS}명)
                            </span>
                            {isMyGroup && (
                              <span className="text-xs font-extrabold bg-indigo-600 text-white px-2 py-0.5 rounded">
                                내 모둠
                              </span>
                            )}
                            {iAnswered ? (
                              <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                ✓ 설문 참여완료
                              </span>
                            ) : (
                              !isFull && !s.isLocked && currentPhase === 1 && (
                                <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded">
                                  미참여 (참여 가능)
                                </span>
                              )
                            )}
                            {(s.isLocked || isFull || currentPhase === 2) && (
                              <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded flex items-center gap-1">
                                <Lock className="w-3 h-3" /> {isFull ? '25명 마감' : '투표 마감'}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => handleDeleteSurvey(s, e)}
                            className="text-slate-400 hover:text-rose-500 p-1"
                            title="설문 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <h3 className="font-bold text-lg text-slate-800 mb-1">{s.topic}</h3>
                        <p className="text-xs text-slate-500 mb-3">
                          모둠원: {members.map((m) => `${m.studentId} ${m.studentName}`).join(', ') || '없음'}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-slate-600">
                          <span>
                            응답 인원: <strong className="text-indigo-600">{entries.length} / {MAX_SURVEY_RESPONSES}명</strong>
                          </span>
                          <span className="flex items-center gap-0.5 text-rose-500">
                            <Heart className="w-3.5 h-3.5 fill-rose-500" /> {s.likes || 0}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {!myGroup && members.length < MAX_GROUP_MEMBERS && currentPhase === 1 && (
                            <button
                              onClick={(e) => handleJoinGroup(s, e)}
                              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg"
                            >
                              <UserPlus className="w-3.5 h-3.5" /> 모둠 합류
                            </button>
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

        {/* 선택된 모둠 상세 워크스페이스 */}
        {!isTeacherMode && !isCreating && currentSurvey && currentUser && (
          <SurveyWorkspace
            survey={currentSurvey}
            currentUser={currentUser}
            currentPhase={currentPhase}
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
   모둠 상세 워크스페이스 (5개 탭 + 랜덤 2종 직접 제작 미션)
   ========================================================= */
function SurveyWorkspace({ survey, currentUser, currentPhase, onBack }) {
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

  const assignedMissions = survey.assignedMissions || ['stem', 'table'];
  const missionStatus = survey.missionStatus || {};

  // 투표 잠금 토글
  const handleToggleLock = async () => {
    if (currentPhase === 2) {
      alert('현재 선생님이 2차시(정리·평가 단계)로 전환하여 투표를 다시 열 수 없습니다.');
      return;
    }
    const pin = window.prompt('투표 상태를 변경하려면 모둠 비밀번호 또는 교사 비밀번호를 입력하세요.');
    if (pin !== survey.pin && pin !== TEACHER_PIN) {
      if (pin !== null) alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    await updateDoc(doc(db, 'surveys', survey.id), {
      isLocked: !survey.isLocked,
    });
  };

  // 모둠원 강퇴 기능
  const handleKickMember = async (targetMember) => {
    if (targetMember.studentId === survey.leaderId) {
      alert('모둠장은 강퇴할 수 없습니다.');
      return;
    }
    const pin = window.prompt(
      `[${targetMember.studentId} ${targetMember.studentName}] 학생을 모둠에서 강퇴하려면 모둠 비밀번호 또는 교사 비밀번호를 입력하세요.`
    );
    if (pin !== survey.pin && pin !== TEACHER_PIN) {
      if (pin !== null) alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!window.confirm(`정말 ${targetMember.studentName} 학생을 모둠에서 제외할까요?`)) return;

    const nextMembers = members.filter((m) => m.studentId !== targetMember.studentId);
    const nextSubs = (survey.individualSubmissions || []).filter(
      (sub) => sub.studentId !== targetMember.studentId
    );
    await updateDoc(doc(db, 'surveys', survey.id), {
      memberList: nextMembers,
      individualSubmissions: nextSubs
    });
    alert('모둠원에서 제외되었습니다.');
  };

  // 설문 투표 제출 (로그인한 학번·이름 자동 사용, 최대 25명 제한)
  const handleAddVote = async (e) => {
    e.preventDefault();
    if (isSurveyClosed) {
      alert('마감된 설문입니다.');
      return;
    }
    if (entries.length >= MAX_SURVEY_RESPONSES) {
      alert(`최대 응답 인원(${MAX_SURVEY_RESPONSES}명)이 마감되었습니다.`);
      return;
    }
    const num = Number(singleVal);
    if (singleVal.trim() === '' || isNaN(num)) return;

    const already = entries.some((item) => item.studentId === currentUser.studentId);
    if (already) {
      alert('이미 이 설문에 응답하셨습니다.');
      return;
    }

    await updateDoc(doc(db, 'surveys', survey.id), {
      entries: [
        ...entries,
        {
          studentId: currentUser.studentId,
          studentName: currentUser.studentName,
          value: num
        }
      ],
    });
    setSingleVal('');
  };

  // 오입력/장난 응답 삭제
  const handleRemoveEntry = async (idxToRemove) => {
    const pin = window.prompt('응답을 삭제하려면 모둠 비밀번호 또는 교사 비밀번호를 입력하세요.');
    if (pin !== survey.pin && pin !== TEACHER_PIN) {
      if (pin !== null) alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    const next = entries.filter((_, i) => i !== idxToRemove);
    await updateDoc(doc(db, 'surveys', survey.id), {
      entries: next,
    });
  };

  // 계급 변경 시 미션 완료 상태 초기화 후 저장
  const handleSaveClassSetting = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      classStart: Number(classStart),
      classWidth: Math.max(1, Number(classWidth)),
      missionStatus: { stem: missionStatus.stem || false, table: false, hist: false, poly: false }
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleSaveInterpretation = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      interpretation,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const handleCompleteMission = async (missionKey) => {
    if (missionStatus[missionKey]) return;
    await updateDoc(doc(db, 'surveys', survey.id), {
      [`missionStatus.${missionKey}`]: true
    });
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
      comments: [
        ...(survey.comments || []),
        `${currentUser.studentName}: ${commentInput.trim()}`
      ],
    });
    setCommentInput('');
  };

  // 기초 통계량
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
      range: Number((sorted[n - 1] - sorted[0]).toFixed(1)),
      mean,
      median,
      mode: modes[0],
      modeText: maxFreq === 1 && n > 1 ? '없음 (모두 1회)' : `${modes.join(', ')} (${maxFreq}회)`,
      sorted,
    };
  }, [values]);

  // 줄기와 잎 정답 데이터
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

  // 도수분포표 정답 데이터
  const freqTable = useMemo(() => {
    if (values.length === 0) return [];
    const start = Number(survey.classStart ?? classStart) || 0;
    const width = Math.max(1, Number(survey.classWidth ?? classWidth) || 10);
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
      if (rows.length > 20) break;
    }
    return rows;
  }, [values, survey.classStart, survey.classWidth, classStart, classWidth]);

  const displayedEntries = useMemo(() => {
    const indexed = entries.map((item, idx) => ({ ...item, idx }));
    if (sortAsc) {
      return indexed.sort((a, b) => Number(a.value) - Number(b.value));
    }
    return indexed;
  }, [entries, sortAsc]);

  const iAlreadyVoted = entries.some((item) => item.studentId === currentUser.studentId);

  return (
    <div>
      {/* 상단 내비게이션 */}
      <div className="mb-5 no-print">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> {survey.className} 전체 모둠 목록으로
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded">
                  {survey.className} · {survey.groupName}
                </span>
                <button
                  onClick={handleToggleLock}
                  className={`text-xs font-bold px-2.5 py-0.5 rounded flex items-center gap-1 transition ${
                    isSurveyClosed
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  }`}
                >
                  {isSurveyClosed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  {isSurveyClosed ? '투표 마감됨' : '투표 진행 중 (마감하기)'}
                </button>
              </div>
              <h2 className="text-xl font-bold text-slate-900">{survey.topic}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                단위: {survey.unit} · 응답 인원: <strong>{values.length} / {MAX_SURVEY_RESPONSES}명</strong>
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl">
              <TabBtn active={activeTab === 'vote'} onClick={() => setActiveTab('vote')} icon={<Send className="w-3.5 h-3.5" />} label="1. 설문 투표" />
              <TabBtn active={activeTab === 'stem'} onClick={() => setActiveTab('stem')} icon={<ListOrdered className="w-3.5 h-3.5" />} label="2. 줄기와 잎" />
              <TabBtn active={activeTab === 'freq'} onClick={() => setActiveTab('freq')} icon={<Table2 className="w-3.5 h-3.5" />} label="3. 도수분포표·그래프" />
              <TabBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText className="w-3.5 h-3.5" />} label="4. 모둠 보고서" />
              {isMember && (
                <TabBtn active={activeTab === 'individual'} onClick={() => setActiveTab('individual')} icon={<Award className="w-3.5 h-3.5" />} label="5. 개인별 평가" />
              )}
            </div>
          </div>

          {/* 모둠원 명단 및 강퇴 버튼 */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-500">소속 모둠원 ({members.length}/{MAX_GROUP_MEMBERS}명):</span>
              {members.map((m) => (
                <span
                  key={m.studentId}
                  className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg font-medium"
                >
                  {m.studentId} {m.studentName} ({m.role})
                  {(isLeader || isMember) && m.studentId !== survey.leaderId && (
                    <button
                      onClick={() => handleKickMember(m)}
                      className="text-rose-500 hover:text-rose-700 ml-0.5"
                      title="모둠에서 강퇴하기"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            {isMember && (
              <div className="text-xs text-indigo-700 font-bold">
                🎯 우리 모둠 랜덤 직접 제작 과제:{' '}
                {assignedMissions.map((k) => MISSION_META[k]?.label).join(' + ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================
          탭 1: 설문 투표
         ========================================================= */}
      {activeTab === 'vote' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-base mb-1">내 응답 제출하기</h3>
              <p className="text-xs text-slate-500 mb-4">
                응답자: <strong>{currentUser.studentId} {currentUser.studentName}</strong>
              </p>

              {iAlreadyVoted ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center text-xs text-emerald-800 font-bold">
                  ✓ 이미 이 모둠의 설문에 참여했습니다! 다른 모둠 설문에도 참여해 보세요.
                </div>
              ) : isSurveyClosed ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-xs text-amber-800 font-bold">
                  설문 투표가 마감되었습니다. (최대 {MAX_SURVEY_RESPONSES}명 또는 시간 종료)
                </div>
              ) : (
                <form onSubmit={handleAddVote} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder={`숫자 입력 (${survey.unit})`}
                      value={singleVal}
                      onChange={(e) => setSingleVal(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm shrink-0"
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
                <h3 className="font-bold text-base">수집된 원시 자료 ({entries.length} / {MAX_SURVEY_RESPONSES}명)</h3>
                <p className="text-xs text-slate-500">장난/오입력 항목은 모둠 비밀번호로 삭제할 수 있습니다.</p>
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
                아직 입력된 자료가 없습니다.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-6">
                  {displayedEntries.map((item) => (
                    <button
                      key={`${item.idx}-${item.studentId}`}
                      onClick={() => handleRemoveEntry(item.idx)}
                      title="클릭 시 삭제 (비밀번호 필요)"
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

      {/* =========================================================
          탭 2: 줄기와 잎 그림 (랜덤 미션 대상일 경우 직접 완성 모드)
         ========================================================= */}
      {activeTab === 'stem' && (
        <StemAndLeafSection
          survey={survey}
          stemAndLeaf={stemAndLeaf}
          isMember={isMember}
          isAssigned={assignedMissions.includes('stem')}
          isCompleted={!!missionStatus.stem}
          onComplete={() => handleCompleteMission('stem')}
        />
      )}

      {/* =========================================================
          탭 3: 도수분포표·히스토그램·도수분포다각형 (랜덤 미션 포함)
         ========================================================= */}
      {activeTab === 'freq' && (
        <div className="space-y-6">
          {isMember && (
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
                  onClick={handleSaveClassSetting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
                >
                  계급 구간 확정·저장
                </button>
                {savedNotice && (
                  <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> 저장됨!
                  </span>
                )}
              </div>
              {stats && (
                <p className="text-xs text-slate-500">
                  최솟값: <strong>{stats.min}</strong> / 최댓값: <strong>{stats.max}</strong>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 도수분포표 섹션 (미션 여부 분기) */}
            <FreqTableMissionSection
              survey={survey}
              freqTable={freqTable}
              totalCount={values.length}
              isMember={isMember}
              isAssigned={assignedMissions.includes('table')}
              isCompleted={!!missionStatus.table}
              onComplete={() => handleCompleteMission('table')}
            />

            {/* 히스토그램 & 도수분포다각형 섹션 (미션 여부 분기) */}
            <GraphMissionSection
              survey={survey}
              freqTable={freqTable}
              isMember={isMember}
              isHistAssigned={assignedMissions.includes('hist')}
              isHistCompleted={!!missionStatus.hist}
              isPolyAssigned={assignedMissions.includes('poly')}
              isPolyCompleted={!!missionStatus.poly}
              onCompleteHist={() => handleCompleteMission('hist')}
              onCompletePoly={() => handleCompleteMission('poly')}
            />
          </div>
        </div>
      )}

      {/* =========================================================
          탭 4: 모둠 자료 해석 보고서 & 상호 피드백
         ========================================================= */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          {isMember && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 no-print">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-lg">모둠 자료 해석 작성하기</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">아래 가이드 버튼을 누르면 문장 틀이 자동으로 추가됩니다.</p>

              <div className="flex flex-wrap gap-2 mb-3">
                {GUIDE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setInterpretation((prev) => prev + tpl.text)}
                    className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg border border-indigo-200"
                  >
                    + {tpl.label} 문장 넣기
                  </button>
                ))}
              </div>

              <textarea
                rows={5}
                placeholder="자료 해석 내용을 작성해 주세요..."
                value={interpretation}
                onChange={(e) => setInterpretation(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-3.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveInterpretation}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
                  >
                    해석 내용 저장하기
                  </button>
                  {savedNotice && (
                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> 저장 완료!
                    </span>
                  )}
                </div>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold px-5 py-2.5 rounded-xl text-sm"
                >
                  <Printer className="w-4 h-4" /> 보고서 인쇄 / PDF
                </button>
              </div>
            </div>
          )}

          {/* 인쇄용 최종 보고서 */}
          <div className="bg-white rounded-2xl border-2 border-slate-300 p-8 shadow-sm">
            <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
              <div>
                <p className="text-xs font-bold text-indigo-600 mb-1">
                  중학교 1학년 수학 통계 수행평가 보고서 ({survey.className})
                </p>
                <h2 className="text-2xl font-extrabold text-slate-900">{survey.topic}</h2>
              </div>
              <div className="text-right text-sm">
                <p className="font-bold">{survey.groupName}</p>
                <p className="text-slate-600 text-xs">
                  {members.map((m) => `${m.studentId} ${m.studentName}`).join(', ')}
                </p>
              </div>
            </div>

            {stats && (
              <div className="grid grid-cols-4 gap-3 mb-6">
                <StatBox label="총 조사 인원" value={`${stats.n}명`} />
                <StatBox label="평균" value={`${stats.mean} ${survey.unit}`} />
                <StatBox label="중앙값" value={`${stats.median} ${survey.unit}`} />
                <StatBox label="최빈값" value={stats.modeText} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h4 className="font-bold text-sm mb-2">1. 도수분포표</h4>
                <table className="w-full text-xs text-center border border-slate-400">
                  <thead className="bg-slate-100 font-bold border-b border-slate-400">
                    <tr>
                      <th className="py-2 border-r border-slate-400">계급 ({survey.unit})</th>
                      <th className="py-2 border-r border-slate-400">계급값</th>
                      <th className="py-2 border-r border-slate-400">도수</th>
                      <th className="py-2">상대도수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {freqTable.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 border-r border-slate-400">{r.min} ~ {r.max}</td>
                        <td className="py-1.5 border-r border-slate-400">{r.mid}</td>
                        <td className="py-1.5 border-r border-slate-400 font-bold">{r.count}</td>
                        <td className="py-1.5">{r.relFreq.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="font-bold text-sm mb-2">2. 히스토그램 및 도수분포다각형</h4>
                <StaticHistogramChart rows={freqTable} unit={survey.unit} showHist={true} showPoly={true} />
              </div>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-2">3. 모둠 자료 해석 및 결론</h4>
              <div className="min-h-[120px] border border-slate-300 rounded-xl p-4 bg-slate-50 text-sm whitespace-pre-wrap leading-relaxed">
                {interpretation || '작성된 자료 해석 내용이 없습니다.'}
              </div>
            </div>
          </div>

          {/* 다른 모둠 상호 피드백 */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 no-print">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-base flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600" /> 우리 반 친구들의 피드백
              </h4>
              <button
                onClick={handleAddLike}
                className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3.5 py-1.5 rounded-full text-xs transition"
              >
                <Heart className="w-4 h-4 fill-rose-500" /> 좋아요 {survey.likes || 0}
              </button>
            </div>
            <form onSubmit={handleAddComment} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="발표 소감이나 자료 해석에 대한 피드백을 남겨주세요..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
              <button type="submit" className="bg-slate-800 text-white font-semibold px-4 py-2 rounded-lg text-sm shrink-0">
                등록
              </button>
            </form>
            <div className="space-y-2">
              {(survey.comments || []).map((c, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-sm text-slate-700">
                  {c}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          탭 5: 개인별 평가 (컨닝 방지 개인별 다른 문항 + 익명 동료평가 + 점수 비공개)
         ========================================================= */}
      {activeTab === 'individual' && isMember && (
        <IndividualEvaluationTab
          survey={survey}
          currentUser={currentUser}
          currentPhase={currentPhase}
          stats={stats}
          freqTable={freqTable}
        />
      )}
    </div>
  );
}

/* =========================================================
   랜덤 미션 1: 줄기와 잎 그림 직접 완성하기
   ========================================================= */
function StemAndLeafSection({ survey, stemAndLeaf, isMember, isAssigned, isCompleted, onComplete }) {
  const [userLeaves, setUserLeaves] = useState({});
  const [feedback, setFeedback] = useState('');

  if (stemAndLeaf.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
        먼저 [1. 설문 투표]에서 자료를 입력해 주세요.
      </div>
    );
  }

  // 미션 대상이 아니거나, 이미 미션을 완료했거나, 타 모둠원이 열람하는 경우 정답 표시
  if (!isAssigned || isCompleted || !isMember) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg">줄기와 잎 그림</h3>
              {isAssigned && isCompleted && (
                <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                  ✓ 직접 제작 미션 통과!
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">십의 자리 이상을 줄기로, 일의 자리를 잎으로 크기순 정렬했습니다.</p>
          </div>
          <div className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg">
            범례: {stemAndLeaf[0].stem} | {stemAndLeaf[0].leaves[0]} 은(는) {stemAndLeaf[0].stem * 10 + stemAndLeaf[0].leaves[0]}{survey.unit}을 뜻함
          </div>
        </div>

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
      </div>
    );
  }

  // 미션 수행 화면
  const handleCheckStem = () => {
    for (const row of stemAndLeaf) {
      const raw = (userLeaves[row.stem] || '').trim();
      const parsed = raw
        .split(/[\s,]+/)
        .filter((x) => x !== '')
        .map(Number);

      if (parsed.length !== row.leaves.length) {
        setFeedback(`줄기 [${row.stem}]의 잎 개수가 맞지 않습니다. 원시 자료를 다시 세어 보세요.`);
        return;
      }
      for (let i = 0; i < row.leaves.length; i++) {
        if (parsed[i] !== row.leaves[i]) {
          setFeedback(`줄기 [${row.stem}]의 잎 숫자 또는 작은 값부터 순서대로 정렬되었는지 확인해 주세요.`);
          return;
        }
      }
    }
    setFeedback('');
    onComplete();
    alert('정답입니다! [줄기와 잎 그림 직접 완성] 미션을 통과했습니다.');
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-400 p-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
        <span className="text-xs font-extrabold bg-amber-500 text-white px-2.5 py-0.5 rounded">
          랜덤 직접 제작 미션
        </span>
        <h3 className="font-bold text-lg text-slate-900 mt-1">줄기와 잎 그림 직접 완성하기</h3>
        <p className="text-xs text-slate-600 mt-0.5">
          [1. 설문 투표]의 원시 자료를 보고, 각 줄기에 해당하는 <strong>일의 자리 숫자(잎)를 작은 값부터 띄어쓰기로 구분</strong>하여 입력하세요. (예: <code>1 3 5 8</code>)
        </p>
      </div>

      <div className="max-w-lg mx-auto overflow-hidden border border-slate-300 rounded-xl mb-4">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr className="bg-indigo-50 text-indigo-900 font-bold text-sm border-b border-slate-300">
              <th className="w-28 py-3 border-r-2 border-indigo-400">줄기</th>
              <th className="py-3 text-left pl-6">잎 (작은 수부터 띄어쓰기로 입력)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {stemAndLeaf.map((row) => (
              <tr key={row.stem}>
                <td className="py-3 font-bold text-indigo-700 border-r-2 border-indigo-400 bg-slate-50">
                  {row.stem}
                </td>
                <td className="py-2 px-4">
                  <input
                    type="text"
                    placeholder="예: 0 2 5 5 9"
                    value={userLeaves[row.stem] || ''}
                    onChange={(e) => setUserLeaves({ ...userLeaves, [row.stem]: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {feedback && (
        <p className="text-center text-xs font-bold text-rose-600 mb-3">{feedback}</p>
      )}

      <div className="text-center">
        <button
          onClick={handleCheckStem}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm shadow"
        >
          줄기와 잎 그림 정답 확인하기
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   랜덤 미션 2: 도수분포표 빈칸 채우기
   ========================================================= */
function FreqTableMissionSection({ survey, freqTable, totalCount, isMember, isAssigned, isCompleted, onComplete }) {
  const [inputs, setInputs] = useState({});
  const [feedback, setFeedback] = useState('');

  if (freqTable.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center text-slate-400 text-sm">
        자료가 없습니다.
      </div>
    );
  }

  if (!isAssigned || isCompleted || !isMember) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">도수분포표 및 상대도수</h3>
          {isAssigned && isCompleted && (
            <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
              ✓ 직접 제작 통과
            </span>
          )}
        </div>
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
                <td className="py-2 border-r border-slate-300 text-indigo-700">{totalCount}</td>
                <td className="py-2">1.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const handleCheckTable = () => {
    for (let i = 0; i < freqTable.length; i++) {
      const r = freqTable[i];
      const rowIn = inputs[i] || {};
      if (Math.abs(Number(rowIn.mid) - r.mid) > 0.05) {
        setFeedback(`${i + 1}번째 계급의 '계급값'이 틀렸습니다.`);
        return;
      }
      if (Number(rowIn.count) !== r.count || rowIn.count === '' || rowIn.count === undefined) {
        setFeedback(`${i + 1}번째 계급의 '도수'가 틀렸습니다.`);
        return;
      }
      if (Math.abs(Number(rowIn.rel) - r.relFreq) > 0.015 || rowIn.rel === '' || rowIn.rel === undefined) {
        setFeedback(`${i + 1}번째 계급의 '상대도수'를 소수 둘째 자리까지 정확히 계산해 주세요.`);
        return;
      }
    }
    setFeedback('');
    onComplete();
    alert('정답입니다! [도수분포표 빈칸 채우기] 미션을 통과했습니다.');
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-400 p-5">
      <div className="mb-3">
        <span className="text-xs font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded">
          랜덤 직접 제작 미션
        </span>
        <h3 className="font-bold text-base mt-1">도수분포표 빈칸 직접 채우기</h3>
        <p className="text-xs text-slate-500">계급값, 도수, 상대도수(소수 둘째 자리)를 직접 계산해 입력하세요.</p>
      </div>

      <div className="overflow-x-auto mb-3">
        <table className="w-full text-xs text-center border border-slate-300">
          <thead className="bg-slate-100 font-bold border-b border-slate-300">
            <tr>
              <th className="py-2 px-1 border-r border-slate-300">계급 ({survey.unit})</th>
              <th className="py-2 px-1 border-r border-slate-300">계급값</th>
              <th className="py-2 px-1 border-r border-slate-300">도수</th>
              <th className="py-2 px-1">상대도수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {freqTable.map((r, i) => (
              <tr key={i}>
                <td className="py-1.5 px-1 border-r border-slate-300 font-medium">
                  {r.min} ~ {r.max}
                </td>
                <td className="p-1 border-r border-slate-300">
                  <input
                    type="number"
                    step="any"
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-center"
                    value={inputs[i]?.mid ?? ''}
                    onChange={(e) =>
                      setInputs({ ...inputs, [i]: { ...inputs[i], mid: e.target.value } })
                    }
                  />
                </td>
                <td className="p-1 border-r border-slate-300">
                  <input
                    type="number"
                    className="w-14 border border-slate-300 rounded px-1.5 py-1 text-center"
                    value={inputs[i]?.count ?? ''}
                    onChange={(e) =>
                      setInputs({ ...inputs, [i]: { ...inputs[i], count: e.target.value } })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-16 border border-slate-300 rounded px-1.5 py-1 text-center"
                    value={inputs[i]?.rel ?? ''}
                    onChange={(e) =>
                      setInputs({ ...inputs, [i]: { ...inputs[i], rel: e.target.value } })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {feedback && <p className="text-xs font-bold text-rose-600 mb-2 text-center">{feedback}</p>}

      <button
        onClick={handleCheckTable}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs shadow"
      >
        도수분포표 정답 확인하기
      </button>
    </div>
  );
}

/* =========================================================
   랜덤 미션 3 & 4: 히스토그램 막대 조작 & 도수분포다각형 꼭짓점 조작
   ========================================================= */
function GraphMissionSection({
  survey,
  freqTable,
  isMember,
  isHistAssigned,
  isHistCompleted,
  isPolyAssigned,
  isPolyCompleted,
  onCompleteHist,
  onCompletePoly
}) {
  const [userBars, setUserBars] = useState([]);
  const [userPoly, setUserPoly] = useState([]);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setUserBars(freqTable.map(() => 0));
    setUserPoly(Array(freqTable.length + 2).fill(0));
  }, [freqTable.length]);

  if (freqTable.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center text-slate-400 text-sm">
        데이터가 없습니다.
      </div>
    );
  }

  const needHistMission = isMember && isHistAssigned && !isHistCompleted;
  const needPolyMission = isMember && isPolyAssigned && !isPolyCompleted;

  // 둘 다 미션이 아니거나 완료되었으면 완성 그래프 표시
  if (!needHistMission && !needPolyMission) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base">히스토그램 & 도수분포다각형</h3>
          {(isHistCompleted || isPolyCompleted) && (
            <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
              ✓ 그래프 미션 통과
            </span>
          )}
        </div>
        <StaticHistogramChart rows={freqTable} unit={survey.unit} showHist={true} showPoly={true} />
      </div>
    );
  }

  // 히스토그램 미션 먼저 수행, 완료되면 도수분포다각형 미션 수행
  if (needHistMission) {
    const handleCheckHist = () => {
      for (let i = 0; i < freqTable.length; i++) {
        if (Number(userBars[i]) !== freqTable[i].count) {
          setFeedback(`${freqTable[i].min}~${freqTable[i].max} 계급의 막대 높이(도수)가 일치하지 않습니다.`);
          return;
        }
      }
      setFeedback('');
      onCompleteHist();
      alert('정답입니다! [히스토그램 막대 그리기] 미션을 통과했습니다.');
    };

    return (
      <div className="bg-white rounded-2xl border-2 border-amber-400 p-5">
        <span className="text-xs font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded">
          랜덤 직접 제작 미션
        </span>
        <h3 className="font-bold text-base mt-1">히스토그램 막대 높이 직접 맞추기</h3>
        <p className="text-xs text-slate-500 mb-3">각 계급의 도수에 맞게 +/- 버튼으로 막대 높이를 조절하세요.</p>

        <StaticHistogramChart
          rows={freqTable.map((r, i) => ({ ...r, count: userBars[i] ?? 0 }))}
          maxOverride={Math.max(...freqTable.map((r) => r.count), 4)}
          unit={survey.unit}
          showHist={true}
          showPoly={false}
        />

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 my-3">
          {freqTable.map((r, i) => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center text-xs">
              <span className="block font-bold text-slate-600 mb-1">{r.min}~{r.max}</span>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = [...userBars];
                    next[i] = Math.max(0, (next[i] || 0) - 1);
                    setUserBars(next);
                  }}
                  className="w-6 h-6 bg-white border border-slate-300 rounded font-bold"
                >
                  -
                </button>
                <span className="font-extrabold text-indigo-600 w-4">{userBars[i] ?? 0}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...userBars];
                    next[i] = (next[i] || 0) + 1;
                    setUserBars(next);
                  }}
                  className="w-6 h-6 bg-white border border-slate-300 rounded font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {feedback && <p className="text-xs font-bold text-rose-600 mb-2 text-center">{feedback}</p>}

        <button
          onClick={handleCheckHist}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs shadow"
        >
          히스토그램 정답 확인하기
        </button>
      </div>
    );
  }

  // 도수분포다각형 미션
  const targetPoly = [0, ...freqTable.map((r) => r.count), 0];
  const handleCheckPoly = () => {
    for (let i = 0; i < targetPoly.length; i++) {
      if (Number(userPoly[i]) !== targetPoly[i]) {
        if (i === 0 || i === targetPoly.length - 1) {
          setFeedback('도수분포다각형의 양 끝점은 도수가 0인 계급의 중앙(높이 0)에 찍어야 합니다.');
        } else {
          setFeedback(`${freqTable[i - 1].min}~${freqTable[i - 1].max} 계급 중앙의 점 높이가 틀렸습니다.`);
        }
        return;
      }
    }
    setFeedback('');
    onCompletePoly();
    alert('정답입니다! [도수분포다각형 꼭짓점 찍기] 미션을 통과했습니다.');
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-400 p-5">
      <span className="text-xs font-extrabold bg-amber-500 text-white px-2 py-0.5 rounded">
        랜덤 직접 제작 미션
      </span>
      <h3 className="font-bold text-base mt-1">도수분포다각형 꼭짓점 직접 찍기</h3>
      <p className="text-xs text-slate-500 mb-3">각 계급의 중앙과 양 끝점의 높이를 조절해 다각형을 완성하세요.</p>

      <StaticHistogramChart
        rows={freqTable}
        customPolyValues={userPoly}
        maxOverride={Math.max(...freqTable.map((r) => r.count), 4)}
        unit={survey.unit}
        showHist={false}
        showPoly={true}
      />

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 my-3">
        {targetPoly.map((_, i) => {
          const label =
            i === 0
              ? '왼쪽 끝점'
              : i === targetPoly.length - 1
              ? '오른쪽 끝점'
              : `${freqTable[i - 1].mid}(중앙)`;
          return (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center text-xs">
              <span className="block font-bold text-slate-600 mb-1 truncate">{label}</span>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = [...userPoly];
                    next[i] = Math.max(0, (next[i] || 0) - 1);
                    setUserPoly(next);
                  }}
                  className="w-6 h-6 bg-white border border-slate-300 rounded font-bold"
                >
                  -
                </button>
                <span className="font-extrabold text-rose-600 w-4">{userPoly[i] ?? 0}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...userPoly];
                    next[i] = (next[i] || 0) + 1;
                    setUserPoly(next);
                  }}
                  className="w-6 h-6 bg-white border border-slate-300 rounded font-bold"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {feedback && <p className="text-xs font-bold text-rose-600 mb-2 text-center">{feedback}</p>}

      <button
        onClick={handleCheckPoly}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs shadow"
      >
        도수분포다각형 정답 확인하기
      </button>
    </div>
  );
}

/* =========================================================
   탭 5: 개인별 평가 (학번 시드 기반 컨닝 방지 문항 + 익명 동료평가 + 점수 비공개)
   ========================================================= */
function IndividualEvaluationTab({ survey, currentUser, currentPhase, stats, freqTable }) {
  const [roleText, setRoleText] = useState('');
  const [personalInsight, setPersonalInsight] = useState('');
  const [ans1, setAns1] = useState('');
  const [ans2, setAns2] = useState('');
  const [ans3, setAns3] = useState('');
  const [peerScoresInput, setPeerScoresInput] = useState({});

  const members = survey.memberList || [];
  const otherMembers = members.filter((m) => m.studentId !== currentUser.studentId);
  const submissions = survey.individualSubmissions || [];
  const myExistingSub = submissions.find((s) => s.studentId === currentUser.studentId);

  if (!stats || freqTable.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
        설문 자료를 수집하고 도수분포표를 확정한 뒤에 개인별 평가를 진행할 수 있습니다.
      </div>
    );
  }

  // 학생 학번 기반 컨닝 방지 맞춤형 3문항 생성
  const seed = Number(currentUser.studentId) || 1;
  const maxRow = freqTable.reduce((best, r) => (r.count > best.count ? r : best), freqTable[0]);
  const minRow = freqTable.reduce((best, r) => (r.count < best.count ? r : best), freqTable[0]);
  const targetRowIdx = seed % freqTable.length;
  const targetRow = freqTable[targetRowIdx];

  // Q1 변형 (평균 / 중앙값 / 범위)
  const q1Type = seed % 3;
  const q1Data =
    q1Type === 0
      ? {
          question: `Q1. 우리 모둠 전체 자료(${stats.n}개)의 '평균'은 얼마인가요? (소수 첫째 자리까지)`,
          answer: stats.mean
        }
      : q1Type === 1
      ? {
          question: `Q1. 우리 모둠 전체 자료(${stats.n}개)의 '중앙값'은 얼마인가요?`,
          answer: stats.median
        }
      : {
          question: `Q1. 우리 모둠 자료의 최댓값과 최솟값의 차이(범위)는 얼마인가요?`,
          answer: stats.range
        };

  // Q2 변형 (특정 계급의 계급값 / 도수)
  const q2Type = Math.floor(seed / 3) % 2;
  const q2Data =
    q2Type === 0
      ? {
          question: `Q2. [${targetRow.min} 이상 ~ ${targetRow.max} 미만] 계급의 '계급값'은 얼마인가요?`,
          answer: targetRow.mid
        }
      : {
          question: `Q2. 도수가 가장 큰 계급의 '도수(명)'는 몇 명인가요?`,
          answer: maxRow.count
        };

  // Q3 변형 (최빈 계급 상대도수 / 최소 계급 상대도수 / 특정 계급 상대도수)
  const q3Type = Math.floor(seed / 7) % 3;
  const q3Data =
    q3Type === 0
      ? {
          question: `Q3. 도수가 가장 큰 계급의 '상대도수'는 얼마인가요? (소수 둘째 자리까지)`,
          answer: maxRow.relFreq
        }
      : q3Type === 1
      ? {
          question: `Q3. 도수가 가장 작은 계급의 '상대도수'는 얼마인가요? (소수 둘째 자리까지)`,
          answer: minRow.relFreq
        }
      : {
          question: `Q3. [${targetRow.min} 이상 ~ ${targetRow.max} 미만] 계급의 '상대도수'는 얼마인가요? (소수 둘째 자리까지)`,
          answer: targetRow.relFreq
        };

  const handleSubmitIndividual = async (e) => {
    e.preventDefault();
    if (!roleText.trim() || !personalInsight.trim()) return;

    // 퀴즈 채점 (문항당 10점, 총 30점 만점 - 학생에게는 비공개)
    let quizScore = 0;
    if (Math.abs(Number(ans1) - Number(q1Data.answer)) < 0.06) quizScore += 10;
    if (Math.abs(Number(ans2) - Number(q2Data.answer)) < 0.06) quizScore += 10;
    if (Math.abs(Number(ans3) - Number(q3Data.answer)) < 0.015) quizScore += 10;

    // 익명 모둠원 상호 평가 저장 (15점 만점 기준: 상 15, 중 12, 하 9)
    const existingRatings = (survey.peerRatings || []).filter(
      (r) => r.fromId !== currentUser.studentId
    );
    const newRatings = otherMembers.map((m) => ({
      fromId: currentUser.studentId,
      toId: m.studentId,
      score: Number(peerScoresInput[m.studentId] || 15)
    }));

    const filteredSubs = submissions.filter((s) => s.studentId !== currentUser.studentId);
    const newSub = {
      studentId: currentUser.studentId,
      studentName: currentUser.studentName,
      roleText: roleText.trim(),
      personalInsight: personalInsight.trim(),
      quizScore, // 교사용 DB에만 저장되고 UI에는 노출하지 않음
      submittedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    };

    await updateDoc(doc(db, 'surveys', survey.id), {
      individualSubmissions: [...filteredSubs, newSub],
      peerRatings: [...existingRatings, ...newRatings]
    });

    // 학생 화면에는 점수를 절대 노출하지 않고 제출 완료 안내만 표시
    alert(
      `${currentUser.studentId} ${currentUser.studentName} 학생의 개인별 수행평가 답안이 정상적으로 제출되었습니다. 수고하셨습니다!`
    );
    setAns1('');
    setAns2('');
    setAns3('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg">개인별 수행평가 답안 제출</h3>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded">
            응시자: {currentUser.studentId} {currentUser.studentName}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-5">
          공정한 평가를 위해 모둠원마다 <strong>서로 다른 맞춤형 문항</strong>이 출제되며, 채점 결과는 비공개로 선생님께 전송됩니다.
        </p>

        {currentPhase === 1 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-sm text-amber-900 font-semibold">
            현재 1차시(조사·수집 단계)입니다. 선생님이 2차시(정리·평가 단계)를 열면 개인별 문항이 활성화됩니다.
          </div>
        ) : (
          <form onSubmit={handleSubmitIndividual} className="space-y-4">
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 space-y-3">
              <h4 className="font-bold text-sm text-indigo-900">
                [개인별 맞춤형 문항] 우리 모둠 자료를 읽고 답을 입력하세요
              </h4>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{q1Data.question}</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="숫자만 입력"
                  value={ans1}
                  onChange={(e) => setAns1(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{q2Data.question}</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="숫자만 입력"
                  value={ans2}
                  onChange={(e) => setAns2(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{q3Data.question}</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="소수 둘째 자리까지 입력 (예: 0.25)"
                  value={ans3}
                  onChange={(e) => setAns3(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* 익명 모둠원 상호 기여도 평가 */}
            {otherMembers.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h4 className="font-bold text-sm text-slate-800 mb-1">
                  우리 모둠원 참여도 상호 평가 (익명 처리)
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  함께 활동한 모둠원들의 성실도와 기여도를 공정하게 평가해 주세요. (본인 평가 결과는 친구에게 공개되지 않습니다)
                </p>
                <div className="space-y-2">
                  {otherMembers.map((m) => (
                    <div key={m.studentId} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                      <span className="font-bold">{m.studentId} {m.studentName}</span>
                      <select
                        value={peerScoresInput[m.studentId] || 15}
                        onChange={(e) =>
                          setPeerScoresInput({ ...peerScoresInput, [m.studentId]: Number(e.target.value) })
                        }
                        className="border border-slate-300 rounded px-2.5 py-1 font-semibold bg-white"
                      >
                        <option value={15}>매우 적극적 (상)</option>
                        <option value={12}>보통 참여 (중)</option>
                        <option value={9}>소극적 참여 (하)</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold mb-1">내가 맡은 역할 및 구체적 활동 내용 *</label>
              <input
                type="text"
                required
                placeholder="예: 설문 문항 제작, 도수분포표 빈칸 계산 및 자료 해석 초안 작성"
                value={roleText}
                onChange={(e) => setRoleText(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1">개인 소감 및 내가 발견한 통계적 사실 1가지 *</label>
              <textarea
                rows={3}
                required
                placeholder="우리 모둠 자료에서 본인이 직접 발견한 통계적 특징을 적어주세요."
                value={personalInsight}
                onChange={(e) => setPersonalInsight(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-3 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-sm shadow-sm"
            >
              {myExistingSub ? '개인별 평가 다시 제출하기 (최신 답안 반영)' : '개인별 평가 최종 제출하기'}
            </button>
          </form>
        )}
      </div>

      {/* 제출 완료 여부만 표시 (점수 비공개) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h4 className="font-bold text-base mb-1">모둠원 제출 현황 ({submissions.length}/{members.length}명)</h4>
        <p className="text-xs text-slate-500 mb-4">채점 점수는 비공개이며, 제출 완료 여부만 표시됩니다.</p>
        <div className="space-y-2.5">
          {members.map((m) => {
            const sub = submissions.find((s) => s.studentId === m.studentId);
            return (
              <div key={m.studentId} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm block">{m.studentId} {m.studentName}</span>
                  <span className="text-[11px] text-slate-500">{sub ? `${sub.submittedAt} 제출 완료` : '아직 미제출'}</span>
                </div>
                {sub ? (
                  <span className="text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                    ✓ 제출됨
                  </span>
                ) : (
                  <span className="text-xs font-semibold bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
                    대기 중
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   교사 관리자 대시보드 (1·2차시 제어 + 루브릭 채점 + 세부 항목 CSV 다운로드)
   ========================================================= */
function TeacherDashboard({ teacherClass, setTeacherClass, surveys, allSurveys, currentPhase }) {
  const classes = ['1반', '2반', '3반', '4반', '5반', '6반'];

  const handleSetPhase = async (nextPhase) => {
    await setDoc(
      doc(db, 'classSettings', teacherClass),
      { phase: nextPhase },
      { merge: true }
    );
  };

  const handleRubricAnalysisChange = async (survey, val) => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      rubricAnalysis: Number(val),
    });
  };

  // 전체 학생 세부 점수 산출 (100점 만점 + 30점 환산)
  // 배점: 랜덤미션2종(20) + 교사자료해석(20) + 개인맞춤퀴즈(30) + 타모둠설문참여(15) + 익명동료평가(15) = 100점
  const allStudentRows = useMemo(() => {
    const rows = [];
    surveys.forEach((s) => {
      const assigned = s.assignedMissions || ['stem', 'table'];
      const status = s.missionStatus || {};
      const mission1Score = status[assigned[0]] ? 10 : 0;
      const mission2Score = status[assigned[1]] ? 10 : 0;
      const missionTotal = mission1Score + mission2Score; // 20점 만점
      const analysisScore = Number(s.rubricAnalysis ?? 20); // 20점 만점
      const groupCommonScore = missionTotal + analysisScore; // 40점 만점

      const otherSurveys = surveys.filter((other) => other.id !== s.id);
      const members = s.memberList || [];
      const subs = s.individualSubmissions || [];
      const ratings = s.peerRatings || [];

      members.forEach((m) => {
        const sub = subs.find((item) => item.studentId === m.studentId);
        const quizScore = sub ? Number(sub.quizScore) : 0; // 30점 만점

        // 타 모둠 설문 참여 비율 계산 (15점 만점)
        const participatedCount = otherSurveys.filter((other) =>
          (other.entries || []).some((ent) => ent.studentId === m.studentId)
        ).length;
        const surveyParticipationScore =
          otherSurveys.length === 0
            ? 15
            : Math.round((participatedCount / otherSurveys.length) * 15);

        // 익명 모둠원 상호 평가 평균 (15점 만점)
        const receivedRatings = ratings.filter((r) => r.toId === m.studentId);
        const peerAvgScore =
          receivedRatings.length === 0
            ? 15
            : Math.round(
                receivedRatings.reduce((acc, r) => acc + Number(r.score), 0) / receivedRatings.length
              );

        const total100 = groupCommonScore + quizScore + surveyParticipationScore + peerAvgScore;
        const converted30 = Number(((total100 / 100) * 30).toFixed(1));

        rows.push({
          className: s.className,
          studentId: m.studentId,
          studentName: m.studentName,
          groupName: s.groupName,
          topic: s.topic,
          submitted: sub ? '제출' : '미제출',
          missionTotal,
          analysisScore,
          quizScore,
          participatedText: `${participatedCount}/${otherSurveys.length}`,
          surveyParticipationScore,
          peerAvgScore,
          total100,
          converted30,
          roleText: sub?.roleText || '',
          personalInsight: sub?.personalInsight || ''
        });
      });
    });
    return rows.sort((a, b) => a.studentId.localeCompare(b.studentId));
  }, [surveys]);

  const handleDownloadCsv = () => {
    const headers = [
      '반',
      '학번',
      '이름',
      '소속모둠',
      '조사주제',
      '제출여부',
      '랜덤제작미션(20)',
      '자료해석루브릭(20)',
      '개인맞춤퀴즈(30)',
      '타모둠참여횟수',
      '설문참여점수(15)',
      '익명동료평가(15)',
      '최종총점(100)',
      '30점환산점수',
      '담당역할',
      '개인통계해석'
    ];
    const csvLines = [
      headers.join(','),
      ...allStudentRows.map((row) =>
        [
          row.className,
          row.studentId,
          row.studentName,
          `"${row.groupName}"`,
          `"${row.topic.replace(/"/g, '""')}"`,
          row.submitted,
          row.missionTotal,
          row.analysisScore,
          row.quizScore,
          `"${row.participatedText}"`,
          row.surveyParticipationScore,
          row.peerAvgScore,
          row.total100,
          row.converted30,
          `"${row.roleText.replace(/"/g, '""')}"`,
          `"${row.personalInsight.replace(/"/g, '""')}"`
        ].join(',')
      ),
    ];

    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `문수중_1학년_통계수행평가_성적표_${teacherClass}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 반 선택 및 1·2차시 제어 패널 */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">교사 관리자 및 성적 산출 대시보드</h2>
            <p className="text-xs text-slate-600">
              배점 구성: 랜덤제작미션(20) + 자료해석(20) + 개인맞춤퀴즈(30) + 타모둠참여(15) + 익명동료평가(15) = 100점
            </p>
          </div>
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm shadow-sm"
          >
            <Download className="w-4 h-4" /> [{teacherClass}] 엑셀(CSV) 세부 성적표 다운로드
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-amber-200/80">
          <div className="flex gap-1.5">
            {classes.map((cls) => (
              <button
                key={cls}
                onClick={() => setTeacherClass(cls)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  teacherClass === cls
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-slate-300'
                }`}
              >
                {cls} ({allSurveys.filter((s) => s.className === cls).length})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-700">수업 단계 제어:</span>
            <button
              onClick={() => handleSetPhase(1)}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                currentPhase === 1
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300'
              }`}
            >
              1차시 (모둠 개설·설문 수집)
            </button>
            <button
              onClick={() => handleSetPhase(2)}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                currentPhase === 2
                  ? 'bg-rose-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-300'
              }`}
            >
              2차시 (투표 일괄 마감·개인평가 오픈)
            </button>
          </div>
        </div>
      </div>

      {/* 1. 모둠별 미션 달성 현황 및 자료해석 루브릭 채점 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-base mb-4">1단계: [{teacherClass}] 모둠별 미션 달성 및 자료해석 루브릭 채점</h3>
        {surveys.length === 0 ? (
          <p className="text-sm text-slate-400">개설된 모둠이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {surveys.map((s) => {
              const assigned = s.assignedMissions || ['stem', 'table'];
              const status = s.missionStatus || {};
              const mScore = (status[assigned[0]] ? 10 : 0) + (status[assigned[1]] ? 10 : 0);
              return (
                <div key={s.id} className="border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-indigo-700">{s.groupName}</span>
                      <span className="text-xs text-slate-500">
                        ({(s.memberList || []).map((m) => m.studentName).join(', ')})
                      </span>
                      <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">
                        미션 자동점수: {mScore} / 20점
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mt-1">{s.topic}</p>
                    <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-2 rounded">
                      <strong>모둠 자료해석:</strong> {s.interpretation || '미작성'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <div>
                      <span className="block text-slate-500 mb-1">자료해석 루브릭(20점)</span>
                      <select
                        value={s.rubricAnalysis ?? 20}
                        onChange={(e) => handleRubricAnalysisChange(s, e.target.value)}
                        className="border border-slate-300 rounded-lg px-3 py-1.5 font-bold bg-white"
                      >
                        <option value={20}>상 (20점)</option>
                        <option value={16}>중 (16점)</option>
                        <option value={12}>하 (12점)</option>
                        <option value={0}>미작성 (0점)</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. 개인별 세부 성적 일람표 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-base mb-3">2단계: [{teacherClass}] 개인별 세부 항목 합산 성적표 ({allStudentRows.length}명)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border border-slate-300">
            <thead className="bg-slate-100 font-bold border-b border-slate-300">
              <tr>
                <th className="py-2 px-1.5 border-r border-slate-300">학번</th>
                <th className="py-2 px-1.5 border-r border-slate-300">이름</th>
                <th className="py-2 px-1.5 border-r border-slate-300">모둠</th>
                <th className="py-2 px-1.5 border-r border-slate-300">상태</th>
                <th className="py-2 px-1.5 border-r border-slate-300">미션(20)</th>
                <th className="py-2 px-1.5 border-r border-slate-300">해석(20)</th>
                <th className="py-2 px-1.5 border-r border-slate-300">퀴즈(30)</th>
                <th className="py-2 px-1.5 border-r border-slate-300">설문(15)</th>
                <th className="py-2 px-1.5 border-r border-slate-300">동료(15)</th>
                <th className="py-2 px-1.5 border-r border-slate-300 bg-indigo-50 text-indigo-800">총점(100)</th>
                <th className="py-2 px-1.5 bg-emerald-50 text-emerald-800">30점환산</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {allStudentRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-slate-400">
                    등록된 학생 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                allStudentRows.map((row) => (
                  <tr key={row.studentId} className="hover:bg-slate-50">
                    <td className="py-2 border-r border-slate-300">{row.studentId}</td>
                    <td className="py-2 border-r border-slate-300 font-bold">{row.studentName}</td>
                    <td className="py-2 border-r border-slate-300">{row.groupName}</td>
                    <td className="py-2 border-r border-slate-300">
                      <span className={row.submitted === '제출' ? 'text-emerald-600 font-bold' : 'text-rose-500'}>
                        {row.submitted}
                      </span>
                    </td>
                    <td className="py-2 border-r border-slate-300">{row.missionTotal}</td>
                    <td className="py-2 border-r border-slate-300">{row.analysisScore}</td>
                    <td className="py-2 border-r border-slate-300">{row.quizScore}</td>
                    <td className="py-2 border-r border-slate-300">{row.surveyParticipationScore}</td>
                    <td className="py-2 border-r border-slate-300">{row.peerAvgScore}</td>
                    <td className="py-2 border-r border-slate-300 font-extrabold text-indigo-700 bg-indigo-50/40">
                      {row.total100}
                    </td>
                    <td className="py-2 font-extrabold text-emerald-700 bg-emerald-50/40">
                      {row.converted30}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   공통 UI 및 차트 컴포넌트
   ========================================================= */
function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-slate-600 hover:bg-white/70'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="font-bold text-slate-800 text-sm">{value}</p>
    </div>
  );
}

function StaticHistogramChart({ rows, unit, showHist, showPoly, maxOverride, customPolyValues }) {
  if (!rows || rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 text-sm">표시할 데이터가 없습니다.</div>;
  }

  const maxCount = Math.max(...rows.map((r) => r.count), maxOverride || 1, 1);
  const yMax = Math.ceil((maxCount + 1) / 2) * 2;

  const width = 460;
  const height = 250;
  const padL = 42;
  const padR = 24;
  const padT = 24;
  const padB = 42;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const totalSlots = rows.length + 2;
  const slotW = plotW / totalSlots;

  const getY = (val) => padT + plotH - (val / yMax) * plotH;

  const polyValues = customPolyValues || [0, ...rows.map((r) => r.count), 0];
  const polyPoints = polyValues.map((val, i) => ({
    x: padL + slotW * (i + 0.5),
    y: getY(val),
  }));

  const polyPath = polyPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto border border-slate-200 rounded-xl bg-white">
      {Array.from({ length: yMax + 1 }).map((_, val) => {
        if (yMax > 10 && val % 2 !== 0) return null;
        const y = getY(val);
        return (
          <g key={val}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
              {val}
            </text>
          </g>
        );
      })}

      {showHist &&
        rows.map((r, i) => {
          const x = padL + slotW * (i + 1);
          const y = getY(r.count);
          const barH = padT + plotH - y;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={slotW}
              height={barH}
              fill="rgba(99, 102, 241, 0.28)"
              stroke="#4f46e5"
              strokeWidth="1.5"
            />
          );
        })}

      {showPoly && (
        <>
          <polyline fill="none" stroke="#e11d48" strokeWidth="2.5" points={polyPath} />
          {polyPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#e11d48" />
          ))}
        </>
      )}

      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#334155" strokeWidth="1.5" />
      <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="#334155" strokeWidth="1.5" />

      {rows.map((r, i) => {
        const x = padL + slotW * (i + 1);
        return (
          <text key={i} x={x} y={padT + plotH + 16} textAnchor="middle" fontSize="10" fill="#334155">
            {r.min}
          </text>
        );
      })}
      <text
        x={padL + slotW * (rows.length + 1)}
        y={padT + plotH + 16}
        textAnchor="middle"
        fontSize="10"
        fill="#334155"
      >
        {rows[rows.length - 1].max}
      </text>

      <text x={padL - 8} y={14} textAnchor="end" fontSize="10" fontWeight="bold" fill="#334155">
        (명)
      </text>
      <text x={width - 8} y={padT + plotH + 30} textAnchor="end" fontSize="10" fontWeight="bold" fill="#334155">
        ({unit})
      </text>
    </svg>
  );
}
