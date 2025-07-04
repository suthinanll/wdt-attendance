<!-- eslint-disable no-prototype-builtins -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import { auth, db } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore'

const router = useRouter()
const userEmail = ref('')
const students = ref([])
const isLoading = ref(false)
const searchQuery = ref('')
const selectedScoreType = ref('lab') // 'lab', 'assignment', 'special'
const selectedNumber = ref(1)
const selectedMajorFilter = ref('สาขาทั้งหมด')
const selectedSectionFilter = ref('กลุ่มเรียนทั้งหมด')

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email
      loadStudents()
    } else {
      router.push('/')
    }
  })
})

async function loadStudents() {
  try {
    isLoading.value = true
    const querySnapshot = await getDocs(collection(db, 'students'))
    const studentList = []
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data()
      const scores = data.scores || {}

      // **CHANGED**: Normalize scores to the new object format { score, note }
      const normalizedScores = {
        lab: {},
        assignment: {},
        special: null, // Default special to null
      };

      // Normalize lab scores
      if (scores.lab) {
        for (const key in scores.lab) {
          const value = scores.lab[key];
          if (typeof value === 'object' && value !== null && value.hasOwnProperty('score')) {
            normalizedScores.lab[key] = { score: value.score ?? null, note: value.note ?? '' };
          } else if (typeof value === 'number') {
            normalizedScores.lab[key] = { score: value, note: '' };
          }
        }
      }

      // Normalize assignment scores
      if (scores.assignment) {
        for (const key in scores.assignment) {
          const value = scores.assignment[key];
          if (typeof value === 'object' && value !== null && value.hasOwnProperty('score')) {
            normalizedScores.assignment[key] = { score: value.score ?? null, note: value.note ?? '' };
          } else if (typeof value === 'number') {
            normalizedScores.assignment[key] = { score: value, note: '' };
          }
        }
      }
      
      // Normalize special score
      if (scores.special) {
        const value = scores.special;
        if (typeof value === 'object' && value !== null && value.hasOwnProperty('score')) {
            normalizedScores.special = { score: value.score ?? null, note: value.note ?? '' };
          } else if (typeof value === 'number') {
            normalizedScores.special = { score: value, note: '' };
          }
      }


      studentList.push({
        id: docSnapshot.id,
        studentId: data.studentId || docSnapshot.id,
        name: data.name || '',
        major: data.major || '',
        section: data.section || '',
        scores: normalizedScores // Use the normalized scores
      })
    })
    
    studentList.sort((a, b) => a.studentId.localeCompare(b.studentId))
    students.value = studentList;
    
  } catch (error) {
    console.error('Error loading students:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักศึกษาได้', 'error')
  } finally {
    isLoading.value = false
  }
}

// ... (ส่วนของ computed properties: availableMajors, availableSections, filteredStudents ไม่ต้องแก้ไข) ...
const availableMajors = computed(() => {
  if (!students.value.length) return ['สาขาทั้งหมด'];
  const majors = new Set(students.value.map(s => s.major).filter(Boolean));
  return ['สาขาทั้งหมด', ...Array.from(majors).sort()];
});

const availableSections = computed(() => {
  if (!students.value.length) return ['กลุ่มเรียนทั้งหมด'];
  const sections = new Set(students.value.map(s => s.section).filter(Boolean));
  return ['กลุ่มเรียนทั้งหมด', ...Array.from(sections).sort((a, b) => { // Sort sections numerically if possible
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b));
  })];
});

const filteredStudents = computed(() => {
  let result = students.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(student =>
      student.studentId.toLowerCase().includes(query) ||
      student.name.toLowerCase().includes(query) ||
      (student.major && student.major.toLowerCase().includes(query)) ||
      (student.section && student.section.toLowerCase().includes(query))
    );
  }

  if (selectedMajorFilter.value && selectedMajorFilter.value !== 'สาขาทั้งหมด') {
    result = result.filter(student => student.major === selectedMajorFilter.value);
  }

  if (selectedSectionFilter.value && selectedSectionFilter.value !== 'กลุ่มเรียนทั้งหมด') {
    result = result.filter(student => student.section === selectedSectionFilter.value);
  }

  return result;
});


// **CHANGED**: Get the nested score value
function getScoreForInput(student) {
  if (!student || !student.scores) return '';
  let scoreData;
  if (selectedScoreType.value === 'special') {
    scoreData = student.scores.special;
  } else {
    scoreData = student.scores[selectedScoreType.value]?.[selectedNumber.value];
  }
  
  if (scoreData && scoreData.score !== null && scoreData.score !== undefined) {
    return String(scoreData.score);
  }
  return '';
}

// **ADDED**: Get the nested note value
function getNoteForInput(student) {
  if (!student || !student.scores) return '';
  let scoreData;
  if (selectedScoreType.value === 'special') {
    scoreData = student.scores.special;
  } else {
    scoreData = student.scores[selectedScoreType.value]?.[selectedNumber.value];
  }

  return scoreData?.note ?? '';
}

// A helper function to manage score updates
async function updateStudentScoreData(studentId, updateFn) {
  const studentIndex = students.value.findIndex(s => s.id === studentId);
  if (studentIndex === -1) return;

  const oldScores = JSON.parse(JSON.stringify(students.value[studentIndex].scores));
  
  // Create a deep copy to modify
  const updatedScores = JSON.parse(JSON.stringify(students.value[studentIndex].scores));

  // The updateFn will contain the logic to change the score/note
  updateFn(updatedScores);

  // Optimistic UI update
  students.value[studentIndex].scores = updatedScores;

  try {
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, { scores: updatedScores });
  } catch (error) {
    console.error(`Error saving data for ${studentId}:`, error);
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    // Revert on failure
    students.value[studentIndex].scores = oldScores;
  }
}

async function handleScoreChange(student, newValueStr) {
  const trimmedValueStr = newValueStr.trim();
  let newScoreValue;

  if (trimmedValueStr === '') {
    newScoreValue = null; // Represents clearing the score
  } else {
    newScoreValue = parseFloat(trimmedValueStr);
    if (isNaN(newScoreValue)) {
      Swal.fire('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกคะแนนเป็นตัวเลข หรือเว้นว่างเพื่อลบ', 'warning');
      // Re-render to revert input
      const studentToRefresh = students.value.find(s => s.id === student.id);
      if (studentToRefresh) studentToRefresh.scores = { ...studentToRefresh.scores };
      return;
    }
  }

  await updateStudentScoreData(student.id, (scores) => {
    if (selectedScoreType.value === 'special') {
      if (!scores.special) scores.special = { score: null, note: '' };
      scores.special.score = newScoreValue;
    } else {
      const type = selectedScoreType.value;
      const num = selectedNumber.value;
      if (!scores[type]) scores[type] = {};
      if (!scores[type][num]) scores[type][num] = { score: null, note: '' };
      scores[type][num].score = newScoreValue;
    }
  });
}

async function handleNoteChange(student, newNote) {
  if (selectedScoreType.value === 'special') {
    return; 
  }
  
  await updateStudentScoreData(student.id, (scores) => {
    const type = selectedScoreType.value;
    const num = selectedNumber.value;
    if (!scores[type]) scores[type] = {};
    if (!scores[type][num]) scores[type][num] = { score: null, note: '' };
    scores[type][num].note = newNote;
  });
}


// **CHANGED**: Increment special score for the new data structure
async function incrementSpecialScore(student) {
  await updateStudentScoreData(student.id, (scores) => {
    if (!scores.special) {
      scores.special = { score: 0, note: '' };
    }
    let currentScore = parseFloat(scores.special.score);
    if (isNaN(currentScore)) {
        currentScore = 0;
    }
    scores.special.score = currentScore + 1;
  });
}

// **CHANGED**: Get status from the nested score value
function getScoreStatus(student) {
  if (!student || !student.scores) return 'pending';
  let scoreData;
  if (selectedScoreType.value === 'special') {
    scoreData = student.scores.special;
  } else {
    scoreData = student.scores[selectedScoreType.value]?.[selectedNumber.value];
  }
  
  // A score is considered completed if the 'score' property is a number.
  return (scoreData && typeof scoreData.score === 'number') ? 'completed' : 'pending';
}

function clearSearch() {
  searchQuery.value = ''
}
function clearFilters() {
  searchQuery.value = ''
  selectedMajorFilter.value = 'สาขาทั้งหมด'
  selectedSectionFilter.value = 'กลุ่มเรียนทั้งหมด'
}

async function logout() {
  const result = await Swal.fire({
    title: 'ต้องการออกจากระบบจริงหรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e53e3e',
    cancelButtonColor: '#909090',
  })
  if (result.isConfirmed) {
    await auth.signOut()
    router.push('/')
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 text-gray-800">
      <header class="bg-white shadow-lg">
      <!-- ส่วน Header บน: Logo และ User Info/Logout -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          class="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 sm:py-6 border-b border-gray-200 space-y-4 sm:space-y-0">
          <div class="flex items-center w-full sm:w-auto">
            <router-link to="/admin" class="flex-shrink-0 block w-full sm:w-auto text-center sm:text-left">
              <h1 class="text-lg sm:text-xl lg:text-2xl font-bold text-green-600">ระบบเช็คชื่อและให้คะแนน</h1>
              <h1 class="text-xs sm:text-sm text-gray-500">CP352201 & SC362201 Web Design Technologies</h1>
            </router-link>
          </div>
          <div class="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 w-full sm:w-auto">
            <div class="text-gray-700 text-center sm:text-right">
              <span class="text-sm">สวัสดี, </span>
              <span class="font-semibold break-all">{{ userEmail }}</span>
            </div>
            <button @click="logout"
              class="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300 font-medium text-sm">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

           <!-- ส่วน Navbar ล่าง: เมนูต่างๆ -->
      <nav class="bg-white overflow-x-auto">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-start space-x-2 sm:space-x-4 py-3 min-w-max sm:min-w-0">
            <router-link to="/attendance" class="menu-item whitespace-nowrap"
              active-class="active-menu-item bg-gray-100">
              เช็คชื่อ
            </router-link>
            <router-link to="/students" class="menu-item whitespace-nowrap" active-class="active-menu-item">
              รายชื่อนักศึกษา
            </router-link>
            <router-link to="/addpoint" class="menu-item whitespace-nowrap" active-class="active-menu-item">
              บันทึกคะแนน
            </router-link>
            <router-link to="/scoreboard" class="menu-item whitespace-nowrap" active-class="active-menu-item">
              ตารางคะแนนรวม
            </router-link>
          </div>
        </div>
      </nav>
    </header>


    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div>
        <!-- ... ส่วน Selector และ Filters ไม่มีการเปลี่ยนแปลง ... -->
         <div class="mb-6 bg-white rounded-lg shadow p-4">
          <h3 class="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">เลือกประเภทคะแนน</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <button @click="selectedScoreType = 'lab'; selectedNumber = 1;" :class="[
              'p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 transform hover:scale-105',
              selectedScoreType === 'lab'
                ? 'border-blue-500 bg-blue-100 text-blue-700 shadow-md ring-2 ring-blue-500 ring-offset-1'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 text-gray-700'
            ]">
              <div class="text-center">
                <div class="text-sm sm:text-lg font-semibold">Lab</div>
                <div class="text-xs sm:text-sm text-gray-500">1-15</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'assignment'; selectedNumber = 1;" :class="[
              'p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 transform hover:scale-105',
              selectedScoreType === 'assignment'
                ? 'border-green-500 bg-green-100 text-green-700 shadow-md ring-2 ring-green-500 ring-offset-1'
                : 'border-gray-300 bg-white hover:border-green-400 hover:bg-green-50 text-gray-700'
            ]">
              <div class="text-center">
                <div class="text-sm sm:text-lg font-semibold">Assignment</div>
                <div class="text-xs sm:text-sm text-gray-500">1-13</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'special'" :class="[
              'p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 transform hover:scale-105',
              selectedScoreType === 'special'
                ? 'border-purple-500 bg-purple-100 text-purple-700 shadow-md ring-2 ring-purple-500 ring-offset-1'
                : 'border-gray-300 bg-white hover:border-purple-400 hover:bg-purple-50 text-gray-700'
            ]">
              <div class="text-center">
                <div class="text-sm sm:text-lg font-semibold">คะแนนพิเศษ</div>
                <div class="text-xs sm:text-sm text-gray-500">Extra Points</div>
              </div>
            </button>
          </div>
        </div>
         <div v-if="selectedScoreType !== 'special'" class="mb-6 bg-white rounded-lg shadow p-4">
          <h3 class="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">
            เลือก {{ selectedScoreType === 'lab' ? 'Lab' : 'Assignment' }} ที่
          </h3>
          <div class="grid grid-cols-4 xs:grid-cols-6 sm:grid-cols-7 md:grid-cols-10 lg:grid-cols-14 gap-1.5 sm:gap-2">
            <button v-for="n in (selectedScoreType === 'lab' ? 15 : 13)" :key="`${selectedScoreType}-${n}`"
              @click="selectedNumber = n" :class="[
                'p-1.5 sm:p-2 rounded-md text-xs sm:text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2',
                selectedNumber === n
                  ? selectedScoreType === 'lab'
                    ? 'bg-blue-600 text-white ring-blue-400'
                    : 'bg-green-600 text-white ring-green-400'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 ring-transparent'
              ]">
              {{ n }}
            </button>
          </div>
        </div>
         <div class="mb-6 bg-white rounded-lg shadow p-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <!-- Search -->
            <div class="md:col-span-1">
              <label for="search" class="block text-sm font-medium text-gray-700">ค้นหา</label>
              <div class="mt-1 relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input v-model="searchQuery" id="search" type="text"
                  class="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm"
                  placeholder="รหัส, ชื่อ, สาขา, กลุ่ม...">
                <button v-if="searchQuery" @click="clearSearch"
                  class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label="ล้างการค้นหา">
                  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            <!-- Major -->
            <div>
              <label for="majorFilter" class="block text-sm font-medium text-gray-700">สาขา</label>
              <select id="majorFilter" v-model="selectedMajorFilter"
                class="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md bg-white transition">
                <option v-for="major in availableMajors" :key="major" :value="major">{{ major }}</option>
              </select>
            </div>
            <!-- Section -->
            <div>
              <label for="sectionFilter" class="block text-sm font-medium text-gray-700">กลุ่มเรียน</label>
              <select id="sectionFilter" v-model="selectedSectionFilter"
                class="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md bg-white transition">
                <option v-for="section in availableSections" :key="section" :value="section">{{ section }}</option>
              </select>
            </div>
            <!-- Inline Clear Button -->
            <div class="md:col-span-3 flex justify-end items-center mt-2"
              v-if="searchQuery || selectedMajorFilter !== 'สาขาทั้งหมด' || selectedSectionFilter !== 'กลุ่มเรียนทั้งหมด'">
              <button @click="clearFilters"
                class="px-3 py-1.5 border border-gray-400 bg-white text-gray-700 rounded hover:bg-gray-100 hover:border-gray-500 text-sm flex items-center transition ml-auto">
                <svg class="w-4 h-4 mr-1 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
                ล้างตัวกรอง
              </button>
            </div>
          </div>
        </div>

        <!-- Students Score Table -->
        <div class="bg-white rounded-lg shadow-xl overflow-hidden">
          <div class="px-4 sm:px-6 py-4 border-b border-gray-200">
            <h3 class="text-base sm:text-lg font-medium text-gray-900">
              บันทึกคะแนน{{ selectedScoreType === 'lab' ? ' Lab' : selectedScoreType === 'assignment' ? ' Assignment' :
              'พิเศษ' }}
              {{ selectedScoreType !== 'special' ? ` ที่ ${selectedNumber}` : '' }}
              <span class="text-xs sm:text-sm text-gray-500 ml-2">({{ filteredStudents.length }} คน)</span>
            </h3>
          </div>

          <div v-if="isLoading && !students.length" class="p-6 sm:p-8 text-center">
            <!-- ... -->
          </div>
          <div v-else-if="!filteredStudents.length" class="p-6 sm:p-8 text-center text-gray-600">
            <!-- ... -->
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    ลำดับ</th>
                  <th class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รหัสนักศึกษา</th>
                  <th class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ชื่อ-นามสกุล</th>
                  <th
                    class="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    สาขา</th>
                  <th
                    class="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    กลุ่ม</th>
                  
                  <!-- **CHANGED**: Hide status header for special scores -->
                  <th v-if="selectedScoreType !== 'special'"
                    class="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ</th>
                  
                  <!-- **CHANGED**: Dynamic header text and width -->
                  <th class="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    :class="selectedScoreType === 'special' ? 'w-40 sm:w-48' : 'w-48 sm:w-80'">
                    {{ selectedScoreType === 'special' ? 'คะแนนพิเศษ' : 'คะแนน / หมายเหตุ' }}
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="(student, index) in filteredStudents" :key="student.id"
                  class="hover:bg-gray-50 transition-colors duration-150">
                  <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{{ index + 1 }}</td>
                  <td class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ student.studentId
                    }}</td>
                  <td class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ student.name }}</td>
                  <td class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">{{
                    student.major || '-' }}</td>
                  <td
                    class="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center hidden sm:table-cell">
                    {{ student.section || '-' }}</td>

                  <!-- **CHANGED**: Hide status column data for special scores -->
                  <td v-if="selectedScoreType !== 'special'" class="px-3 sm:px-6 py-4 whitespace-nowrap text-center">
                    <span v-if="getScoreStatus(student) === 'completed'"
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700"
                      title="บันทึกคะแนนแล้ว">
                      ให้คะแนนแล้ว
                    </span>
                    <span v-else
                      class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700"
                      title="รอการให้คะแนน">
                      ยังไม่ให้
                    </span>
                  </td>

                  <!-- **CHANGED**: Use v-if/v-else for completely different layouts -->
                  <td class="px-1 sm:px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    
                    <!-- Layout for Lab and Assignment (Score + Note) -->
                    <div v-if="selectedScoreType !== 'special'" class="flex flex-col sm:flex-row items-stretch justify-center gap-1.5">
                      <input type="number" :value="getScoreForInput(student)"
                        @change="handleScoreChange(student, $event.target.value)"
                        @blur="handleScoreChange(student, $event.target.value)"
                        step="0.1" min="0" :max="selectedScoreType === 'lab' ? 10 : 20"
                        class="w-full sm:w-20 p-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="คะแนน"
                        :aria-label="`คะแนน ${selectedScoreType} ${selectedNumber} ของ ${student.name}`" />

                      <input type="text" :value="getNoteForInput(student)"
                        @blur="handleNoteChange(student, $event.target.value)"
                        class="w-full sm:flex-grow p-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="หมายเหตุ (ถ้ามี)"
                        :aria-label="`หมายเหตุคะแนน ${selectedScoreType} ${selectedNumber} ของ ${student.name}`" />
                    </div>

                    <!-- Layout for Special Score (Score + Increment Button) -->
                    <div v-else class="flex items-center justify-center gap-1.5">
                       <input type="number" :value="getScoreForInput(student)"
                        @change="handleScoreChange(student, $event.target.value)"
                        @blur="handleScoreChange(student, $event.target.value)" 
                        step="0.1" min="0" max="100"
                        class="w-20 p-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="คะแนน"
                        :aria-label="`คะแนนพิเศษของ ${student.name}`" />
                        
                      <button @click="incrementSpecialScore(student)"
                        class="p-1.5 bg-purple-500 text-white rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-colors flex items-center justify-center"
                        title="เพิ่มคะแนนพิเศษ 1 คะแนน" aria-label="เพิ่มคะแนนพิเศษ 1 คะแนน">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24"
                          stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </button>
                    </div>

                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <br>
      <footer class="text-center py-6 text-xs text-gray-500">
        &copy; 2025 CP352201 & SC362201 Web Design Technologies. <br>
        Developed by suthinanll
      </footer>
    </main>
  </div>
</template>

<style scoped lang="postcss">
/* ... Style ไม่มีการเปลี่ยนแปลง ... */
.menu-item {
  @apply px-3 py-2 rounded-md text-sm font-medium text-gray-700 relative;
  @apply hover:text-green-700 transition-colors duration-200;
  /* เพิ่ม position: relative เพื่อให้ pseudo-element จัดตำแหน่งได้ */
}

.menu-item::after {
  @apply content-[''] absolute bottom-0 left-0 w-0 h-0.5 bg-green-600 transition-all duration-300 ease-out;
}

.menu-item:hover::after {
  @apply w-full;
}

.active-menu-item {
  @apply text-green-700 font-semibold;
}

.active-menu-item::after {
  @apply w-full;
}
</style>
