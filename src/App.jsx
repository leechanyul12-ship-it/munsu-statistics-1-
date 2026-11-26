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
