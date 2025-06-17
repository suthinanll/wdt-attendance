<!-- eslint-disable no-unused-vars -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import { auth } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'

// เพิ่ม Firestore imports
import {
  getFirestore,
  collection,
  getDocs
} from 'firebase/firestore'

const router = useRouter()
const userEmail = ref('')
const db = getFirestore() // Initialize Firestore

// ตัวแปรสำหรับการค้นหา
const searchQuery = ref('')
const selectedScoreType = ref('lab') // ค่าเริ่มต้นแสดงคะแนน lab
const activeTab = ref('scores') // สำหรับกรณีที่มีแท็บอื่นๆ

// ข้อมูลนักศึกษาและคะแนน
const studentsData = ref([])

// ฟังก์ชันดึงข้อมูลนักศึกษาและคะแนน
async function fetchStudentsData() {
  try {
    const querySnapshot = await getDocs(collection(db, 'students'));
    
    // สร้างอาร์เรย์ข้อมูลนักศึกษาพร้อมคะแนน
    studentsData.value = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // ประมวลผลข้อมูลคะแนน labs
      const labScores = {};
      if (data.scores && data.scores.lab) {
        Object.entries(data.scores.lab).forEach(([key, value]) => {
          // ตรวจสอบว่า key เป็นตัวเลขหรือไม่
          if (!isNaN(parseInt(key))) {
            labScores[key] = value;
          }
        });
      }
      
      // ประมวลผลข้อมูลคะแนน assignment
      const assignmentScores = {};
      if (data.scores && data.scores.assignment) {
        Object.entries(data.scores.assignment).forEach(([key, value]) => {
          if (!isNaN(parseInt(key))) {
            assignmentScores[key] = value;
          }
        });
      }
      
      // แยกชื่อและนามสกุลจากฟิลด์ name
      let firstName = '', lastName = '';
      if (data.name) {
        const nameParts = data.name.split(' ');
        if (nameParts.length >= 2) {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        } else {
          firstName = data.name;
        }
      }
      
      // สร้างและคืนค่าออบเจ็กต์ข้อมูลนักศึกษา
      return {
        id: doc.id,
        studentId: doc.id,
        firstName,
        lastName,
        major: data.major || '',
        section: data.section || '',
        labScores,
        assignmentScores,
        specialScore: data.scores?.special || 0,
        // ข้อมูลเช็คชื่อจะต้องดึงจาก collection attendance_records
        attendanceData: {}
      };
    });
    
    console.log('Fetched students data:', studentsData.value);
    
    // ดึงข้อมูลการเช็คชื่อเพิ่มเติม
    await fetchAttendanceData();
    
  } catch (error) {
    console.error('Error fetching students data:', error);
  }
}

// ฟังก์ชันดึงข้อมูลการเช็คชื่อ
async function fetchAttendanceData() {
  try {
    const querySnapshot = await getDocs(collection(db, 'attendance_records'));
    
    // สร้าง map ของข้อมูลการเช็คชื่อแยกตามรหัสนักศึกษา
    const attendanceMap = {};
    
    querySnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.studentId) {
        if (!attendanceMap[data.studentId]) {
          attendanceMap[data.studentId] = {};
        }
        
        // สมมติว่ามี sessionNumber หรือเลขครั้งที่เช็คชื่อ
        if (data.sessionNumber) {
          attendanceMap[data.studentId][data.sessionNumber] = true;
        }
      }
    });
    
    // อัปเดตข้อมูลการเช็คชื่อให้กับนักศึกษาแต่ละคน
    studentsData.value.forEach(student => {
      student.attendanceData = attendanceMap[student.studentId] || {};
    });
    
    console.log('Updated attendance data for students');
    
  } catch (error) {
    console.error('Error fetching attendance data:', error);
  }
}

// กรองข้อมูลนักศึกษาตามการค้นหา
const filteredStudents = computed(() => {
  if (!searchQuery.value) return studentsData.value;
  
  const query = searchQuery.value.toLowerCase();
  return studentsData.value.filter(student => 
    student.studentId.toLowerCase().includes(query) || 
    student.firstName.toLowerCase().includes(query) || 
    student.lastName.toLowerCase().includes(query) || 
    (student.major && student.major.toLowerCase().includes(query))
  );
});

// ล้างการค้นหา
function clearSearch() {
  searchQuery.value = '';
}

// ฟังก์ชันหาคะแนน Lab ของนักศึกษา
function getLabScore(student, labNumber) {
  return student.labScores[labNumber] !== undefined ? 
    student.labScores[labNumber] : '-';
}

// ฟังก์ชันหาคะแนน Assignment ของนักศึกษา
function getAssignmentScore(student, assignmentNumber) {
  return student.assignmentScores[assignmentNumber] !== undefined ? 
    student.assignmentScores[assignmentNumber] : '-';
}

// ฟังก์ชันหาข้อมูลการเช็คชื่อของนักศึกษา
function getAttendanceStatus(student, sessionNumber) {
  return student.attendanceData[sessionNumber] ? '✓' : '-';
}

// ฟังก์ชันคำนวณคะแนนรวม Lab
function calculateTotalLabScore(student) {
  let total = 0;
  if (student.labScores) {
    Object.values(student.labScores).forEach(score => {
      if (typeof score === 'number') {
        total += score;
      }
    });
  }
  return total;
}

// ฟังก์ชันคำนวณคะแนนรวม Assignment
function calculateTotalAssignmentScore(student) {
  let total = 0;
  if (student.assignmentScores) {
    Object.values(student.assignmentScores).forEach(score => {
      if (typeof score === 'number') {
        total += score;
      }
    });
  }
  return total;
}

// ฟังก์ชันคำนวณจำนวนครั้งที่เข้าเรียน
function calculateTotalAttendance(student) {
  return Object.keys(student.attendanceData).length;
}

// สร้าง array สำหรับหัวตาราง
const labHeaders = Array.from({ length: 15 }, (_, i) => `Lab ${i + 1}`);
const assignmentHeaders = Array.from({ length: 12 }, (_, i) => `Ass ${i + 1}`);
const attendanceHeaders = Array.from({ length: 16 }, (_, i) => `ครั้งที่ ${i + 1}`);

// ดึงข้อมูล user ที่ล็อกอินอยู่
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email;
      // เรียกใช้ฟังก์ชันดึงข้อมูลเมื่อ userEmail พร้อม
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
    confirmButtonColor: '#e53e3e',
    cancelButtonColor: '#909090',
  });

  if (result.isConfirmed) {
    await auth.signOut();
    router.push('/');
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
        <h2 class="text-2xl font-bold text-gray-800 mb-6">ตารางคะแนนรวม</h2>
        
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
        
        <!-- Score Table -->
        <div class="overflow-x-auto">
          <!-- Lab Scores Table -->
          <table v-if="selectedScoreType === 'lab'" class="min-w-full divide-y divide-gray-200 border">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r">
                  รหัสนักศึกษา
                </th>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-[120px] bg-gray-50 z-10 border-r">
                  ชื่อ-นามสกุล
                </th>
                <th v-for="(header, ) in labHeaders" :key="header" scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                  {{ header }}
                </th>
                <th scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  รวม
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="student in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-0 bg-white z-10 border-r">
                  {{ student.studentId }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-[120px] bg-white z-10 border-r min-w-[180px]">
                  {{ student.firstName }} {{ student.lastName }}
                </td>
                <td v-for="i in 15" :key="i" class="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-900 border-r">
                  {{ getLabScore(student, i.toString()) }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-center font-medium text-gray-900">
                  {{ calculateTotalLabScore(student) }}
                </td>
              </tr>
            </tbody>
          </table>
          
          <!-- Assignment Scores Table -->
          <table v-if="selectedScoreType === 'assignment'" class="min-w-full divide-y divide-gray-200 border">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r">
                  รหัสนักศึกษา
                </th>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-[120px] bg-gray-50 z-10 border-r">
                  ชื่อ-นามสกุล
                </th>
                <th v-for="header in assignmentHeaders" :key="header" scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                  {{ header }}
                </th>
                <th scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  รวม
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="student in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-0 bg-white z-10 border-r">
                  {{ student.studentId }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-[120px] bg-white z-10 border-r min-w-[180px]">
                  {{ student.firstName }} {{ student.lastName }}
                </td>
                <td v-for="i in 12" :key="i" class="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-900 border-r">
                  {{ getAssignmentScore(student, i.toString()) }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-center font-medium text-gray-900">
                  {{ calculateTotalAssignmentScore(student) }}
                </td>
              </tr>
            </tbody>
          </table>
          
          <!-- Attendance Table -->
          <table v-if="selectedScoreType === 'attendance'" class="min-w-full divide-y divide-gray-200 border">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10 border-r">
                  รหัสนักศึกษา
                </th>
                <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-[120px] bg-gray-50 z-10 border-r">
                  ชื่อ-นามสกุล
                </th>
                <th v-for="header in attendanceHeaders" :key="header" scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                  {{ header }}
                </th>
                <th scope="col" class="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  รวม
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="student in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-0 bg-white z-10 border-r">
                  {{ student.studentId }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 sticky left-[120px] bg-white z-10 border-r min-w-[180px]">
                  {{ student.firstName }} {{ student.lastName }}
                </td>
                <td v-for="i in 16" :key="i" class="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-900 border-r">
                  {{ getAttendanceStatus(student, i.toString()) }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-sm text-center font-medium text-gray-900">
                  {{ calculateTotalAttendance(student) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* เพิ่ม CSS เพื่อให้ scroll bar ทำงานได้ดี */
.overflow-x-auto {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  table-layout: fixed;
}

th, td {
  min-width: 80px;
}
</style>