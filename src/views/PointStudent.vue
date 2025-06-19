<!-- eslint-disable no-unused-vars -->
<!-- src/views/Home.vue -->
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
const activeTab = ref('scores') // 'students' หรือ 'scores'
const selectedScoreType = ref('lab') // 'lab', 'assignment', 'special'
const selectedNumber = ref(1)

// New refs for filtering
const selectedMajorFilter = ref('') // For major filter dropdown
const selectedSectionFilter = ref('') // For section filter dropdown

// ดึงข้อมูล user ที่ล็อกอินอยู่
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

// โหลดข้อมูลนักศึกษา
async function loadStudents() {
  try {
    isLoading.value = true
    const querySnapshot = await getDocs(collection(db, 'students'))
    students.value = []
    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data()
      students.value.push({
        id: docSnapshot.id,
        studentId: data.studentId || docSnapshot.id,
        name: data.name || '',
        major: data.major || '',
        section: data.section || '', // Added section
        scores: data.scores || {
          lab: {},
          assignment: {},
          special: 0
        }
      })
    })
    students.value.sort((a, b) => a.studentId.localeCompare(b.studentId))
  } catch (error) {
    console.error('Error loading students:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักศึกษาได้', 'error')
  } finally {
    isLoading.value = false
  }
}

// Computed properties for filter dropdown options
const availableMajors = computed(() => {
  if (!students.value.length) return [];
  const majors = new Set(students.value.map(s => s.major).filter(Boolean)); // Filter out empty/null majors
  return ['สาขาทั้งหมด', ...Array.from(majors).sort()];
});

const availableSections = computed(() => {
  if (!students.value.length) return [];
  const sections = new Set(students.value.map(s => s.section).filter(Boolean)); // Filter out empty/null sections
  return ['กลุ่มเรียนทั้งหมด', ...Array.from(sections).sort()];
});

// ฟังก์ชันกรองข้อมูลตามการค้นหา, สาขา, และกลุ่มเรียน
const filteredStudents = computed(() => {
  let result = students.value;

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(student =>
      student.studentId.toLowerCase().includes(query) ||
      student.name.toLowerCase().includes(query) ||
      (student.major && student.major.toLowerCase().includes(query)) // Check if major exists
    );
  }

  // Filter by major
  if (selectedMajorFilter.value && selectedMajorFilter.value !== 'สาขาทั้งหมด') {
    result = result.filter(student => student.major === selectedMajorFilter.value);
  }

  // Filter by section
  if (selectedSectionFilter.value && selectedSectionFilter.value !== 'กลุ่มเรียนทั้งหมด') {
    result = result.filter(student => student.section === selectedSectionFilter.value);
  }

  return result;
});


// Function to get score for input binding
function getScoreForInput(student) {
  if (!student || !student.scores) return '';
  if (selectedScoreType.value === 'special') {
    return student.scores.special !== null && student.scores.special !== undefined ? String(student.scores.special) : '';
  }
  if (student.scores[selectedScoreType.value]) {
    const score = student.scores[selectedScoreType.value][selectedNumber.value];
    return score !== null && score !== undefined ? String(score) : '';
  }
  return '';
}

// Function to handle score changes from inline input OR special score increment
async function handleScoreChange(student, newValueStr, isIncrement = false) {
  const studentId = student.id;
  let newScoreValue;

  if (isIncrement && selectedScoreType.value === 'special') {
    const currentSpecialScore = parseFloat(student.scores.special) || 0;
    newScoreValue = currentSpecialScore + 1;
  } else {
    const trimmedValueStr = newValueStr.trim();
    if (trimmedValueStr === '') {
      newScoreValue = null;
    } else {
      newScoreValue = parseFloat(trimmedValueStr);
      if (isNaN(newScoreValue)) {
        console.warn(`Invalid score input for ${studentId}: ${trimmedValueStr}. Not updating.`);
        // Optionally, re-fetch or revert to show the old value immediately
        // For now, we'll let Vue's reactivity handle the display based on the model
        const studentToRefresh = students.value.find(s => s.id === studentId);
        if (studentToRefresh) { // Force a re-render by re-assigning a part of the object, or the object itself
          studentToRefresh.scores = {...studentToRefresh.scores};
        }
        return;
      }
    }
  }

  const studentIndex = students.value.findIndex(s => s.id === studentId);
  if (studentIndex === -1) return;

  const updatedScores = JSON.parse(JSON.stringify(students.value[studentIndex].scores));

  if (selectedScoreType.value === 'special') {
    updatedScores.special = newScoreValue === null ? 0 : newScoreValue;
  } else {
    if (!updatedScores[selectedScoreType.value]) {
      updatedScores[selectedScoreType.value] = {};
    }
    if (newScoreValue === null) {
      delete updatedScores[selectedScoreType.value][selectedNumber.value];
    } else {
      updatedScores[selectedScoreType.value][selectedNumber.value] = newScoreValue;
    }
  }

  students.value[studentIndex].scores = updatedScores; // Optimistic update

  try {
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, { scores: updatedScores });
  } catch (error) {
    console.error(`Error saving score for ${studentId}:`, error);
    Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถบันทึกคะแนนสำหรับ ${student.name} ได้`, 'error');
    await loadStudents(); // Revert on error
  }
}

// Function specifically for incrementing special score via button
async function incrementSpecialScore(student) {
  // We can reuse handleScoreChange by passing a dummy newValueStr and isIncrement flag
  // Or, implement dedicated logic here if it diverges significantly
  const studentId = student.id;
  const studentIndex = students.value.findIndex(s => s.id === studentId);
  if (studentIndex === -1) return;

  let currentSpecialScore = students.value[studentIndex].scores.special;
  if (currentSpecialScore === null || currentSpecialScore === undefined || isNaN(parseFloat(currentSpecialScore))) {
    currentSpecialScore = 0;
  } else {
    currentSpecialScore = parseFloat(currentSpecialScore);
  }
  const newScoreValue = currentSpecialScore + 1;

  // Optimistic update
  const oldScores = JSON.parse(JSON.stringify(students.value[studentIndex].scores)); // For potential revert
  students.value[studentIndex].scores.special = newScoreValue;


  try {
    const studentRef = doc(db, 'students', studentId);
    // Update only the special score field for efficiency
    await updateDoc(studentRef, {
      'scores.special': newScoreValue
    });
    // console.log(`Special score incremented for ${student.name} to ${newScoreValue}`);
  } catch (error) {
    console.error(`Error incrementing special score for ${studentId}:`, error);
    Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถเพิ่มคะแนนพิเศษสำหรับ ${student.name} ได้`, 'error');
    // Revert optimistic update
    students.value[studentIndex].scores = oldScores;
    // Or reload all: await loadStudents();
  }
}


// ล้างการค้นหา
function clearSearch() {
  searchQuery.value = ''
}

// ดูสถานะคะแนน
function getScoreStatus(student, type, number) {
  if (!student || !student.scores) return 'pending';
  let score;
  if (type === 'special') {
    score = student.scores.special;
    // For special, 0 might be 'pending' or a valid score.
    // If 0 is a valid "given" score, change this condition.
    // Current logic: not null, not undefined, and >0 is 'completed'. Or even just existing.
    return (score !== undefined && score !== null) ? 'completed' : 'pending';
  } else {
    score = student.scores[type]?.[number];
    return (score !== undefined && score !== null && String(score).trim() !== '') ? 'completed' : 'pending';
  }
}

// ดูคะแนน (for display in summary, not the input)
function getScoreDisplay(student, type, number) {
  if (!student || !student.scores) return '-';
  let score;
  if (type === 'special') {
    score = student.scores.special;
  } else {
    score = student.scores[type]?.[number];
  }
  return (score !== undefined && score !== null && String(score).trim() !== '') ? score : '-';
}


// คำนวณคะแนนรวม
function getTotalScore(student) {
  // This function seems to be for a different view (summary).
  // It's not directly used in the score editing table UI provided.
  // Keeping it as it might be used elsewhere or intended for future use.
  if (!student || !student.scores) return '0.00';
  let total = 0;
  if (student.scores.lab) {
    Object.values(student.scores.lab).forEach(s => total += parseFloat(s) || 0);
  }
  if (student.scores.assignment) {
    Object.values(student.scores.assignment).forEach(s => total += parseFloat(s) || 0);
  }
  total += parseFloat(student.scores.special) || 0;
  return total.toFixed(2);
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
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
    <!-- Header -->
    <header class="bg-white shadow-lg">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-6">
          <div class="flex items-center">
             <router-link to="/admin" class="flex-shrink-0 block">
              <h1 class="text-2xl font-bold text-green-600">ระบบเช็คชื่อและให้คะแนน</h1>
              <h1 class=" text-gray-500">CP352201 & SC362201 Web Design Technologies</h1>
            </router-link>
          </div>
          <div class="flex items-center space-x-4">
            <div class="text-gray-700">
              <span class="text-sm">สวัสดี, </span>
              <span class="font-semibold">{{ userEmail }}</span>
            </div>
            <button @click="logout"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300 font-medium text-sm">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      <!-- Score Management Tab -->
      <div v-if="activeTab === 'scores'">
        <!-- Score Type Selector -->
        <div class="mb-6 bg-white rounded-lg shadow p-4">
          <h3 class="text-lg font-medium text-gray-900 mb-4">เลือกประเภทคะแนน</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button @click="selectedScoreType = 'lab'; selectedNumber = 1;"
              :class="[
                'p-4 rounded-lg border-2 transition-colors duration-200',
                selectedScoreType === 'lab'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              ]">
              <div class="text-center">
                <div class="text-lg font-semibold">Lab</div>
                <div class="text-sm text-gray-500">1-14</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'assignment'; selectedNumber = 1;"
              :class="[
                'p-4 rounded-lg border-2 transition-colors duration-200',
                selectedScoreType === 'assignment'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 hover:border-gray-300'
              ]">
              <div class="text-center">
                <div class="text-lg font-semibold">Assignment</div>
                <div class="text-sm text-gray-500">1-12</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'special'"
              :class="[
                'p-4 rounded-lg border-2 transition-colors duration-200',
                selectedScoreType === 'special'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 hover:border-gray-300'
              ]">
              <div class="text-center">
                <div class="text-lg font-semibold">คะแนนพิเศษ</div>
                <div class="text-sm text-gray-500">Extra Points</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Number Selector (for Lab/Assignment) -->
        <div v-if="selectedScoreType !== 'special'" class="mb-6 bg-white rounded-lg shadow p-4">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            เลือก {{ selectedScoreType === 'lab' ? 'Lab' : 'Assignment' }} ที่
          </h3>
          <div class="grid grid-cols-7 sm:grid-cols-14 gap-2">
            <button
              v-for="n in (selectedScoreType === 'lab' ? 14 : 12)"
              :key="n"
              @click="selectedNumber = n"
              :class="[
                'p-2 rounded-md text-sm font-medium transition-colors duration-200',
                selectedNumber === n
                  ? selectedScoreType === 'lab'
                    ? 'bg-blue-600 text-white'
                    : 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              ]"
            >
              {{ n }}
            </button>
          </div>
        </div>
        
        <!-- Filters: Search, Major, Section -->
        <div class="mb-6 bg-white rounded-lg shadow p-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <!-- Search Input -->
            <div class="md:col-span-1">
              <label for="search" class="block text-sm font-medium text-gray-700">ค้นหา</label>
              <div class="mt-1 relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <input v-model="searchQuery" id="search" type="text"
                  class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="รหัส, ชื่อ, สาขา...">
                <button v-if="searchQuery" @click="clearSearch"
                    class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>
                </button>
              </div>
            </div>
           <!-- Major Filter -->
            <div>
              <label for="majorFilter" class="block text-sm font-medium text-gray-700">สาขา</label>
              <select id="majorFilter" v-model="selectedMajorFilter"
                class="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md">
                <option v-for="major in availableMajors" :key="major" :value="major">{{ major }}</option>
              </select>
            </div>
            <!-- Section Filter -->
            <div>
              <label for="sectionFilter" class="block text-sm font-medium text-gray-700">กลุ่มเรียน</label>
              <select id="sectionFilter" v-model="selectedSectionFilter"
                class="mt-1 block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md">
                <option v-for="section in availableSections" :key="section" :value="section">{{ section }}</option>
              </select>
            </div>

          </div>
        </div>


        <!-- Students Score Table -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200">
            <h3 class="text-lg font-medium text-gray-900">
              บันทึกคะแนน{{ selectedScoreType === 'lab' ? ' Lab' : selectedScoreType === 'assignment' ? ' Assignment' : 'พิเศษ' }}
              {{ selectedScoreType !== 'special' ? ` ที่ ${selectedNumber}` : '' }}
              <span class="text-sm text-gray-500 ml-2">({{ filteredStudents.length }} คน)</span>
            </h3>
          </div>

          <div v-if="isLoading && !students.length" class="p-8 text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p class="mt-2 text-gray-600">กำลังโหลดข้อมูล...</p>
          </div>
          <div v-else-if="!filteredStudents.length" class="p-8 text-center text-gray-600">
            {{ searchQuery || selectedMajorFilter !== 'สาขาทั้งหมด' || selectedSectionFilter !== 'กลุ่มเรียนทั้งหมด' ? 'ไม่พบข้อมูลนักศึกษาที่ตรงตามเงื่อนไขการค้นหา/กรอง' : 'ยังไม่มีข้อมูลนักศึกษา' }}
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">รหัสนักศึกษา</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สาขา</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">กลุ่ม</th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-40">คะแนน</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="student in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ student.studentId }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ student.name }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ student.major || '-' }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ student.section || '-' }}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    <div class="flex items-center justify-center space-x-1">
                        <input
                          type="number"
                          :value="getScoreForInput(student)"
                          @change="handleScoreChange(student, $event.target.value)"
                          step="0.1"
                          min="0"
                          :max="selectedScoreType === 'special' ? 100 : (selectedScoreType === 'lab' ? 10 : 20)"
                          class="w-24 p-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="-"
                          :aria-label="`คะแนน ${selectedScoreType} ของ ${student.name}`"
                        />
                        <button
                            v-if="selectedScoreType === 'special'"
                            @click="incrementSpecialScore(student)"
                            class="p-1.5 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors text-xs"
                            title="เพิ่มคะแนนพิเศษ 1 คะแนน"
                            aria-label="เพิ่มคะแนนพิเศษ 1 คะแนน">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
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
      <footer class="text-center py-4 text-xs text-gray-500">
        &copy; {{ new Date().getFullYear() }} CP352201 & SC362201 Web Design Technologies
      </footer>
    </main>
  </div>
</template>