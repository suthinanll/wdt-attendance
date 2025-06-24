<!-- src/views/ScoreboardPage.vue -->
<template>
  <div class="min-h-screen bg-gray-100 p-4 sm:p-8">
    <div class="max-w-5xl mx-auto"> <!-- เพิ่ม max-w เพื่อรองรับตารางที่กว้างขึ้น -->
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">
        ตรวจสอบคะแนน
      </h1>

      <div class="mb-6 sm:mb-8 flex flex-col sm:flex-row items-stretch gap-3 sm:gap-4">
        <input
          v-model.trim="searchCode"
          type="text"
          placeholder="กรอกรหัสนักศึกษา (เช่น 67XXXXXXX-X)"
          class="flex-grow px-4 py-2.5 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
          @keyup.enter="handleSearch"
        />
        <button
          @click="handleSearch"
          :disabled="isLoading || !searchCode"
          class="bg-green-600 text-white px-6 py-2.5 rounded-md hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-medium"
        >
          <svg v-if="isLoading" class="animate-spin -ml-1 mr-2 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {{ isLoading ? 'กำลังค้นหา...' : 'ค้นหา' }}
        </button>
      </div>

      <div v-if="isLoading && !studentData" class="text-center py-10 text-gray-500">
        <p>กำลังโหลดข้อมูล...</p>
      </div>

      <div v-else-if="searchAttempted && !studentData && !error" class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md shadow">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm text-yellow-700">
              ไม่พบข้อมูลนักศึกษาสำหรับรหัส "<span class="font-medium">{{ lastSearchedCode }}</span>".
              กรุณาตรวจสอบรหัสและลองอีกครั้ง
            </p>
          </div>
        </div>
      </div>

      <div v-else-if="error" class="bg-red-50 border-l-4 border-red-400 p-4 rounded-md shadow">
         <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.707-4.707l.707-.707L10 12.586l2.293-2.293.707.707L10.707 13.293l2.293 2.293-.707.707L10 13.293l-2.293 2.293z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm text-red-700">
              เกิดข้อผิดพลาด: {{ error }}. กรุณาลองใหม่อีกครั้ง
            </p>
          </div>
        </div>
      </div>

      <div v-if="studentData" class="bg-white rounded-xl shadow-xl p-6 sm:p-8">
        <div class="mb-6 pb-6 border-b border-gray-200">
          <h2 class="text-2xl font-semibold text-gray-900 mb-1">{{ studentData.name }}</h2>
          <p class="text-sm text-gray-600">รหัสนักศึกษา: <span class="font-medium">{{ studentData.studentId }}</span></p>
          <p v-if="studentData.major" class="text-sm text-gray-600">สาขา: <span class="font-medium">{{ studentData.major }}</span></p>
          <p v-if="studentData.section" class="text-sm text-gray-600">กลุ่มเรียน: <span class="font-medium">{{ studentData.section }}</span></p>
        </div>

        <div class="mb-6">
          <label for="scoreTypeSelect" class="block text-sm font-medium text-gray-700 mb-1">เลือกประเภทคะแนนที่ต้องการดู:</label>
          <select
            id="scoreTypeSelect"
            v-model="selectedScoreType"
            class="block w-full sm:w-auto pl-3 pr-10 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option value="all">คะแนนทั้งหมด (สรุป)</option>
            <option value="lab">คะแนน Lab</option>
            <option value="assignment">คะแนน Assignment</option>
            <option value="attendance">การเข้าชั้นเรียน</option>
            <option value="special">คะแนนพิเศษ</option>
          </select>
        </div>

        <div class="overflow-x-auto">
          <!-- สรุปคะแนนทั้งหมด -->
          <div v-if="selectedScoreType === 'all'" class="space-y-4">
            <div class="bg-blue-50 p-4 rounded-lg">
              <h4 class="font-semibold text-blue-700 mb-2">คะแนน Lab ทั้งหมด : {{ calculateTotalScore(studentData.scores?.lab) }}</h4>
              <p class="text-xs text-gray-600">ดูรายละเอียดคะแนน Lab โดยเลือก "คะแนน Lab" จากเมนู</p>
            </div>
            <div class="bg-green-50 p-4 rounded-lg">
              <h4 class="font-semibold text-green-700 mb-2">คะแนน Assignment ทั้งหมด : {{ calculateTotalScore(studentData.scores?.assignment) }}</h4>
               <p class="text-xs text-gray-600">ดูรายละเอียดคะแนน Assignment โดยเลือก "คะแนน Assignment" จากเมนู</p>
            </div>
             <div class="bg-purple-50 p-4 rounded-lg">
              <h4 class="font-semibold text-purple-700 mb-2">การเข้าชั้นเรียน ทั้งหมด : {{ calculateTotalAttendance(studentData.attendanceData) }}</h4>
               <p class="text-xs text-gray-600">ดูรายละเอียดการเข้าชั้นเรียน โดยเลือก "การเข้าชั้นเรียน" จากเมนู</p>
            </div>
            <!-- **CHANGED**: Display special score and note -->
            <div class="bg-yellow-50 p-4 rounded-lg">
              <h4 class="font-semibold text-yellow-700">คะแนนพิเศษ: {{ studentData.scores?.special?.score ?? '-' }}
                <span v-if="studentData.scores?.special?.note" class="text-xs font-normal text-yellow-800 ml-1">({{ studentData.scores.special.note }})</span>
              </h4>
            </div>
          </div>

          <!-- ตารางคะแนน Lab -->
          <!-- **CHANGED**: Added 'Note' column and updated data binding -->
          <table v-if="selectedScoreType === 'lab'" class="min-w-full divide-y divide-gray-200 border border-gray-300">
            <thead class="bg-blue-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">Lab ที่</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">คะแนน</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="!studentData.scores?.lab || Object.keys(studentData.scores.lab).length === 0">
                <td colspan="3" class="px-4 py-4 text-sm text-gray-500 text-center italic">ไม่มีข้อมูลคะแนน Lab</td>
              </tr>
              <tr v-for="(scoreData, labName) in sortedScores(studentData.scores?.lab)" :key="'lab-row-' + labName">
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-700">Lab {{ labName }}</td>
                <td class="px-4 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">{{ scoreData.score ?? '-' }}</td>
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span v-if="scoreData.note">{{ scoreData.note }}</span>
                  <span v-else class="italic text-gray-400">-</span>
                </td>
              </tr>
              <tr v-if="studentData.scores?.lab && Object.keys(studentData.scores.lab).length > 0" class="bg-blue-50 font-semibold">
                <td class="px-4 py-3 text-sm text-blue-700 text-right" colspan="2">รวมคะแนน Lab:</td>
                <td class="px-4 py-3 text-sm text-blue-700">{{ calculateTotalScore(studentData.scores?.lab) }}</td>
              </tr>
            </tbody>
          </table>

          <!-- ตารางคะแนน Assignment -->
          <!-- **CHANGED**: Added 'Note' column and updated data binding -->
          <table v-if="selectedScoreType === 'assignment'" class="min-w-full divide-y divide-gray-200 border border-gray-300">
            <thead class="bg-green-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">Assignment ที่</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">คะแนน</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="!studentData.scores?.assignment || Object.keys(studentData.scores.assignment).length === 0">
                <td colspan="3" class="px-4 py-4 text-sm text-gray-500 text-center italic">ไม่มีข้อมูลคะแนน Assignment</td>
              </tr>
              <tr v-for="(scoreData, assignmentName) in sortedScores(studentData.scores?.assignment)" :key="'assign-row-' + assignmentName">
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-700">Assignment {{ assignmentName }}</td>
                <td class="px-4 py-4 whitespace-nowrap text-sm font-semibold text-green-600">{{ scoreData.score ?? '-' }}</td>
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span v-if="scoreData.note">{{ scoreData.note }}</span>
                  <span v-else class="italic text-gray-400">-</span>
                </td>
              </tr>
              <tr v-if="studentData.scores?.assignment && Object.keys(studentData.scores.assignment).length > 0" class="bg-green-50 font-semibold">
                <td class="px-4 py-3 text-sm text-green-700 text-right" colspan="2">รวมคะแนน Assignment:</td>
                <td class="px-4 py-3 text-sm text-green-700">{{ calculateTotalScore(studentData.scores?.assignment) }}</td>
              </tr>
            </tbody>
          </table>

          <!-- ตารางการเข้าชั้นเรียน (No changes needed here) -->
          <table v-if="selectedScoreType === 'attendance'" class="min-w-full divide-y divide-gray-200 border border-gray-300">
            <thead class="bg-purple-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">สัปดาห์ที่</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-purple-700 uppercase tracking-wider">สถานะ (คะแนน)</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-if="!studentData.attendanceData || Object.keys(studentData.attendanceData).length === 0 && attendanceHeaders.length > 0">
                 <td colspan="2" class="px-4 py-4 text-sm text-gray-500 text-center italic">ไม่มีข้อมูลการเข้าชั้นเรียน</td>
              </tr>
              <tr v-for="week in attendanceHeaders" :key="'att-row-' + week">
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-700">สัปดาห์ที่ {{ week }}</td>
                <td class="px-4 py-4 whitespace-nowrap text-sm font-semibold"
                  :class="{
                    'text-purple-600': getAttendanceDisplay(week) === '1',
                    'text-orange-500': getAttendanceDisplay(week) === '0.5',
                    'text-red-500': getAttendanceDisplay(week) === '0',
                    'text-gray-500': getAttendanceDisplay(week) === '-'
                  }">
                  {{ getAttendanceDisplay(week) }}
                  <span v-if="getAttendanceDisplay(week) === '1'" class="text-xs text-gray-500 ml-1">(ตรงเวลา)</span>
                  <span v-if="getAttendanceDisplay(week) === '0.5'" class="text-xs text-gray-500 ml-1">(มาสาย)</span>
                  <span v-if="getAttendanceDisplay(week) === '0'" class="text-xs text-gray-500 ml-1">(ขาด)</span>
                  <span v-if="getAttendanceDisplay(week) === '-'" class="text-xs text-gray-500 ml-1">(ไม่มีข้อมูล)</span>
                </td>
              </tr>
              <tr v-if="attendanceHeaders.length > 0" class="bg-purple-50 font-semibold">
                  <td class="px-4 py-3 text-sm text-purple-700 text-right">รวมคะแนนการเข้าชั้นเรียน:</td>
                  <td class="px-4 py-3 text-sm text-purple-700">{{ calculateTotalAttendance(studentData.attendanceData) }}</td>
              </tr>
            </tbody>
          </table>

          <!-- คะแนนพิเศษ -->
          <!-- **CHANGED**: Display special score and note -->
           <div v-if="selectedScoreType === 'special'" class="bg-yellow-50 p-4 rounded-lg shadow">
             <h4 class="text-lg font-semibold text-yellow-700">คะแนนพิเศษ</h4>
             <p class="text-2xl font-bold text-yellow-800 mt-2">{{ studentData.scores?.special?.score ?? '-' }}</p>
             <p v-if="studentData.scores?.special?.note" class="text-sm text-gray-600 mt-1">
                <span class="font-medium">หมายเหตุ:</span> {{ studentData.scores.special.note }}
             </p>
             <p v-if="!studentData.scores?.special" class="text-sm text-gray-500 italic mt-1">ไม่มีข้อมูลคะแนนพิเศษ</p>
           </div>

        </div>
      </div>
    </div>
    <footer class="text-center py-6 text-xs text-gray-500">
        &copy; 2025 CP352201 & SC362201 Web Design Technologies. <br>
        Developed by suthinanll
    </footer>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'

const db = getFirestore()

const searchCode = ref('')
const studentData = ref(null)
const isLoading = ref(false)
const error = ref(null)
const searchAttempted = ref(false)
const lastSearchedCode = ref('')
const selectedScoreType = ref('all')

const attendanceHeaders = Array.from({ length: 15 }, (_, i) => (i + 1).toString())

// **ADDED**: Helper function to normalize score data for backward compatibility
function normalizeScores(rawScores) {
    const normalized = { lab: {}, assignment: {}, special: null };
    if (!rawScores) return normalized;

    // Normalize lab scores
    for (const key in rawScores.lab) {
        const value = rawScores.lab[key];
        if (typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'score')) {
            normalized.lab[key] = { score: value.score ?? null, note: value.note ?? '' };
        } else if (typeof value === 'number') {
            normalized.lab[key] = { score: value, note: '' }; // Convert old format
        }
    }
    // Normalize assignment scores
    for (const key in rawScores.assignment) {
        const value = rawScores.assignment[key];
        // eslint-disable-next-line no-prototype-builtins
        if (typeof value === 'object' && value !== null && value.hasOwnProperty('score')) {
            normalized.assignment[key] = { score: value.score ?? null, note: value.note ?? '' };
        } else if (typeof value === 'number') {
            normalized.assignment[key] = { score: value, note: '' }; // Convert old format
        }
    }
    // Normalize special score
    const specialValue = rawScores.special;
    if (typeof specialValue === 'object' && specialValue !== null && Object.prototype.hasOwnProperty.call(specialValue, 'score')) {
        normalized.special = { score: specialValue.score ?? null, note: specialValue.note ?? '' };
    } else if (typeof specialValue === 'number') {
        normalized.special = { score: specialValue, note: '' }; // Convert old format
    }
    return normalized;
}


async function fetchStudentScoreData(studentIdToSearch) {
  isLoading.value = true
  studentData.value = null
  error.value = null
  searchAttempted.value = true
  lastSearchedCode.value = studentIdToSearch
  selectedScoreType.value = 'all'

  try {
    const studentDocRef = doc(db, 'students', studentIdToSearch)
    const studentDocSnap = await getDoc(studentDocRef)

    if (!studentDocSnap.exists()) {
      isLoading.value = false
      return
    }
    
    const fetchedStudent = {
      id: studentDocSnap.id,
      studentId: studentDocSnap.id,
      name: studentDocSnap.data().name || 'N/A',
      major: studentDocSnap.data().major || '',
      section: studentDocSnap.data().section || '',
      // **CHANGED**: Use the normalization function
      scores: normalizeScores(studentDocSnap.data().scores),
      attendanceData: {}
    }

    // --- The rest of the attendance fetching logic remains the same ---
    const sessionSnapshot = await getDocs(collection(db, 'attendance_sessions'))
    const sessionMap = {}
    sessionSnapshot.docs.forEach(docSnap => {
      const data = docSnap.data()
      if (data.week) {
        sessionMap[docSnap.id] = data.week
      }
    })

    const attendanceQuery = query(
      collection(db, 'attendance_records'),
      where('studentId', '==', studentIdToSearch)
    )
    const attendanceSnapshot = await getDocs(attendanceQuery)
    const studentAttendance = {}
    attendanceSnapshot.docs.forEach(docSnap => {
      const data = docSnap.data()
      const week = sessionMap[data.sessionId] || data.sessionNumber
      if (week && attendanceHeaders.includes(String(week))) {
        studentAttendance[String(week)] = (typeof data.score !== "undefined" && data.score !== null) ? data.score : null
      }
    })
    fetchedStudent.attendanceData = studentAttendance
    studentData.value = fetchedStudent

  } catch (e) {
    console.error("Error fetching student data:", e)
    error.value = e.message || "ไม่สามารถดึงข้อมูลได้"
  } finally {
    isLoading.value = false
  }
}

function handleSearch() {
  if (searchCode.value && !isLoading.value) {
    fetchStudentScoreData(searchCode.value)
  }
}

function getAttendanceDisplay(weekNumber) {
  if (!studentData.value || !studentData.value.attendanceData) return '-'
  const score = studentData.value.attendanceData[String(weekNumber)]
  if (score === 1) return '1'
  if (score === 0.5) return '0.5'
  if (score === 0) return '0'
  if (score === null || typeof score === 'undefined') return '-'
  return String(score)
}

// **CHANGED**: Calculate total score from the new data structure
function calculateTotalScore(scoresObject) {
  if (!scoresObject || Object.keys(scoresObject).length === 0) return '-'
  let total = 0
  let hasNumericScore = false
  Object.values(scoresObject).forEach(scoreData => {
    // Check if scoreData exists and its score property is a number
    if (scoreData && typeof scoreData.score === 'number') {
      total += scoreData.score
      hasNumericScore = true
    }
  })
  return hasNumericScore ? total : '-'
}

function calculateTotalAttendance(attendanceObject) {
  if (!attendanceObject || Object.keys(attendanceObject).length === 0) return '-'
  const arr = Object.values(attendanceObject)
  if (arr.length === 0) return '-'
  let total = 0;
  let hasScore = false;
  arr.forEach(val => {
    if (typeof val === 'number') {
      total += val;
      hasScore = true;
    }
  });
  return hasScore ? total : '-';
}

const sortedScores = (scoresObject) => {
  if (!scoresObject || typeof scoresObject !== 'object') return {};
  const sortedKeys = Object.keys(scoresObject).sort((a, b) => parseInt(a) - parseInt(b));
  const result = {};
  for (const key of sortedKeys) {
    result[key] = scoresObject[key];
  }
  return result;
};
</script>

<style scoped>
table {
  table-layout: auto;
}
</style>