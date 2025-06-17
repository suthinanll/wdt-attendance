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
// Removed Modal related states: showScoreModal, editingStudent, scoreValue

// ฟังก์ชันกรองข้อมูลตามการค้นหา
const filteredStudents = computed(() => {
  if (!searchQuery.value) {
    return students.value
  }
  const query = searchQuery.value.toLowerCase()
  return students.value.filter(student =>
    student.studentId.toLowerCase().includes(query) ||
    student.name.toLowerCase().includes(query) ||
    student.major.toLowerCase().includes(query)
  )
})

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
        studentId: data.studentId || docSnapshot.id, // Prefer studentId field, fallback to doc ID
        name: data.name || '',
        major: data.major || '',
        scores: data.scores || {
          lab: {},
          assignment: {},
          special: 0 // Default special score to 0
        }
      })
    })
    // เรียงลำดับตาม studentId
    students.value.sort((a, b) => a.studentId.localeCompare(b.studentId))
  } catch (error) {
    console.error('Error loading students:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักศึกษาได้', 'error')
  } finally {
    isLoading.value = false
  }
}

// Function to get score for input binding
function getScoreForInput(student) {
  if (!student || !student.scores) return '';

  if (selectedScoreType.value === 'special') {
    // Return string for input, handle null/undefined as empty string
    return student.scores.special !== null && student.scores.special !== undefined ? String(student.scores.special) : '';
  }

  if (student.scores[selectedScoreType.value]) {
    const score = student.scores[selectedScoreType.value][selectedNumber.value];
    return score !== null && score !== undefined ? String(score) : '';
  }
  return '';
}

// Function to handle score changes from inline input
async function handleScoreChange(student, newValueStr) {
  const studentId = student.id;
  let newScoreValue;

  // Trim whitespace from input
  const trimmedValueStr = newValueStr.trim();

  if (trimmedValueStr === '') {
    newScoreValue = null; // Treat empty input as "no score" or "clear score"
  } else {
    newScoreValue = parseFloat(trimmedValueStr);
    if (isNaN(newScoreValue)) {
      // If input is not a valid number and not empty, revert or show error
      // For now, we'll log a warning and prevent update for non-empty invalid strings
      console.warn(`Invalid score input for ${studentId}: ${trimmedValueStr}. Not updating.`);
      // Optionally, force refresh the input to its previous value
      const studentToUpdate = students.value.find(s => s.id === studentId);
      if (studentToUpdate) {
        // This is a bit of a hack to force re-render of the input if Vue doesn't pick up the change
        // A better way might be to have a temp variable for the input if direct DOM manipulation is needed
        // For now, the input might retain the invalid text until next render cycle or if user changes type/number
      }
      return;
    }
  }

  const studentIndex = students.value.findIndex(s => s.id === studentId);
  if (studentIndex === -1) return;

  // Create a deep copy of the student's scores to modify safely
  const updatedScores = JSON.parse(JSON.stringify(students.value[studentIndex].scores));

  if (selectedScoreType.value === 'special') {
    updatedScores.special = newScoreValue === null ? 0 : newScoreValue; // Firestore often prefers 0 over null for numbers in sums
  } else {
    // Ensure the score type object (lab/assignment) exists
    if (!updatedScores[selectedScoreType.value]) {
      updatedScores[selectedScoreType.value] = {};
    }
    if (newScoreValue === null) {
      // If newScore is null, we can delete the key or set to null.
      // Deleting key is cleaner if score doesn't exist.
      delete updatedScores[selectedScoreType.value][selectedNumber.value];
    } else {
      updatedScores[selectedScoreType.value][selectedNumber.value] = newScoreValue;
    }
  }

  // Optimistically update local state
  students.value[studentIndex].scores = updatedScores;

  // Persist to Firestore
  try {
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, {
      scores: updatedScores
    });
    // console.log(`Score updated for ${student.name} (${studentId}) for ${selectedScoreType.value} ${selectedScoreType.value !== 'special' ? selectedNumber.value : ''} to ${newScoreValue}`);
    // No Swal for every minor change to avoid popup fatigue.
    // Consider a small visual cue on the input (e.g., temporary border color change)
  } catch (error) {
    console.error(`Error saving score for ${studentId}:`, error);
    Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถบันทึกคะแนนสำหรับ ${student.name} ได้`, 'error');
    // Revert optimistic update or reload all data to ensure consistency
    // Reloading all students is simpler but less efficient
    await loadStudents();
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
    // If 0 is a valid score that means "completed", adjust this.
    // Original logic: > 0 is completed. So 0, null, undefined is pending.
    return score !== undefined && score !== null && score > 0 ? 'completed' : 'pending';
  } else {
    score = student.scores[type]?.[number];
    // For lab/assignment, undefined, null, or empty string was 'pending'.
    // If 0 is a valid score, it should be 'completed'.
    return score !== undefined && score !== null && String(score).trim() !== '' ? 'completed' : 'pending';
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
  if (!student || !student.scores) return '0.00';
  let total = 0;

  // Lab scores
  if (student.scores.lab) {
    for (let i = 1; i <= 14; i++) {
      total += parseFloat(student.scores.lab[i]) || 0;
    }
  }

  // Assignment scores
  if (student.scores.assignment) {
    for (let i = 1; i <= 12; i++) { // Corrected loop for assignments (1-12)
      total += parseFloat(student.scores.assignment[i]) || 0;
    }
  }

  // Special score
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
            <h1 class="text-3xl font-bold text-green-700">ระบบเช็คชื่อและให้คะแนน</h1>
            <h1 class="text-xl text-gray-500">CP352201 & SC362201 Web Design Technologies</h1>
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

        <div class="mb-6 bg-white rounded-lg shadow p-4">
          <div class="flex flex-col sm:flex-row gap-4 items-center">
            <div class="flex-1 relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>
              <input v-model="searchQuery" type="text"
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="ค้นหาด้วยรหัสนักศึกษา ชื่อ หรือสาขา...">
            </div>
            <button v-if="searchQuery" @click="clearSearch"
              class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-300 flex items-center">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
              ล้าง
            </button>
          </div>
        </div>

        <!-- Students Score Table -->
        <div class="bg-white rounded-lg shadow-lg overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-200">
            <h3 class="text-lg font-medium text-gray-900">
              บันทึกคะแนน{{ selectedScoreType === 'lab' ? ' Lab' : selectedScoreType === 'assignment' ? ' Assignment' : 'พิเศษ' }}
              {{ selectedScoreType !== 'special' ? ` ที่ ${selectedNumber}` : '' }}
            </h3>
          </div>

          <div v-if="isLoading && !students.length" class="p-8 text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p class="mt-2 text-gray-600">กำลังโหลดข้อมูล...</p>
          </div>

          <div v-else-if="!filteredStudents.length && searchQuery" class="p-8 text-center text-gray-600">
            ไม่พบข้อมูลนักศึกษาที่ตรงกับการค้นหา
          </div>
          
          <div v-else-if="!students.length" class="p-8 text-center text-gray-600">
            ยังไม่มีข้อมูลนักศึกษา
          </div>

          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รหัสนักศึกษา
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ชื่อ
                  </th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สาขา
                  </th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32"> <!-- Added w-32 for consistent width -->
                    คะแนน
                  </th>
                  <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                <tr v-for="student in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                  <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {{ student.studentId }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {{ student.name }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {{ student.major }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    <input
                      type="number"
                      :value="getScoreForInput(student)"
                      @change="handleScoreChange(student, $event.target.value)"
                      step="0.1"
                      min="0"
                      :max="selectedScoreType === 'special' ? 100 : (selectedScoreType === 'lab' ? 10 : 20)"
                      class="w-24 p-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-green-500 focus:border-transparent appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="-"
                    />
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-center">
                    <span :class="[
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      getScoreStatus(student, selectedScoreType, selectedNumber) === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    ]">
                      {{ getScoreStatus(student, selectedScoreType, selectedNumber) === 'completed' ? 'ให้แล้ว' : 'ยังไม่ให้' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>


        <div class="mt-6 bg-white rounded-lg shadow p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">สรุปคะแนนรวม</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full">
              <thead class="border-b-2 border-gray-200">
                <tr>
                  <th class="text-left py-2 px-3 text-sm font-semibold text-gray-700">รหัสนักศึกษา</th>
                  <th class="text-left py-2 px-3 text-sm font-semibold text-gray-700">ชื่อ</th>
                  <th class="text-right py-2 px-3 text-sm font-semibold text-gray-700">คะแนนรวม</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="isLoading && !students.length">
                    <td colspan="3" class="py-4 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                </tr>
                <tr v-else-if="!filteredStudents.length && searchQuery">
                    <td colspan="3" class="py-4 text-center text-gray-500">ไม่พบข้อมูลนักศึกษาที่ตรงกับการค้นหา</td>
                </tr>
                <tr v-else-if="!students.length">
                    <td colspan="3" class="py-4 text-center text-gray-500">ยังไม่มีข้อมูลนักศึกษา</td>
                </tr>
                <template v-else>
                  <tr v-for="student in filteredStudents.slice(0, 10)" :key="`summary-${student.id}`" class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="py-2 px-3 text-sm text-gray-800">{{ student.studentId }}</td>
                    <td class="py-2 px-3 text-sm text-gray-800">{{ student.name }}</td>
                    <td class="py-2 px-3 text-right font-medium text-sm text-gray-800">{{ getTotalScore(student) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
            <div v-if="filteredStudents.length > 10" class="text-center py-3 text-sm text-gray-500">
              และอีก {{ filteredStudents.length - 10 }} คน... (แสดงผล 10 คนแรก)
            </div>
          </div>
        </div>

      </div>

      <!-- Removed Score Modal -->

    </main>
  </div>
</template>

