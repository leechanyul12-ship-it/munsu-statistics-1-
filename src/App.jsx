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
  Send
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

export default function App() {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // 새 설문 생성 폼 상태
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState('');
  const [topic, setTopic] = useState('');
  const [unit, setUnit] = useState('');

  // 실시간 Firestore 구독
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

  const currentSurvey = useMemo(
    () => surveys.find((s) => s.id === selectedId) || null,
    [surveys, selectedId]
  );

  // 새 모둠 설문 방 생성
  const handleCreateSurvey = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || !topic.trim() || !unit.trim()) return;

    const docRef = await addDoc(collection(db, 'surveys'), {
      groupName: groupName.trim(),
      members: members.trim(),
      topic: topic.trim(),
      unit: unit.trim(),
      values: [],
      classStart: 0,
      classWidth: 10,
      interpretation: '',
      createdAt: serverTimestamp(),
    });

    setGroupName('');
    setMembers('');
    setTopic('');
    setUnit('');
    setIsCreating(false);
    setSelectedId(docRef.id);
  };

  // 모둠 방 삭제
  const handleDeleteSurvey = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('이 모둠의 설문과 자료를 모두 삭제할까요?')) return;
    await deleteDoc(doc(db, 'surveys', id));
    if (selectedId === id) setSelectedId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600 font-medium">
        실시간 설문 데이터를 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* 상단 헤더 */}
      <header className="bg-indigo-600 text-white shadow-sm no-print">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => {
              setSelectedId(null);
              setIsCreating(false);
            }}
          >
            <BarChart3 className="w-7 h-7 text-indigo-200" />
            <div>
              <h1 className="text-lg font-bold tracking-tight">중1 수학 통계 수행평가</h1>
              <p className="text-xs text-indigo-200">모둠별 설문조사 · 자료 정리 · 통계 그래프 및 해석</p>
            </div>
          </div>

          {!selectedId && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 bg-white text-indigo-600 hover:bg-indigo-50 font-semibold px-4 py-2 rounded-lg text-sm shadow transition"
            >
              <Plus className="w-4 h-4" />
              새 모둠 설문 만들기
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* 1. 새 모둠 설문 생성 화면 */}
        {isCreating && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <button
              onClick={() => setIsCreating(false)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> 목록으로 돌아가기
            </button>
            <h2 className="text-xl font-bold mb-1">새 모둠 설문 방 개설</h2>
            <p className="text-sm text-slate-500 mb-5">우리 모둠의 조사 주제와 단위를 정확히 입력해 주세요.</p>

            <form onSubmit={handleCreateSurvey} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">모둠 이름 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: 1모둠 (통계마스터)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">모둠원 이름</label>
                <input
                  type="text"
                  placeholder="예: 김민준, 이서연, 박지훈, 최수아"
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

        {/* 2. 모둠 목록 화면 */}
        {!isCreating && !currentSurvey && (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">우리 반 모둠별 설문 목록</h2>
                <p className="text-sm text-slate-500">모둠을 선택해 투표에 참여하거나 통계 자료를 분석하세요.</p>
              </div>
              <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
                실시간 동기화 중 · 총 {surveys.length}개 모둠
              </span>
            </div>

            {surveys.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">아직 개설된 모둠 설문이 없습니다.</p>
                <p className="text-sm text-slate-500 mb-5">오른쪽 위 [새 모둠 설문 만들기] 버튼을 눌러 첫 설문을 만들어 보세요!</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition"
                >
                  <Plus className="w-4 h-4" /> 새 모둠 설문 만들기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {surveys.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-md transition cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md">
                          {s.groupName}
                        </span>
                        <button
                          onClick={(e) => handleDeleteSurvey(s.id, e)}
                          className="text-slate-400 hover:text-rose-500 p-1"
                          title="설문 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 mb-1">{s.topic}</h3>
                      {s.members && (
                        <p className="text-xs text-slate-500 mb-3">모둠원: {s.members}</p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        현재 응답 수: <strong className="text-indigo-600">{(s.values || []).length}명</strong>
                      </span>
                      <span className="text-indigo-600 font-semibold">입장하기 →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. 선택된 모둠 상세 워크스페이스 */}
        {!isCreating && currentSurvey && (
          <SurveyWorkspace
            survey={currentSurvey}
            onBack={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}

function SurveyWorkspace({ survey, onBack }) {
  const [activeTab, setActiveTab] = useState('vote'); // vote | stem | freq | report
  const [singleVal, setSingleVal] = useState('');
  const [bulkVal, setBulkVal] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  // 도수분포표 계급 설정 로컬 상태 (입력 중 부드러운 조작을 위해 동기화)
  const [classStart, setClassStart] = useState(survey.classStart ?? 0);
  const [classWidth, setClassWidth] = useState(survey.classWidth ?? 10);
  const [interpretation, setInterpretation] = useState(survey.interpretation ?? '');
  const [savedNotice, setSavedNotice] = useState(false);

  // 그래프 토글
  const [showHist, setShowHist] = useState(true);
  const [showPoly, setShowPoly] = useState(true);

  useEffect(() => {
    setClassStart(survey.classStart ?? 0);
    setClassWidth(survey.classWidth ?? 10);
    setInterpretation(survey.interpretation ?? '');
  }, [survey.id, survey.classStart, survey.classWidth, survey.interpretation]);

  const values = survey.values || [];

  // 1개 투표 입력
  const handleAddSingle = async (e) => {
    e.preventDefault();
    const num = Number(singleVal);
    if (singleVal.trim() === '' || isNaN(num)) return;
    await updateDoc(doc(db, 'surveys', survey.id), {
      values: [...values, num],
    });
    setSingleVal('');
  };

  // 여러 개 일괄 입력
  const handleAddBulk = async () => {
    const parsed = bulkVal
      .split(/[\s,]+/)
      .map((v) => v.trim())
      .filter((v) => v !== '')
      .map(Number)
      .filter((n) => !isNaN(n));

    if (parsed.length === 0) return;
    await updateDoc(doc(db, 'surveys', survey.id), {
      values: [...values, ...parsed],
    });
    setBulkVal('');
  };

  // 특정 인덱스 변량 삭제
  const handleRemoveValue = async (idxToRemove) => {
    const next = values.filter((_, i) => i !== idxToRemove);
    await updateDoc(doc(db, 'surveys', survey.id), {
      values: next,
    });
  };

  // 계급 설정 & 자료 해석 Firestore 저장
  const handleSaveAnalysis = async () => {
    await updateDoc(doc(db, 'surveys', survey.id), {
      classStart: Number(classStart),
      classWidth: Math.max(1, Number(classWidth)),
      interpretation,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  // 기초 통계량 계산
  const stats = useMemo(() => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = (sum / n).toFixed(1);
    const median =
      n % 2 === 1
        ? sorted[Math.floor(n / 2)]
        : ((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(1);

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

  // 줄기와 잎 그림 데이터 (정수 기준 십의 자리 이상 / 일의 자리)
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

  // 도수분포표 데이터
  const freqTable = useMemo(() => {
    if (values.length === 0) return [];
    const start = Number(classStart) || 0;
    const width = Math.max(1, Number(classWidth) || 10);
    const maxVal = Math.max(...values);

    const rows = [];
    let cur = start;
    // 최대값이 마지막 계급에 포함되도록 (< cur + width)
    while (cur <= maxVal || rows.length === 0) {
      const end = cur + width;
      const count = values.filter((v) => v >= cur && v < end).length;
      rows.push({
        min: cur,
        max: end,
        mid: (cur + end) / 2,
        count,
        relFreq: values.length > 0 ? count / values.length : 0,
      });
      cur = end;
      if (rows.length > 30) break; // 무한 루프 방지
    }
    return rows;
  }, [values, classStart, classWidth]);

  const displayedValues = useMemo(() => {
    const indexed = values.map((v, idx) => ({ v, idx }));
    if (sortAsc) {
      return indexed.sort((a, b) => a.v - b.v);
    }
    return indexed;
  }, [values, sortAsc]);

  return (
    <div>
      {/* 상단 내비게이션 & 제목 */}
      <div className="mb-5 no-print">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> 전체 모둠 목록으로
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded">
                {survey.groupName}
              </span>
              {survey.members && (
                <span className="text-xs text-slate-500">모둠원: {survey.members}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{survey.topic}</h2>
            <p className="text-xs text-slate-500 mt-0.5">단위: {survey.unit} · 현재 수집된 자료: {values.length}개</p>
          </div>

          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-xl">
            <TabBtn active={activeTab === 'vote'} onClick={() => setActiveTab('vote')} icon={<Send className="w-4 h-4" />} label="1. 설문 투표" />
            <TabBtn active={activeTab === 'stem'} onClick={() => setActiveTab('stem')} icon={<ListOrdered className="w-4 h-4" />} label="2. 줄기와 잎" />
            <TabBtn active={activeTab === 'freq'} onClick={() => setActiveTab('freq')} icon={<Table2 className="w-4 h-4" />} label="3. 도수분포표·그래프" />
            <TabBtn active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<FileText className="w-4 h-4" />} label="4. 해석 및 보고서" />
          </div>
        </div>
      </div>

      {/* 탭 1: 설문 투표 및 자료 수집 */}
      {activeTab === 'vote' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-base mb-1">내 응답(변량) 입력하기</h3>
              <p className="text-xs text-slate-500 mb-4">숫자만 입력하고 등록을 누르면 실시간으로 반영됩니다.</p>
              <form onSubmit={handleAddSingle} className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  required
                  placeholder={`숫자 (${survey.unit})`}
                  value={singleVal}
                  onChange={(e) => setSingleVal(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg shrink-0"
                >
                  등록
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-base mb-1">여러 자료 한 번에 입력</h3>
              <p className="text-xs text-slate-500 mb-3">쉼표(,)나 띄어쓰기로 구분해 여러 숫자를 일괄 추가할 수 있습니다.</p>
              <textarea
                rows={3}
                placeholder="예: 25, 30, 45, 50, 35"
                value={bulkVal}
                onChange={(e) => setBulkVal(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleAddBulk}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold py-2 rounded-lg"
              >
                일괄 등록하기
              </button>
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">수집된 원시 자료 (변량 목록)</h3>
                <p className="text-xs text-slate-500">숫자를 클릭하면 잘못 입력된 자료를 삭제할 수 있습니다.</p>
              </div>
              <button
                onClick={() => setSortAsc(!sortAsc)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  sortAsc
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {sortAsc ? '✓ 작은 값부터 정렬됨' : '크기순으로 정렬하기'}
              </button>
            </div>

            {values.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">
                아직 입력된 자료가 없습니다. 왼쪽에서 숫자를 입력해 주세요!
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-6">
                  {displayedValues.map(({ v, idx }) => (
                    <button
                      key={`${idx}-${v}`}
                      onClick={() => handleRemoveValue(idx)}
                      title="클릭하여 삭제"
                      className="group relative bg-slate-100 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-300 font-semibold px-3.5 py-2 rounded-xl text-sm transition"
                    >
                      {v}
                      <span className="text-xs font-normal text-slate-400 group-hover:text-rose-400 ml-0.5">
                        {survey.unit}
                      </span>
                    </button>
                  ))}
                </div>

                {stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                    <StatBox label="자료 개수" value={`${stats.n}개`} />
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
              <p className="text-xs text-slate-500">십의 자리(또는 그 이상)를 줄기로, 일의 자리를 잎으로 분류했습니다.</p>
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

      {/* 탭 3: 도수분포표 및 히스토그램/도수분포다각형 */}
      {activeTab === 'freq' && (
        <div className="space-y-6">
          {/* 계급 설정 컨트롤 */}
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
                <label className="block text-xs font-bold text-slate-600 mb-1">계급의 크기 (간격)</label>
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
            {/* 도수분포표 */}
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
                          <td className="py-2 px-2 border-r border-slate-300">
                            {r.min} 이상 ~ {r.max} 미만
                          </td>
                          <td className="py-2 px-2 border-r border-slate-300 text-slate-600">{r.mid}</td>
                          <td className="py-2 px-2 border-r border-slate-300 font-bold text-indigo-600">
                            {r.count}
                          </td>
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

            {/* 히스토그램 & 도수분포다각형 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-base">히스토그램 & 도수분포다각형</h3>
                <div className="flex gap-2 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showHist}
                      onChange={(e) => setShowHist(e.target.checked)}
                    />
                    히스토그램
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPoly}
                      onChange={(e) => setShowPoly(e.target.checked)}
                    />
                    도수분포다각형
                  </label>
                </div>
              </div>

              <HistogramChart
                rows={freqTable}
                unit={survey.unit}
                showHist={showHist}
                showPoly={showPoly}
              />
            </div>
          </div>
        </div>
      )}

      {/* 탭 4: 자료 해석 작성 및 수행평가 보고서 출력 */}
      {activeTab === 'report' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 no-print">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-lg">모둠 자료 해석 작성하기</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              도수가 가장 큰 계급, 자료가 분포된 모양, 평균과 중앙값의 비교, 조사 결과로 알 수 있는 사실 등을 모둠원과 토의하여 적어주세요.
            </p>
            <textarea
              rows={5}
              placeholder="예: 우리 모둠이 조사한 결과 전체 20명 중 30분 이상 40분 미만 계급의 도수가 8명(상대도수 0.40)으로 가장 많았다. 자료가 비교적 가운데 계급에 모여 있으며..."
              value={interpretation}
              onChange={(e) => setInterpretation(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-3.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveAnalysis}
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
                <Printer className="w-4 h-4" /> 보고서 인쇄 / PDF 저장
              </button>
            </div>
          </div>

          {/* 인쇄용 최종 보고서 미리보기 */}
          <div className="bg-white rounded-2xl border-2 border-slate-300 p-8 shadow-sm">
            <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-end">
              <div>
                <p className="text-xs font-bold text-indigo-600 mb-1">중학교 1학년 수학 통계 수행평가 보고서</p>
                <h2 className="text-2xl font-extrabold text-slate-900">{survey.topic}</h2>
              </div>
              <div className="text-right text-sm">
                <p className="font-bold">{survey.groupName}</p>
                <p className="text-slate-600">{survey.members || '모둠원 미입력'}</p>
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
                <HistogramChart rows={freqTable} unit={survey.unit} showHist={true} showPoly={true} />
              </div>
            </div>

            <div>
              <h4 className="font-bold text-sm mb-2">3. 모둠 자료 해석 및 결론</h4>
              <div className="min-h-[120px] border border-slate-300 rounded-xl p-4 bg-slate-50 text-sm whitespace-pre-wrap leading-relaxed">
                {interpretation || '작성된 자료 해석 내용이 없습니다.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function HistogramChart({ rows, unit, showHist, showPoly }) {
  if (!rows || rows.length === 0) {
    return <div className="py-16 text-center text-slate-400 text-sm">표시할 데이터가 없습니다.</div>;
  }

  const maxCount = Math.max(...rows.map((r) => r.count), 1);
  const yMax = Math.ceil((maxCount + 1) / 2) * 2;

  const width = 460;
  const height = 260;
  const padL = 42;
  const padR = 24;
  const padT = 24;
  const padB = 42;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // 양 끝에 도수가 0인 가상의 계급 반 칸씩 여유를 두어 도수분포다각형이 가로축에 닿도록 구성
  const totalSlots = rows.length + 2;
  const slotW = plotW / totalSlots;

  const getY = (val) => padT + plotH - (val / yMax) * plotH;

  // 도수분포다각형 꼭짓점 좌표
  const polyPoints = [
    { x: padL + slotW * 0.5, y: getY(0) },
    ...rows.map((r, i) => ({
      x: padL + slotW * (i + 1.5),
      y: getY(r.count),
    })),
    { x: padL + slotW * (rows.length + 1.5), y: getY(0) },
  ];

  const polyPath = polyPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto border border-slate-200 rounded-xl bg-white">
      {/* 가로 눈금선 */}
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

      {/* 히스토그램 직사각형 */}
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

      {/* 도수분포다각형 선 및 점 */}
      {showPoly && (
        <>
          <polyline fill="none" stroke="#e11d48" strokeWidth="2.5" points={polyPath} />
          {polyPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#e11d48" />
          ))}
        </>
      )}

      {/* X축 및 Y축 */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#334155" strokeWidth="1.5" />
      <line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="#334155" strokeWidth="1.5" />

      {/* 계급 경계 눈금 숫자 */}
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

      {/* 축 단위 라벨 */}
      <text x={padL - 8} y={14} textAnchor="end" fontSize="10" fontWeight="bold" fill="#334155">
        (명)
      </text>
      <text x={width - 8} y={padT + plotH + 30} textAnchor="end" fontSize="10" fontWeight="bold" fill="#334155">
        ({unit})
      </text>
    </svg>
  );
}
