<!-- eslint-disable no-unused-vars -->
<!-- คะแนนรวม (แก้ไขแล้ว) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

import { auth } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import {
  getFirestore,
  collection,
  getDocs
} from 'firebase/firestore'

const router = useRouter()
const userEmail = ref('')
const db = getFirestore()

const searchQuery = ref('')
const selectedScoreType = ref('lab')
const studentsData = ref([])
const isLoading = ref(false)

async function fetchStudentsData() {
  try {
    isLoading.value = true
    const querySnapshot = await getDocs(collection(db, 'students'))

    studentsData.value = querySnapshot.docs.map(doc => {
      const data = doc.data()
      const labScores = {}
      if (data.scores && data.scores.lab) {
        Object.entries(data.scores.lab).forEach(([key, value]) => {
          if (!isNaN(parseInt(key))) labScores[key] = value
        })
      }
      const assignmentScores = {}
      if (data.scores && data.scores.assignment) {
        Object.entries(data.scores.assignment).forEach(([key, value]) => {
          if (!isNaN(parseInt(key))) assignmentScores[key] = value
        })
      }
      let firstName = '', lastName = ''
      if (data.name) {
        const nameParts = data.name.split(' ')
        if (nameParts.length >= 2) {
          firstName = nameParts[0]
          lastName = nameParts.slice(1).join(' ')
        } else {
          firstName = data.name
        }
      }

      return {
        id: doc.id,
        studentId: doc.id,
        name: data.name || '',
        firstName,
        lastName,
        major: data.major || '',
        section: data.section || '',
        program: data.program || '',
        labScores,
        assignmentScores,
        specialScore: data.scores?.special ?? 0,
        attendanceData: {}
      }
    })
    await fetchAttendanceData()
  } catch (error) {
    Swal.fire({
      icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลนักศึกษาได้'
    })
  } finally {
    isLoading.value = false
  }
}

async function fetchAttendanceData() {
  try {
    const querySnapshot = await getDocs(collection(db, 'attendance_records'))
    const attendanceMap = {}
    querySnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.studentId) {
        if (!attendanceMap[data.studentId]) {
          attendanceMap[data.studentId] = {}
        }
        if (data.sessionNumber) {
          attendanceMap[data.studentId][data.sessionNumber] = true
        }
      }
    })
    studentsData.value.forEach(student => {
      student.attendanceData = attendanceMap[student.studentId] || {}
    })
  } catch (error) {
    // do nothing
  }
}

const filteredStudents = computed(() => {
  if (!searchQuery.value) return studentsData.value
  const query = searchQuery.value.toLowerCase()
  return studentsData.value.filter(student =>
    student.studentId.toLowerCase().includes(query) ||
    student.firstName.toLowerCase().includes(query) ||
    student.lastName.toLowerCase().includes(query) ||
    student.name.toLowerCase().includes(query) ||
    (student.program && student.program.toLowerCase().includes(query)) ||
    (student.major && student.major.toLowerCase().includes(query))
  )
})

function clearSearch() { searchQuery.value = '' }

function getLabScore(student, labNumber) {
  return student.labScores[labNumber] !== undefined ?
    student.labScores[labNumber] : '-'
}
function getAssignmentScore(student, assignmentNumber) {
  return student.assignmentScores[assignmentNumber] !== undefined ?
    student.assignmentScores[assignmentNumber] : '-'
}
function getAttendanceStatus(student, sessionNumber) {
  return student.attendanceData[sessionNumber] ? '✓' : '-'
}

function calculateTotalLabScore(student) {
  let total = 0
  if (student.labScores) {
    Object.values(student.labScores).forEach(score => {
      if (typeof score === 'number') total += score
    })
  }
  return total
}
function calculateTotalAssignmentScore(student) {
  let total = 0
  if (student.assignmentScores) {
    Object.values(student.assignmentScores).forEach(score => {
      if (typeof score === 'number') total += score
    })
  }
  return total
}
function calculateTotalAttendance(student) {
  return Object.keys(student.attendanceData).length
}

const labHeaders = Array.from({ length: 15 }, (_, i) => `Lab ${i + 1}`)
const assignmentHeaders = Array.from({ length: 12 }, (_, i) => `Ass ${i + 1}`)
const attendanceHeaders = Array.from({ length: 16 }, (_, i) => `ครั้งที่ ${i + 1}`)

function exportToExcel() {
  let data = []
  let headers = []
  if (selectedScoreType.value === 'lab') {
    headers = ['รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'หลักสูตร', 'สาขา', 'กลุ่ม', ...labHeaders, 'คะแนนพิเศษ', 'คะแนนรวม']
    data = filteredStudents.value.map(student => {
      const row = [
        student.studentId,
        `${student.firstName} ${student.lastName}`,
        student.program,
        student.major,
        student.section,
      ]
      for (let i = 1; i <= 15; i++) row.push(getLabScore(student, i.toString()))
      row.push(student.specialScore)
      row.push(calculateTotalLabScore(student) + (Number(student.specialScore) || 0))
      return row
    })
  }
  else if (selectedScoreType.value === 'assignment') {
    headers = ['รหัสนักศึกษา', 'ชื่อ-นามสกุล', ...assignmentHeaders, 'คะแนนรวม']
    data = filteredStudents.value.map(student => {
      const row = [
        student.studentId,
        `${student.firstName} ${student.lastName}`,
      ];
      for (let i = 1; i <= 12; i++) {
        row.push(getAssignmentScore(student, i.toString()))
      }
      row.push(calculateTotalAssignmentScore(student))
      return row
    });
  }
  else if (selectedScoreType.value === 'attendance') {
    headers = ['รหัสนักศึกษา', 'ชื่อ-นามสกุล', ...attendanceHeaders, 'รวมครั้ง']
    data = filteredStudents.value.map(student => {
      const row = [
        student.studentId,
        `${student.firstName} ${student.lastName}`,
      ];
      for (let i = 1; i <= 16; i++) {
        row.push(getAttendanceStatus(student, i.toString()))
      }
      row.push(calculateTotalAttendance(student))
      return row
    });
  }
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data])
  const workbook = XLSX.utils.book_new()
  let sheetName = 'คะแนน'
  if (selectedScoreType.value === 'lab') {
    sheetName = 'คะแนน Lab'
  } else if (selectedScoreType.value === 'assignment') {
    sheetName = 'คะแนน Assignment'
  } else if (selectedScoreType.value === 'attendance') {
    sheetName = 'ข้อมูลเช็คชื่อ'
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${(today.getMonth()+1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
  XLSX.writeFile(workbook, `${sheetName}_${dateStr}.xlsx`)
  Swal.fire({
    icon: 'success',
    title: 'ส่งออกข้อมูลสำเร็จ',
    text: `ได้ส่งออกข้อมูล${sheetName}เรียบร้อยแล้ว`,
    timer: 2000,
    showConfirmButton: false
  })
}

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email
      fetchStudentsData()
    } else {
      router.push('/')
    }
  })
})

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
              <h1 class="text-3xl font-bold text-green-700">
                ระบบเช็คชื่อและให้คะแนน
              </h1>
              <h1 class="text-xl text-gray-500">
                CP352201 & SC362201 Web Design Technologies
              </h1>
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
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="bg-white shadow-md rounded-lg p-6">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-gray-800">ตารางคะแนนรวม</h2>
          <button @click="exportToExcel"
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300 flex items-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            ส่งออกเป็น Excel
          </button>
        </div>

        <!-- Score Type Selector -->
        <div class="mb-6 bg-white rounded-lg shadow p-4">
          <h3 class="text-lg font-medium text-gray-900 mb-4">เลือกประเภทคะแนน</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button @click="selectedScoreType = 'lab'"
              :class="[
                'p-4 rounded-lg border-2 transition-colors duration-200',
                selectedScoreType === 'lab' 
                  ? 'border-blue-500 bg-blue-50 text-blue-700' 
                  : 'border-gray-200 hover:border-gray-300'
              ]">
              <div class="text-center">
                <div class="text-lg font-semibold">Lab</div>
                <div class="text-sm text-gray-500">1-15</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'assignment'"
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
            <button @click="selectedScoreType = 'attendance'"
              :class="[
                'p-4 rounded-lg border-2 transition-colors duration-200',
                selectedScoreType === 'attendance' 
                  ? 'border-purple-500 bg-purple-50 text-purple-700' 
                  : 'border-gray-200 hover:border-gray-300'
              ]">
              <div class="text-center">
                <div class="text-lg font-semibold">เช็คชื่อ</div>
                <div class="text-sm text-gray-500">16 ครั้ง</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Search Bar -->
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

        <!-- Loading Indicator -->
        <div v-if="isLoading" class="flex justify-center items-center py-10">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
          <span class="ml-3 text-lg text-gray-700">กำลังโหลดข้อมูล...</span>
        </div>
        
        <!-- Score Table -->
        <div v-else class="overflow-x-auto bg-gray-50 rounded-lg p-4">
          <!-- Lab Scores Table (เพิ่ม program, section, major, คะแนนพิเศษ) -->
          <table v-if="selectedScoreType === 'lab'" class="min-w-full divide-y divide-gray-200 border bg-white">
            <thead class="bg-blue-50">
              <tr>
                <th class="px-3 py-3 text-left text-xs font-medium text-blue-800 uppercase tracking-wider sticky left-0 bg-blue-50 z-10 border-r">รหัสนักศึกษา</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-blue-800 uppercase tracking-wider sticky left-[120px] bg-blue-50 z-10 border-r">ชื่อ-นามสกุล</th>
                <th class="px-3 py-3 text-xs text-blue-800 uppercase tracking-wider border-r">หลักสูตร</th>
                <th v-for="(header, index) in labHeaders" :key="header"
                  class="px-3 py-3 text-center text-xs font-medium text-blue-800 uppercase tracking-wider border-r"
                  :class="{'bg-blue-100': index % 2 === 0}">
                  {{ header }}
                </th>
                <th class="px-3 py-3 text-center text-xs font-medium text-blue-800 uppercase tracking-wider border-r bg-blue-100">คะแนนพิเศษ</th>
                <th class="px-3 py-3 text-center text-xs font-medium text-blue-800 uppercase tracking-wider bg-blue-100">รวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, studentIndex) in filteredStudents" :key="student.id"
                :class="{'bg-blue-50': studentIndex % 2 === 1}">
                <td class="px-3 py-2 whitespace-normal text-sm font-medium text-gray-900 sticky left-0 z-10 border-r"
                    :class="{'bg-white': studentIndex % 2 === 0, 'bg-blue-50': studentIndex % 2 === 1}">{{ student.studentId }}</td>
                <td class="px-3 py-2 whitespace-normal text-sm text-gray-900 sticky left-[120px] z-10 border-r min-w-[180px]"
                    :class="{'bg-white': studentIndex % 2 === 0, 'bg-blue-50': studentIndex % 2 === 1}">{{ student.firstName }} {{ student.lastName }}</td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center border-r">{{ student.program }}</td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center border-r">{{ student.major }}</td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center border-r">{{ student.section }}</td>
                <td v-for="(_, i) in 15" :key="i"
                    class="px-3 py-2 whitespace-normal text-sm text-center border-r"
                    :class="{'bg-blue-50': i % 2 === 0 && studentIndex % 2 === 0, 
                            'bg-blue-100': i % 2 === 0 && studentIndex % 2 === 1}">
                  <span :class="{'font-bold text-blue-700': getLabScore(student, (i+1).toString()) !== '-'}">
                    {{ getLabScore(student, (i+1).toString()) }}
                  </span>
                </td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center border-r bg-blue-50 font-semibold text-blue-700">{{ student.specialScore }}</td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center font-medium text-blue-700 bg-blue-50">
                  {{ calculateTotalLabScore(student) + (Number(student.specialScore)||0) }}
                </td>
              </tr>
            </tbody>
          </table>
          
          <!-- Assignment Scores Table -->
          <table v-if="selectedScoreType === 'assignment'" class="min-w-full divide-y divide-gray-200 border bg-white">
            <thead class="bg-green-50">
              <tr>
                <th class="px-3 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider sticky left-0 bg-green-50 z-10 border-r">รหัสนักศึกษา</th>
                <th class="px-3 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider sticky left-[120px] bg-green-50 z-10 border-r">ชื่อ-นามสกุล</th>
                <th v-for="(header, index) in assignmentHeaders" :key="header"
                  class="px-3 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider border-r"
                  :class="{'bg-green-100': index % 2 === 0}">
                  {{ header }}
                </th>
                <th class="px-3 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider bg-green-100">รวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, studentIndex) in filteredStudents" :key="student.id"
                  :class="{'bg-green-50': studentIndex % 2 === 1}">
                <td class="px-3 py-2 whitespace-normal text-sm font-medium text-gray-900 sticky left-0 z-10 border-r"
                    :class="{'bg-white': studentIndex % 2 === 0, 'bg-green-50': studentIndex % 2 === 1}">{{ student.studentId }}</td>
                <td class="px-3 py-2 whitespace-normal text-sm text-gray-900 sticky left-[120px] z-10 border-r min-w-[180px]"
                    :class="{'bg-white': studentIndex % 2 === 0, 'bg-green-50': studentIndex % 2 === 1}">
                  {{ student.firstName }} {{ student.lastName }}
                </td>
                <td v-for="(_, i) in 12" :key="i"
                    class="px-3 py-2 whitespace-normal text-sm text-center border-r"
                    :class="{'bg-green-50': i % 2 === 0 && studentIndex % 2 === 0,
                            'bg-green-100': i % 2 === 0 && studentIndex % 2 === 1}">
                  <span :class="{'font-bold text-green-700': getAssignmentScore(student, (i+1).toString()) !== '-'}">
                    {{ getAssignmentScore(student, (i+1).toString()) }}
                  </span>
                </td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center font-medium text-green-700 bg-green-50">
                  {{ calculateTotalAssignmentScore(student) }}
                </td>
              </tr>
            </tbody>
          </table>
          
          <!-- Attendance Table -->
          <table v-if="selectedScoreType === 'attendance'" class="min-w-full divide-y divide-gray-200 border bg-white">
            <thead class="bg-purple-50">
              <tr>
                <th class="px-3 py-3 text-left text-xs font-medium text-purple-800 uppercase tracking-wider sticky left-0 bg-purple-50 z-10 border-r">
                  รหัสนักศึกษา
                </th>
                <th class="px-3 py-3 text-left text-xs font-medium text-purple-800 uppercase tracking-wider sticky left-[120px] bg-purple-50 z-10 border-r">
                  ชื่อ-นามสกุล
                </th>
                <th v-for="(header, index) in attendanceHeaders" :key="header" scope="col" 
                  class="px-3 py-3 text-center text-xs font-medium text-purple-800 uppercase tracking-wider border-r"
                  :class="{'bg-purple-100': index % 2 === 0}">
                  {{ header }}
                </th>
                <th scope="col" class="px-3 py-3 text-center text-xs font-medium text-purple-800 uppercase tracking-wider bg-purple-100">
                  รวม
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, studentIndex) in filteredStudents" :key="student.id"
                  :class="{'bg-purple-50': studentIndex % 2 === 1}">
                <td class="px-3 py-2 whitespace-normal text-sm font-medium text-gray-900 sticky left-0 z-10 border-r"
                    :class="{'bg-white': studentIndex % 2 === 0, 'bg-purple-50': studentIndex % 2 === 1}">
                  {{ student.studentId }}
                </td>
                <td class="px-3 py-2 whitespace-normal text-sm text-gray-900 sticky left-[120px] z-10 border-r min-w-[180px]"
                    :class="{'bg-white': studentIndex % 2 === 0, 'bg-purple-50': studentIndex % 2 === 1}">
                  {{ student.firstName }} {{ student.lastName }}
                </td>
                <td v-for="(_, i) in 16" :key="i"
                    class="px-3 py-2 whitespace-normal text-sm text-center border-r"
                    :class="{'bg-purple-50': i % 2 === 0 && studentIndex % 2 === 0, 
                            'bg-purple-100': i % 2 === 0 && studentIndex % 2 === 1}">
                  <span :class="{'font-bold text-purple-700': getAttendanceStatus(student, (i+1).toString()) === '✓'}">
                    {{ getAttendanceStatus(student, (i+1).toString()) }}
                  </span>
                </td>
                <td class="px-3 py-2 whitespace-normal text-sm text-center font-medium text-purple-700 bg-purple-50">
                  {{ calculateTotalAttendance(student) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- No Data Message -->
          <div v-if="filteredStudents.length === 0" class="py-8 text-center text-gray-500">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h3 class="mt-2 text-lg font-medium text-gray-900">ไม่พบข้อมูลนักศึกษา</h3>
            <p class="mt-1 text-sm text-gray-500">ลองปรับเงื่อนไขการค้นหาหรือตรวจสอบการเชื่อมต่อฐานข้อมูล</p>
          </div>
        </div>
        <!-- Legend -->
        <div class="mt-4 text-sm text-gray-500 flex flex-wrap gap-x-6 gap-y-2">
          <div v-if="selectedScoreType === 'lab'">
            <span class="font-bold text-blue-700">10</span> = คะแนนที่บันทึกแล้ว,
            <span class="font-semibold text-blue-700">คะแนนพิเศษ</span> = คะแนนกรณีพิเศษ
          </div>
          <div v-if="selectedScoreType === 'assignment'">
            <span class="font-bold text-green-700">10</span> = คะแนนที่บันทึกแล้ว
          </div>
          <div v-if="selectedScoreType === 'attendance'">
            <span class="font-bold text-purple-700">✓</span> = มาเรียน
          </div>
          <div>
            <span>-</span> = ยังไม่มีข้อมูล
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overflow-x-auto {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

th, td {
  padding: 12px 16px;
  text-align: center;
  border: 1px solid #e2e8f0;
  font-size: 0.9rem;
  white-space: nowrap;
}

th {
  background-color: #f8fafc;
  color: #2d3748;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
  z-index: 10;
}

td {
  background-color: white;
  color: #4a5568;
}

/* Alternate row background for better readability */
tbody tr:nth-child(even) {
  background-color: #f7fafc;
}

/* Hover effect on rows */
tbody tr:hover {
  background-color: #edf2f7;
}

/* Sticky columns for student ID and name */
.sticky {
  position: sticky;
  background-color: inherit;
  z-index: 11;
}

/* Specific background for different score types */
.bg-blue-50 th, .bg-blue-50 td {
  background-color: #eff6ff;
}
.bg-green-50 th, .bg-green-50 td {
  background-color: #f0fff4;
}
.bg-purple-50 th, .bg-purple-50 td {
  background-color: #faf5ff;
}

/* Highlight scores */
.font-bold.text-blue-700, .font-bold.text-green-700, .font-bold.text-purple-700 {
  font-weight: 700;
}

/* Border radius for table */
table {
  border-radius: 8px;
  overflow: hidden;
}
</style>