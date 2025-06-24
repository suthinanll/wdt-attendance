<!-- eslint-disable no-unused-vars -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'
import { auth } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const db = getFirestore()
const router = useRouter()
const userEmail = ref('')
const searchQuery = ref('')
const selectedScoreType = ref('lab')
const studentsData = ref([])
const isLoading = ref(false)
const selectedSection = ref('')
const selectedMajor = ref('')

const labHeaders = Array.from({ length: 15 }, (_, i) => (i + 1).toString())
const assignmentHeaders = Array.from({ length: 13 }, (_, i) => (i + 1).toString())
const attendanceHeaders = Array.from({ length: 15 }, (_, i) => (i + 1).toString())


async function fetchStudentsData() {
  try {
    isLoading.value = true
    const querySnapshot = await getDocs(collection(db, 'students'))
    studentsData.value = querySnapshot.docs.map(doc => {
      const data = doc.data()
      let firstName = '', lastName = ''
      if (data.name) {
        const nameParts = data.name.split(' ')
        firstName = nameParts[0]
        lastName = nameParts.slice(1).join(' ')
      }
      
      // **CHANGED**: Normalize scores to extract only the numeric score value.
      const labScores = {}
      if (data.scores && data.scores.lab) {
        Object.entries(data.scores.lab).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'score')) {
            labScores[key] = value.score; // Extract score from object
          } else if (typeof value === 'number') {
            labScores[key] = value; // Handle old data format
          }
        })
      }

      const assignmentScores = {}
      if (data.scores && data.scores.assignment) {
        Object.entries(data.scores.assignment).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'score')) {
            assignmentScores[key] = value.score; // Extract score from object
          } else if (typeof value === 'number') {
            assignmentScores[key] = value; // Handle old data format
          }
        })
      }

      let specialScoreValue = null;
      const specialData = data.scores?.special;
      if (typeof specialData === 'object' && specialData !== null && Object.prototype.hasOwnProperty.call(specialData, 'score')) {
        specialScoreValue = specialData.score; // Extract score from object
      } else if (typeof specialData === 'number') {
        specialScoreValue = specialData; // Handle old data format
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
        specialScore: specialScoreValue, // Use the extracted numeric value
        attendanceData: {}
      }
    })
    await fetchAttendanceData()
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลนักศึกษาได้: ' + error.message })
  } finally {
    isLoading.value = false
  }
}

// ... ส่วนที่เหลือของ script ไม่ต้องแก้ไข ...
// The rest of your script (fetchAttendanceData, computed properties, helper functions, exportToExcel, etc.)
// can remain the same because they now receive the data in the simple numeric format they expect.

async function fetchAttendanceData() {
  try {
    const sessionSnapshot = await getDocs(collection(db, 'attendance_sessions'))
    const sessionMap = {}
    sessionSnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.week) {
        sessionMap[doc.id] = data.week
      }
    })

    const querySnapshot = await getDocs(collection(db, 'attendance_records'))
    const attendanceMap = {}
    querySnapshot.docs.forEach(doc => {
      const data = doc.data()
      if (data.studentId && (data.sessionId || typeof data.sessionNumber !== 'undefined')) {
        if (!attendanceMap[data.studentId]) {
          attendanceMap[data.studentId] = {}
        }
        let weekKey = data.sessionNumber;
        if (data.sessionId && sessionMap[data.sessionId]) {
          weekKey = sessionMap[data.sessionId];
        }

        if (weekKey && attendanceHeaders.includes(String(weekKey))) {
          attendanceMap[data.studentId][String(weekKey)] =
            typeof data.score !== "undefined" && data.score !== null ? data.score : 1
        }
      }
    })
    studentsData.value.forEach(student => {
      student.attendanceData = attendanceMap[student.studentId] || {}
    })
  } catch (error) {
    console.error("Error fetching attendance data:", error)
  }
}

const availableSections = computed(() => {
  if (!studentsData.value || studentsData.value.length === 0) return []
  const sections = new Set(studentsData.value.map(student => student.section).filter(section => section))
  return Array.from(sections).sort((a, b) => {
    const numA = parseInt(a, 10)
    const numB = parseInt(b, 10)
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB
    }
    return a.localeCompare(b)
  })
})

const availableMajors = computed(() => {
  if (!studentsData.value || studentsData.value.length === 0) return [];
  const majors = new Set(studentsData.value.map(student => student.major).filter(major => major));
  return Array.from(majors).sort();
});

const filteredStudents = computed(() => {
  let results = studentsData.value
  if (selectedSection.value) {
    results = results.filter(student => student.section === selectedSection.value)
  }
  if (selectedMajor.value) {
    results = results.filter(student => student.major === selectedMajor.value);
  }
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    results = results.filter(student =>
      student.studentId.toLowerCase().includes(query) ||
      student.firstName.toLowerCase().includes(query) ||
      student.lastName.toLowerCase().includes(query) ||
      student.name.toLowerCase().includes(query) ||
      (student.program && student.program.toLowerCase().includes(query)) ||
      (student.major && student.major.toLowerCase().includes(query)) ||
      (student.section && student.section.toLowerCase().includes(query))
    )
  }
  return results
})

function clearFilters() {
  searchQuery.value = ''
  selectedSection.value = ''
  selectedMajor.value = ''
}

function getLabScore(student, labNumber) {
  return student.labScores[String(labNumber)] !== undefined ? student.labScores[String(labNumber)] : '-'
}
function getAssignmentScore(student, assignmentNumber) {
  return student.assignmentScores[String(assignmentNumber)] !== undefined ? student.assignmentScores[String(assignmentNumber)] : '-'
}
function getAttendanceStatus(student, sessionNumber) {
  const sNum = String(sessionNumber)
  if (!(sNum in student.attendanceData)) return '-'
  const value = student.attendanceData[sNum]
  if (value === 1) return '1'
  if (value === 0.5) return '0.5'
  if (value === 0) return '0'
  return value
}
function calculateTotalLabScore(student) {
  if (!student.labScores || Object.keys(student.labScores).length === 0) return '-'
  let total = 0
  let hasNumericScore = false
  Object.values(student.labScores).forEach(score => {
    if (typeof score === 'number') {
      total += score
      hasNumericScore = true
    }
  })
  return hasNumericScore ? total : '-'
}
function calculateTotalAssignmentScore(student) {
  if (!student.assignmentScores || Object.keys(student.assignmentScores).length === 0) return '-'
  let total = 0
  let hasNumericScore = false
  Object.values(student.assignmentScores).forEach(score => {
    if (typeof score === 'number') {
      total += score
      hasNumericScore = true
    }
  })
  return hasNumericScore ? total : '-'
}
function calculateTotalAttendance(student) {
  const arr = Object.values(student.attendanceData)
  if (arr.length === 0) return '-'
  return arr.reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0)
}

function exportToExcel() {
  const wb = XLSX.utils.book_new()
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
  const studentsToExport = filteredStudents.value

  if (studentsToExport.length === 0) {
    Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูล', text: 'ไม่พบข้อมูลนักศึกษาตามตัวกรองปัจจุบันสำหรับส่งออก', timer: 3000 })
    return
  }
  
  const commonInitialCols = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ', 'สาขา', 'Sec'];
  const commonInitialColsSpan = commonInitialCols.length;

  if (selectedScoreType.value === 'lab') {
    const headerRow1 = [...commonInitialCols, ...Array(labHeaders.length).fill('คะแนนแลป'), 'คะแนนพิเศษ', 'รวม']
    const headerRow2 = [...Array(commonInitialColsSpan).fill(''), ...labHeaders, '', '']
    const data = studentsToExport.map((student, idx) => [
      idx + 1,
      student.studentId,
      `${student.firstName} ${student.lastName}`,
      student.major,
      student.section,
      ...labHeaders.map(i => getLabScore(student, i)),
      student.specialScore ?? '-',
      calculateTotalLabScore(student)
    ])
    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...data])
    const merges = [ { s: { r: 0, c: commonInitialColsSpan }, e: { r: 0, c: commonInitialColsSpan + labHeaders.length - 1 } } ];
    for (let i = 0; i < commonInitialColsSpan; i++) { merges.push({ s: { r: 0, c: i }, e: { r: 1, c: i } }); }
    merges.push({ s: { r: 0, c: commonInitialColsSpan + labHeaders.length }, e: { r: 1, c: commonInitialColsSpan + labHeaders.length } });
    merges.push({ s: { r: 0, c: commonInitialColsSpan + labHeaders.length + 1 }, e: { r: 1, c: commonInitialColsSpan + labHeaders.length + 1 } });
    ws['!merges'] = merges;
    XLSX.utils.book_append_sheet(wb, ws, 'Lab Scores')
    XLSX.writeFile(wb, `คะแนนLab_${dateStr}.xlsx`)
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ!', text: 'ไฟล์คะแนน Lab ได้ถูกดาวน์โหลดแล้ว', timer: 2500, showConfirmButton: false })
    return
  }
  if (selectedScoreType.value === 'assignment') {
    const headerRow1 = [...commonInitialCols, ...Array(assignmentHeaders.length).fill('Assignment'), 'รวม']
    const headerRow2 = [...Array(commonInitialColsSpan).fill(''), ...assignmentHeaders, '']
    const data = studentsToExport.map((student, idx) => [
      idx + 1,
      student.studentId,
      `${student.firstName} ${student.lastName}`,
      student.major,
      student.section,
      ...assignmentHeaders.map(i => getAssignmentScore(student, i)),
      calculateTotalAssignmentScore(student)
    ])
    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...data])
    const merges = [ { s: { r: 0, c: commonInitialColsSpan }, e: { r: 0, c: commonInitialColsSpan + assignmentHeaders.length - 1 } } ];
    for (let i = 0; i < commonInitialColsSpan; i++) { merges.push({ s: { r: 0, c: i }, e: { r: 1, c: i } }); }
    merges.push({ s: { r: 0, c: commonInitialColsSpan + assignmentHeaders.length }, e: { r: 1, c: commonInitialColsSpan + assignmentHeaders.length } });
    ws['!merges'] = merges;
    XLSX.utils.book_append_sheet(wb, ws, 'Assignment Scores')
    XLSX.writeFile(wb, `คะแนนAssignment_${dateStr}.xlsx`)
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ!', text: 'ไฟล์คะแนน Assignment ได้ถูกดาวน์โหลดแล้ว', timer: 2500, showConfirmButton: false })
    return
  }
  if (selectedScoreType.value === 'attendance') {
    const headerRow1 = [...commonInitialCols, ...Array(attendanceHeaders.length).fill('เช็คชื่อ'), 'รวม']
    const headerRow2 = [...Array(commonInitialColsSpan).fill(''), ...attendanceHeaders, '']
    const data = studentsToExport.map((student, idx) => [
      idx + 1,
      student.studentId,
      `${student.firstName} ${student.lastName}`,
      student.major,
      student.section,
      ...attendanceHeaders.map(i => {
        const val = getAttendanceStatus(student, i)
        return val === '-' ? '' : val
      }),
      calculateTotalAttendance(student)
    ])
    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...data])
    const merges = [ { s: { r: 0, c: commonInitialColsSpan }, e: { r: 0, c: commonInitialColsSpan + attendanceHeaders.length - 1 } } ];
    for (let i = 0; i < commonInitialColsSpan; i++) { merges.push({ s: { r: 0, c: i }, e: { r: 1, c: i } }); }
    merges.push({ s: { r: 0, c: commonInitialColsSpan + attendanceHeaders.length }, e: { r: 1, c: commonInitialColsSpan + attendanceHeaders.length } });
    ws['!merges'] = merges;
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Records')
    XLSX.writeFile(wb, `รายงานเช็คชื่อ_${dateStr}.xlsx`)
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ!', text: 'ไฟล์รายงานการเช็คชื่อได้ถูกดาวน์โหลดแล้ว', timer: 2500, showConfirmButton: false })
    return
  }
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
    confirmButtonColor: '#d33',
    cancelButtonColor: '#909090',
  })
  if (result.isConfirmed) {
    try {
      await auth.signOut()
      router.push('/')
    } catch (error) {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถออกจากระบบได้', 'error')
    }
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 text-gray-800">
    <!-- Header -->
      <header class="bg-white shadow-lg">
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


    <!-- Filter & selector -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="bg-white shadow-xl rounded-lg p-6">

        <!-- Top -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 class="text-xl sm:text-2xl font-bold text-gray-800">ตารางสรุปผลคะแนนนักศึกษา</h2>
          <button @click="exportToExcel" :disabled="isLoading || filteredStudents.length === 0"
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300 flex items-center text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            ส่งออกเป็น Excel
          </button>
        </div>
        <!-- Selector -->
        <div class="mb-6 bg-gray-50 rounded-lg shadow-inner p-4">
          <h3 class="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4">เลือกประเภทข้อมูลที่ต้องการแสดง:</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <button @click="selectedScoreType = 'lab'" :class="[
              'p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 ease-in-out transform hover:scale-105',
              selectedScoreType === 'lab'
                ? 'border-blue-500 bg-blue-100 text-blue-700 shadow-md ring-2 ring-blue-500 ring-offset-1'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 text-gray-700'
            ]">
              <div class="text-center">
                <div class="text-sm sm:text-lg font-semibold">คะแนน Lab</div>
                <div class="text-xs sm:text-sm text-gray-500">ปฏิบัติการ 1-15</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'assignment'" :class="[
              'p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 ease-in-out transform hover:scale-105',
              selectedScoreType === 'assignment'
                ? 'border-green-500 bg-green-100 text-green-700 shadow-md ring-2 ring-green-500 ring-offset-1'
                : 'border-gray-300 bg-white hover:border-green-400 hover:bg-green-50 text-gray-700'
            ]">
              <div class="text-center">
                <div class="text-sm sm:text-lg font-semibold">คะแนน Assignment</div>
                <div class="text-xs sm:text-sm text-gray-500">งานที่มอบหมาย 1-13</div>
              </div>
            </button>
            <button @click="selectedScoreType = 'attendance'" :class="[
              'p-3 sm:p-4 rounded-lg border-2 transition-all duration-200 ease-in-out transform hover:scale-105',
              selectedScoreType === 'attendance'
                ? 'border-purple-500 bg-purple-100 text-purple-700 shadow-md ring-2 ring-purple-500 ring-offset-1'
                : 'border-gray-300 bg-white hover:border-purple-400 hover:bg-purple-50 text-gray-700'
            ]">
              <div class="text-center">
                <div class="text-sm sm:text-lg font-semibold">การเข้าชั้นเรียน</div>
                <div class="text-xs sm:text-sm text-gray-500">15 ครั้ง</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Filters -->
        <div class="mb-6 bg-gray-50 rounded-lg shadow-inner p-4">
          <div class="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
            <div class="flex-grow w-full sm:w-auto">
              <label for="searchQueryInput"
                class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">ค้นหา:</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input v-model="searchQuery" id="searchQueryInput" type="text"
                  class="block w-full pl-9 sm:pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base"
                  placeholder="รหัสนักศึกษา, ชื่อ, สาขา" />
              </div>
            </div>
            <div class="flex-shrink-0 w-full sm:w-auto sm:min-w-[150px]">
              <label for="majorFilter" class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">สาขาวิชา:</label>
              <select id="majorFilter" v-model="selectedMajor"
                class="block w-full pl-3 pr-10 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base">
                <option value="">ทุกสาขาวิชา</option>
                <option v-for="major in availableMajors" :key="major" :value="major">{{ major }}</option>
              </select>
            </div>
            <div class="flex-shrink-0 w-full sm:w-auto sm:min-w-[150px]">
              <label for="sectionFilter" class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">กลุ่มเรียน
                (Sec):</label>
              <select id="sectionFilter" v-model="selectedSection"
                class="block w-full pl-3 pr-10 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base">
                <option value="">ทุกกลุ่มเรียน</option>
                <option v-for="section in availableSections" :key="section" :value="section">{{ section }}</option>
              </select>
            </div>
            <div class="flex-shrink-0 w-full sm:w-auto" v-if="searchQuery || selectedSection || selectedMajor">
              <button @click="clearFilters"
                class="w-full sm:w-auto px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-300 flex items-center justify-center text-sm sm:text-base">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
                ล้างตัวกรอง
              </button>
            </div>
          </div>
        </div>

        <div v-if="isLoading" class="flex flex-col justify-center items-center py-10 text-gray-600">
          <div class="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-green-600 mb-3"></div>
          <span class="text-lg font-medium">กำลังโหลดข้อมูลนักศึกษา...</span>
          <span class="text-sm">กรุณารอสักครู่</span>
        </div>

        <div v-else class="overflow-x-auto bg-gray-50 rounded-lg shadow-md p-0.5 sm:p-2">

          <table v-if="selectedScoreType === 'lab'"
            class="min-w-full border border-gray-300 bg-white text-xs sm:text-sm">
            <thead class="bg-blue-50">
              <tr>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">ลำดับ
                </td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">
                  รหัสนักศึกษา</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-left align-middle">
                  ชื่อ-นามสกุล</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">สาขา
                </td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">Sec</td>
                <td :colspan="labHeaders.length"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-blue-100 text-blue-700 font-semibold text-center align-middle">
                  คะแนนแลป
                  ({{ labHeaders.length }} ครั้ง)</td>
                <td rowspan="2"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-blue-50 text-blue-700 font-semibold text-center align-middle">
                  รวมแลป
                </td>
                <td rowspan="2"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-blue-50 text-blue-700 font-semibold text-center align-middle">
                  คะแนนพิเศษ</td>

              </tr>
              <tr class="bg-blue-50">
                <td v-for="header in labHeaders" :key="'lab-header-' + header"
                  class="px-1.5 py-1 sm:px-2 sm:py-2 border font-medium text-center align-middle">{{ header }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, idx) in filteredStudents" :key="'lab-student-' + student.id"
                :class="idx % 2 === 1 ? 'bg-blue-50/50' : 'bg-white'">
                <td class="px-2 py-1.5 border text-center align-middle">{{ idx + 1 }}</td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.studentId }}</td>
                <td class="px-2 py-1.5 border text-left align-middle">{{ student.firstName }} {{ student.lastName }}
                </td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.major }}</td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.section }}</td>
                <td v-for="labNum in labHeaders" :key="'lab-' + student.id + '-' + labNum"
                  class="px-1.5 py-1 border text-center align-middle">
                  <span :class="getLabScore(student, labNum) !== '-' ? 'font-bold text-blue-700' : 'text-gray-500'">
                    {{ getLabScore(student, labNum) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 border text-center align-middle">
                  <span :class="calculateTotalLabScore(student) !== '-' ? 'font-bold text-blue-700' : 'text-gray-500'">
                    {{ calculateTotalLabScore(student) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 border font-medium text-indigo-600 text-center align-middle">
                  {{ student.specialScore ?? '-' }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- ======= ตาราง Assignment ======= -->
          <table v-if="selectedScoreType === 'assignment'"
            class="min-w-full border border-gray-300 bg-white text-xs sm:text-sm">
            <thead class="bg-green-50">
              <tr>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">ลำดับ
                </td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">
                  รหัสนักศึกษา</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-left align-middle">
                  ชื่อ-นามสกุล</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">สาขา
                </td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">Sec</td>
                <td :colspan="assignmentHeaders.length"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-green-100 text-green-700 font-semibold text-center align-middle">
                  Assignment ({{ assignmentHeaders.length }} งาน)</td>
                <td rowspan="2"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-green-50 text-green-700 font-semibold text-center align-middle">
                  รวม
                </td>
              </tr>
              <tr class="bg-green-50">
                <td v-for="header in assignmentHeaders" :key="'ass-header-' + header"
                  class="px-1.5 py-1 sm:px-2 sm:py-2 border font-medium text-center align-middle">{{ header }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, idx) in filteredStudents" :key="'ass-student-' + student.id"
                :class="idx % 2 === 1 ? 'bg-green-50/50' : 'bg-white'">
                <td class="px-2 py-1.5 border text-center align-middle">{{ idx + 1 }}</td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.studentId }}</td>
                <td class="px-2 py-1.5 border text-left align-middle">{{ student.firstName }} {{ student.lastName }}
                </td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.major }}</td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.section }}</td>
                <td v-for="assNum in assignmentHeaders" :key="'ass-' + student.id + '-' + assNum"
                  class="px-1.5 py-1 border text-center align-middle">
                  <span
                    :class="getAssignmentScore(student, assNum) !== '-' ? 'font-bold text-green-700' : 'text-gray-500'">
                    {{ getAssignmentScore(student, assNum) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 border font-medium text-green-700 text-center align-middle">
                  {{ calculateTotalAssignmentScore(student) }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- ======= ตารางเช็คชื่อ (Attendance) ======= -->
          <table v-if="selectedScoreType === 'attendance'"
            class="min-w-full border border-gray-300 bg-white text-xs sm:text-sm">
            <thead class="bg-purple-50">
              <tr>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">ลำดับ
                </td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">
                  รหัสนักศึกษา</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-left align-middle">
                  ชื่อ-นามสกุล</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">สาขา
                </td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border font-semibold text-center align-middle">Sec</td>
                <td :colspan="attendanceHeaders.length"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-purple-100 text-purple-700 font-semibold text-center align-middle">
                  การเข้าชั้นเรียน ({{ attendanceHeaders.length }} ครั้ง)</td>
                <td rowspan="2"
                  class="px-2 py-2 sm:px-3 sm:py-3 border bg-purple-50 text-purple-700 font-semibold text-center align-middle">
                  รวม
                </td>
              </tr>
              <tr class="bg-purple-50">
                <td v-for="header in attendanceHeaders" :key="'att-header-' + header"
                  class="px-1.5 py-1 sm:px-2 sm:py-2 border font-medium text-center align-middle">{{ header }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, idx) in filteredStudents" :key="'att-student-' + student.id"
                :class="idx % 2 === 1 ? 'bg-purple-50/50' : 'bg-white'">
                <td class="px-2 py-1.5 border text-center align-middle">{{ idx + 1 }}</td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.studentId }}</td>
                <td class="px-2 py-1.5 border text-left align-middle">{{ student.firstName }} {{ student.lastName }}
                </td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.major }}</td>
                <td class="px-2 py-1.5 border text-center align-middle">{{ student.section }}</td>
                <td v-for="sessionNum in attendanceHeaders" :key="'att-' + student.id + '-' + sessionNum"
                  class="px-1.5 py-1 border text-center align-middle">
                  <!-- Attendance display only, no editing -->
                  <span :class="{
                    'font-bold text-purple-700': getAttendanceStatus(student, sessionNum) === '1',
                    'font-bold text-orange-600': getAttendanceStatus(student, sessionNum) === '0.5',
                    'text-red-400': getAttendanceStatus(student, sessionNum) === '0',
                    'text-gray-400': getAttendanceStatus(student, sessionNum) === '-'
                  }">
                    {{ getAttendanceStatus(student, sessionNum) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 border font-medium text-purple-700 text-center align-middle">
                  {{ calculateTotalAttendance(student) }}
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="!isLoading && filteredStudents.length === 0" class="py-8 text-center text-gray-500">
            
            <h3 class="mt-2 text-lg font-medium text-gray-900">ไม่พบข้อมูลนักศึกษา</h3>
            <p class="mt-1 text-sm text-gray-500">กรุณาปรับเงื่อนไขการค้นหาหรือตัวกรอง
              หรือตรวจสอบว่ามีข้อมูลในระบบหรือไม่</p>
          </div>
        </div>
      </div>
    </main>
    <footer class="text-center py-6 text-xs text-gray-500">
        &copy; 2025 CP352201 & SC362201 Web Design Technologies. <br>
        Developed by suthinanll
    </footer>
  </div>
</template>

<style scoped lang="postcss">
td,
th {
  vertical-align: middle;
}

.overflow-x-auto {
  -webkit-overflow-scrolling: touch;
}

tbody tr:hover {
  background-color: rgba(0, 0, 0, 0.025);
}

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