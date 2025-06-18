<!-- eslint-disable no-unused-vars -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

import { auth } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const router = useRouter()
const userEmail = ref('')
const db = getFirestore()

const searchQuery = ref('')
const selectedScoreType = ref('lab')
const studentsData = ref([])
const isLoading = ref(false)
// --- MODIFIED: State for section filter ---
const selectedSection = ref('') // '' means all sections

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
        section: data.section || '', // Ensure section is present
        program: data.program || '',
        labScores,
        assignmentScores,
        specialScore: data.scores?.special,
        attendanceData: {}
      }
    })
    await fetchAttendanceData()
  } catch (error) {
    console.error("Error fetching student data:", error);
    Swal.fire({
      icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลนักศึกษาได้: ' + error.message
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
        if (data.sessionNumber != null) {
          attendanceMap[data.studentId][String(data.sessionNumber)] = true
        }
      }
    })
    studentsData.value.forEach(student => {
      student.attendanceData = attendanceMap[student.studentId] || {}
    })
  } catch (error) {
    console.error("Error fetching attendance data:", error);
  }
}

// --- MODIFIED: Computed property for available sections ---
const availableSections = computed(() => {
  if (!studentsData.value || studentsData.value.length === 0) {
    return [];
  }
  const sections = new Set(studentsData.value.map(student => student.section).filter(section => section)); // Filter out empty/null sections
  return Array.from(sections).sort((a, b) => { // Custom sort for sections like '01', '02', '10'
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b); // Fallback for non-numeric sections
  });
});

// --- MODIFIED: filteredStudents to include section filter ---
const filteredStudents = computed(() => {
  let results = studentsData.value;

  // Filter by selected section
  if (selectedSection.value) { // if a section is selected (not empty string)
    results = results.filter(student => student.section === selectedSection.value);
  }

  // Filter by search query (applied after section filter or independently)
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    results = results.filter(student =>
      student.studentId.toLowerCase().includes(query) ||
      student.firstName.toLowerCase().includes(query) ||
      student.lastName.toLowerCase().includes(query) ||
      student.name.toLowerCase().includes(query) ||
      (student.program && student.program.toLowerCase().includes(query)) ||
      (student.major && student.major.toLowerCase().includes(query)) || // Keep major search if needed
      (student.section && student.section.toLowerCase().includes(query)) // Allow searching section via text input as well
    );
  }
  return results;
});

// --- MODIFIED: clearFilters function ---
function clearFilters() {
  searchQuery.value = '';
  selectedSection.value = ''; // Reset selected section
}

function getLabScore(student, labNumber) {
  return student.labScores[String(labNumber)] !== undefined ? student.labScores[String(labNumber)] : '-';
}

function getAssignmentScore(student, assignmentNumber) {
  return student.assignmentScores[String(assignmentNumber)] !== undefined ? student.assignmentScores[String(assignmentNumber)] : '-';
}

function getAttendanceStatus(student, sessionNumber) {
  return student.attendanceData[String(sessionNumber)] ? '✓' : '-';
}

function calculateTotalLabScore(student) {
  if (!student.labScores || Object.keys(student.labScores).length === 0) {
    return '-';
  }
  let total = 0;
  let hasNumericScore = false;
  Object.values(student.labScores).forEach(score => {
    if (typeof score === 'number') {
      total += score;
      hasNumericScore = true;
    }
  });
  return hasNumericScore ? total : '-';
}

function calculateTotalAssignmentScore(student) {
  if (!student.assignmentScores || Object.keys(student.assignmentScores).length === 0) return '-';
  let total = 0;
  let hasNumericScore = false;
  Object.values(student.assignmentScores).forEach(score => {
    if (typeof score === 'number') {
      total += score;
      hasNumericScore = true;
    }
  });
  return hasNumericScore ? total : '-';
}

function calculateTotalAttendance(student) {
  return Object.keys(student.attendanceData).length > 0 ? Object.keys(student.attendanceData).length : '-';
}

const labHeaders = Array.from({ length: 16 }, (_, i) => (i + 1).toString());
const assignmentHeaders = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
const attendanceHeaders = Array.from({ length: 16 }, (_, i) => (i + 1).toString());

function exportToExcel() {
  const wb = XLSX.utils.book_new();
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  const studentsToExport = filteredStudents.value;

  if (studentsToExport.length === 0) {
    Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูล', text: 'ไม่พบข้อมูลนักศึกษาตามตัวกรองปัจจุบันสำหรับส่งออก', timer: 3000 });
    return;
  }

  if (selectedScoreType.value === 'lab') {
    const headerRow1 = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ', 'Sec', ...Array(labHeaders.length).fill('คะแนนแลป'), 'คะแนนพิเศษ', 'รวม'];
    const headerRow2 = ['', '', '', '', ...labHeaders, '', ''];

    const data = studentsToExport.map((student, idx) => [
      idx + 1,
      student.studentId,
      `${student.firstName} ${student.lastName}`,
      student.section,
      ...labHeaders.map(i => getLabScore(student, i)),
      student.specialScore ?? '-',
      calculateTotalLabScore(student)
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...data]);
    ws['!merges'] = [
      { s: { r: 0, c: 4 }, e: { r: 0, c: 4 + labHeaders.length -1 } },
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
      { s: { r: 0, c: 4 + labHeaders.length }, e: { r: 1, c: 4 + labHeaders.length } },
      { s: { r: 0, c: 4 + labHeaders.length + 1 }, e: { r: 1, c: 4 + labHeaders.length + 1 } }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Lab Scores');
    XLSX.writeFile(wb, `คะแนนLab_${dateStr}.xlsx`);
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ!', text: 'ไฟล์คะแนน Lab ได้ถูกดาวน์โหลดแล้ว', timer: 2500, showConfirmButton: false });
    return;
  }

  if (selectedScoreType.value === 'assignment') {
    const headerRow1 = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ', 'Sec', ...Array(assignmentHeaders.length).fill('Assignment'), 'รวม'];
    const headerRow2 = ['', '', '', '', ...assignmentHeaders, ''];
    const data = studentsToExport.map((student, idx) => [
      idx + 1,
      student.studentId,
      `${student.firstName} ${student.lastName}`,
      student.section,
      ...assignmentHeaders.map(i => getAssignmentScore(student, i)),
      calculateTotalAssignmentScore(student)
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...data]);
    ws['!merges'] = [
      { s: { r: 0, c: 4 }, e: { r: 0, c: 4 + assignmentHeaders.length - 1 } },
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
      { s: { r: 0, c: 4 + assignmentHeaders.length }, e: { r: 1, c: 4 + assignmentHeaders.length } },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Assignment Scores');
    XLSX.writeFile(wb, `คะแนนAssignment_${dateStr}.xlsx`);
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ!', text: 'ไฟล์คะแนน Assignment ได้ถูกดาวน์โหลดแล้ว', timer: 2500, showConfirmButton: false });
    return;
  }

  if (selectedScoreType.value === 'attendance') {
    const headerRow1 = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ', 'Sec', ...Array(attendanceHeaders.length).fill('เช็คชื่อ'), 'รวม'];
    const headerRow2 = ['', '', '', '', ...attendanceHeaders, ''];
    const data = studentsToExport.map((student, idx) => [
      idx + 1,
      student.studentId,
      `${student.firstName} ${student.lastName}`,
      student.section,
      ...attendanceHeaders.map(i => getAttendanceStatus(student, i)),
      calculateTotalAttendance(student)
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...data]);
    ws['!merges'] = [
      { s: { r: 0, c: 4 }, e: { r: 0, c: 4 + attendanceHeaders.length -1 } },
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
      { s: { r: 0, c: 4 + attendanceHeaders.length }, e: { r: 1, c: 4 + attendanceHeaders.length } },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance Records');
    XLSX.writeFile(wb, `รายงานเช็คชื่อ_${dateStr}.xlsx`);
    Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ!', text: 'ไฟล์รายงานการเช็คชื่อได้ถูกดาวน์โหลดแล้ว', timer: 2500, showConfirmButton: false });
    return;
  }
}

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email;
      fetchStudentsData();
    } else {
      router.push('/');
    }
  });
});

async function logout() {
  const result = await Swal.fire({
    title: 'ต้องการออกจากระบบจริงหรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
  });
  if (result.isConfirmed) {
    try {
      await auth.signOut();
      router.push('/');
    } catch (error) {
      console.error("Logout error:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถออกจากระบบได้', 'error');
    }
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 text-gray-800">
    <!-- Header -->
    <header class="bg-white shadow-lg sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-6">
          <router-link to="/admin" class="flex-shrink-0 block">
              <h1 class="text-3xl font-bold text-green-700">
                ระบบเช็คชื่อและให้คะแนน
              </h1>
              <h1 class="text-xl text-gray-500">
                CP352201 & SC362201 Web Design Technologies
              </h1>
            </router-link>
          <div class="flex items-center space-x-3 sm:space-x-4">
            <div class="text-gray-700 text-xs sm:text-sm">
              <span>สวัสดี, </span>
              <span class="font-semibold">{{ userEmail }}</span>
            </div>
            <button @click="logout"
              class="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-300 font-medium text-xs sm:text-sm">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="bg-white shadow-xl rounded-lg p-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 class="text-xl sm:text-2xl font-bold text-gray-800">ตารางสรุปผลคะแนนนักศึกษา</h2>
          <button @click="exportToExcel" :disabled="isLoading || filteredStudents.length === 0"
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300 flex items-center text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
              </path>
            </svg>
            ส่งออกเป็น Excel
          </button>
        </div>

        <!-- Score Type Selector -->
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
                <div class="text-xs sm:text-sm text-gray-500">ปฏิบัติการ 1-16</div>
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
                <div class="text-xs sm:text-sm text-gray-500">งานที่มอบหมาย 1-12</div>
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
                <div class="text-xs sm:text-sm text-gray-500">16 ครั้ง</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Filters Section -->
        <div class="mb-6 bg-gray-50 rounded-lg shadow-inner p-4">
          <div class="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
            <!-- Search Input -->
            <div class="flex-grow w-full sm:w-auto">
              <label for="searchQueryInput"
                class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">ค้นหา:</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
                <input v-model="searchQuery" id="searchQueryInput" type="text"
                  class="block w-full pl-9 sm:pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base"
                  placeholder="รหัสนักศึกษา, ชื่อ, สาขา">
              </div>
            </div>

            <!-- Section Filter Dropdown --- MODIFIED --- -->
            <div class="flex-shrink-0 w-full sm:w-auto sm:min-w-[150px]"> <!-- Adjusted min-width -->
              <label for="sectionFilter" class="block text-xs sm:text-sm font-medium text-gray-700 mb-1">กลุ่มเรียน (Sec):</label>
              <select id="sectionFilter" v-model="selectedSection"
                class="block w-full pl-3 pr-10 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base">
                <option value="">ทุกกลุ่มเรียน</option>
                <option v-for="section in availableSections" :key="section" :value="section">
                  {{ section }}
                </option>
              </select>
            </div>

            <!-- Clear Filters Button -->
            <div class="flex-shrink-0 w-full sm:w-auto" v-if="searchQuery || selectedSection">
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
          <!-- Lab Table -->
          <table v-if="selectedScoreType === 'lab'"
            class="min-w-full border border-gray-300 bg-white text-xs sm:text-sm">
            <thead class="bg-blue-50">
              <tr>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">ลำดับ</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">รหัสนักศึกษา</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-left">ชื่อ-นามสกุล</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">Sec</td>
                <td :colspan="labHeaders.length" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-blue-100 text-blue-700 font-semibold text-center">คะแนนแลป ({{ labHeaders.length }} ครั้ง)</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-blue-100 text-blue-700 font-semibold text-center">คะแนนพิเศษ</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-blue-100 text-blue-700 font-semibold text-center">รวมแลป</td>
              </tr>
              <tr class="bg-blue-50">
                <td v-for="header in labHeaders" :key="'lab-header-' + header" class="px-1.5 py-1 sm:px-2 sm:py-2 border border-gray-300 font-medium text-center">{{ header }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, idx) in filteredStudents" :key="'lab-student-' + student.id"
                :class="idx % 2 === 1 ? 'bg-blue-50/50' : 'bg-white'">
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ idx + 1 }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ student.studentId }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-left">{{ student.firstName }} {{ student.lastName }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ student.section }}</td>
                <td v-for="labNum in labHeaders" :key="'lab-' + student.id + '-' + labNum" class="px-1.5 py-1 sm:px-2 sm:py-2 border border-gray-200 text-center">
                  <span :class="getLabScore(student, labNum) !== '-' ? 'font-bold text-blue-700' : 'text-gray-500'">
                    {{ getLabScore(student, labNum) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">
                    <span :class="student.specialScore != null && student.specialScore !== '' ? 'font-bold text-indigo-600' : 'text-gray-500'">
                        {{ student.specialScore ?? '-' }}
                    </span>
                </td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 font-medium text-blue-700 text-center">
                  {{ calculateTotalLabScore(student) }}
                </td>
              </tr>
            </tbody>
          </table>

          <table v-if="selectedScoreType === 'assignment'"
            class="min-w-full border border-gray-300 bg-white text-xs sm:text-sm">
            <thead class="bg-green-50">
              <tr>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">ลำดับ</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">รหัสนักศึกษา</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-left">ชื่อ-นามสกุล</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">Sec</td>
                <td :colspan="assignmentHeaders.length" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-green-100 text-green-700 font-semibold text-center">Assignment ({{ assignmentHeaders.length }} งาน)</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-green-100 text-green-700 font-semibold text-center">รวม</td>
              </tr>
              <tr class="bg-green-50">
                <td v-for="header in assignmentHeaders" :key="'ass-header-' + header" class="px-1.5 py-1 sm:px-2 sm:py-2 border border-gray-300 font-medium text-center">{{ header }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, idx) in filteredStudents" :key="'ass-student-' + student.id"
                :class="idx % 2 === 1 ? 'bg-green-50/50' : 'bg-white'">
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ idx + 1 }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ student.studentId }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-left">{{ student.firstName }} {{ student.lastName }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ student.section }}</td>
                <td v-for="assNum in assignmentHeaders" :key="'ass-' + student.id + '-' + assNum" class="px-1.5 py-1 sm:px-2 sm:py-2 border border-gray-200 text-center">
                  <span :class="getAssignmentScore(student, assNum) !== '-' ? 'font-bold text-green-700' : 'text-gray-500'">
                    {{ getAssignmentScore(student, assNum) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 font-medium text-green-700 text-center">
                  {{ calculateTotalAssignmentScore(student) }}
                </td>
              </tr>
            </tbody>
          </table>

          <table v-if="selectedScoreType === 'attendance'"
            class="min-w-full border border-gray-300 bg-white text-xs sm:text-sm">
            <thead class="bg-purple-50">
              <tr>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">ลำดับ</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">รหัสนักศึกษา</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-left">ชื่อ-นามสกุล</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 font-semibold text-center">Sec</td>
                <td :colspan="attendanceHeaders.length" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-purple-100 text-purple-700 font-semibold text-center">การเข้าชั้นเรียน ({{ attendanceHeaders.length }} ครั้ง)</td>
                <td rowspan="2" class="px-2 py-2 sm:px-3 sm:py-3 border border-gray-300 bg-purple-100 text-purple-700 font-semibold text-center">รวม</td>
              </tr>
              <tr class="bg-purple-50">
                <td v-for="header in attendanceHeaders" :key="'att-header-' + header" class="px-1.5 py-1 sm:px-2 sm:py-2 border border-gray-300 font-medium text-center">{{ header }}</td>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, idx) in filteredStudents" :key="'att-student-' + student.id"
                :class="idx % 2 === 1 ? 'bg-purple-50/50' : 'bg-white'">
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ idx + 1 }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ student.studentId }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-left">{{ student.firstName }} {{ student.lastName }}</td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 text-center">{{ student.section }}</td>
                <td v-for="sessionNum in attendanceHeaders" :key="'att-' + student.id + '-' + sessionNum" class="px-1.5 py-1 sm:px-2 sm:py-2 border border-gray-200 text-center">
                  <span :class="getAttendanceStatus(student, sessionNum) === '✓' ? 'font-bold text-purple-700' : 'text-gray-400'">
                    {{ getAttendanceStatus(student, sessionNum) }}
                  </span>
                </td>
                <td class="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-200 font-medium text-purple-700 text-center">
                  {{ calculateTotalAttendance(student) }}
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="!isLoading && filteredStudents.length === 0" class="py-8 text-center text-gray-500">
            <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h3 class="mt-2 text-lg font-medium text-gray-900">ไม่พบข้อมูลนักศึกษา</h3>
            <p class="mt-1 text-sm text-gray-500">กรุณาปรับเงื่อนไขการค้นหาหรือตัวกรอง
              หรือตรวจสอบว่ามีข้อมูลในระบบหรือไม่</p>
          </div>
        </div>
      </div>
    </main>

    <footer class="text-center py-4 text-xs text-gray-500">
      &copy; {{ new Date().getFullYear() }} CP352201 & SC362201 Web Design Technologies
    </footer>

  </div>
</template>

<style scoped>
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
</style>