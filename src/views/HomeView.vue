<!-- src/views/HomeView.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import { auth } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'

// เพิ่ม Firestore imports
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs
} from 'firebase/firestore'


const router = useRouter()
const userEmail = ref('')
const db = getFirestore() // Initialize Firestore

// เพิ่ม ref สำหรับเก็บประวัติการเช็คชื่อ
const recentSessions = ref([])

// ฟังก์ชันสำหรับ format วันที่และเวลา
function formatTimestamp(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)

  return date.toLocaleString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ฟังก์ชันสำหรับแปลงเวลาเป็น "กี่นาทีที่แล้ว"
function formatTimeAgo(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const seconds = Math.floor((now - date) / 1000)

  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} วันที่แล้ว`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks} สัปดาห์ที่แล้ว`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} เดือนที่แล้ว`
  const years = Math.floor(days / 365)
  return `${years} ปีที่แล้ว`
}

// ฟังก์ชันดึงประวัติการเช็คชื่อล่าสุด
async function fetchRecentSessions() {
  try {
    const q = query(
      collection(db, 'attendance_sessions'),
      orderBy('createdAt', 'desc') // ดึงทั้งหมด เรียงจากใหม่ → เก่า
    );
    const querySnapshot = await getDocs(q);
    recentSessions.value = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    console.log('Fetched ALL sessions:', recentSessions.value);
  } catch (error) {
    console.error('Error fetching all sessions:', error);
  }
}

// ฟังก์ชันนำทางไปยังหน้ารายละเอียดการเช็คชื่อของแต่ละเซสชัน
function viewSessionAttendance(sessionId) {
  // คุณจะต้องสร้าง route ใน src/router/index.js ที่รองรับ path นี้
  // เช่น path: '/admin/attendance-details/:sessionId'
  router.push(`/admin/attendance-details/${sessionId}`);
}


// ดึงข้อมูล user ที่ล็อกอินอยู่
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email
      // เรียกใช้ฟังก์ชันดึงประวัติการเช็คชื่อเมื่อ userEmail พร้อม
      fetchRecentSessions();
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

// Functions for navigation
function goToAttendance() {
  router.push('/attendance')
}

function goToStudentList() {
  router.push('/students')
}

function goTopoint() {
  router.push('/addpoint')
}

function goToScoreboard() {
  router.push('/scoreboard')
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
    <main class="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <!-- Welcome Section -->
      <div class="text-center mb-12">
        <h2 class="text-4xl font-bold text-gray-800 mb-4">
          ยินดีต้อนรับสู่ระบบจัดการชั้นเรียน
        </h2>
        <p class="text-xl text-gray-600">
          เลือกเมนูด้านล่างเพื่อเริ่มจัดการชั้นเรียนของคุณ
        </p>
      </div>

      <!-- Menu Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <!-- เช็คชื่อ -->
        <div @click="goToAttendance"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105">
          <div class="p-8 text-center">
            <div class="text-6xl mb-4">✅</div>
            <h3 class="text-2xl font-bold text-gray-800 mb-2">เช็คชื่อ</h3>
            <p class="text-gray-600 mb-4">
              บันทึกการเข้าเรียนของนักศึกษา
            </p>
            <div class="bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
              จัดการการเข้าเรียน
            </div>
          </div>
        </div>

        <!-- รายชื่อนักศึกษา -->
        <div @click="goToStudentList"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105">
          <div class="p-8 text-center">
            <div class="text-6xl mb-4">👥</div>
            <h3 class="text-2xl font-bold text-gray-800 mb-2">รายชื่อนักศึกษา</h3>
            <p class="text-gray-600 mb-4">
              จัดการข้อมูลนักศึกษาในชั้นเรียน
            </p>
            <div class="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium">
              จัดการนักศึกษา
            </div>
          </div>
        </div>

        <!-- ให้คะแนน -->
        <div @click="goTopoint"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105">
          <div class="p-8 text-center">
            <div class="text-6xl mb-4">📝</div>
            <h3 class="text-2xl font-bold text-gray-800 mb-2">ให้คะแนน</h3>
            <p class="text-gray-600 mb-4">
              บันทึกคะแนน
            </p>
            <div class="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-medium">
              ประเมินผล
            </div>
          </div>
        </div>

        <!-- ตารางคะแนนรวม -->
        <div @click="goToScoreboard"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105">
          <div class="p-8 text-center">
            <div class="text-6xl mb-4">📊</div>
            <h3 class="text-2xl font-bold text-gray-800 mb-2">ตารางคะแนนรวม</h3>
            <p class="text-gray-600 mb-4">
              ดูสรุปคะแนนและผลการเรียน
            </p>
            <div class="bg-purple-100 text-purple-800 px-4 py-2 rounded-full text-sm font-medium">
              รายงานผล
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Stats Section -->
      <div class="mt-16">
        <h3 class="text-2xl font-bold text-gray-800 mb-8 text-center">
          สถิติการเข้าเรียน
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-white rounded-lg shadow-md p-6 text-center">
            <div class="text-3xl font-bold text-blue-600 mb-2">25</div>
            <div class="text-gray-600">นักศึกษาทั้งหมด</div>
          </div>
          <div class="bg-white rounded-lg shadow-md p-6 text-center">
            <div class="text-3xl font-bold text-green-600 mb-2">87%</div>
            <div class="text-gray-600">อัตราการเข้าเรียนเฉลี่ย</div>
          </div>
          <div class="bg-white rounded-lg shadow-md p-6 text-center">
            <div class="text-3xl font-bold text-orange-600 mb-2">2%</div>
            <div class="text-gray-600">อัตราการขาด ลา มาสาย</div>
          </div>
        </div>
      </div>

      <!-- Recent Activities -->
      <div class="mt-16">
        <h3 class="text-2xl font-bold text-gray-800 mb-8 text-center">
          ประวัติการเช็คชื่อ
        </h3>
        <div class="bg-white rounded-xl shadow-lg p-6">
          <div class="space-y-4">
            <!-- แสดงข้อความเมื่อไม่มีประวัติ -->
            <p v-if="recentSessions.length === 0" class="text-center text-gray-500 py-4">
              ยังไม่มีประวัติการเช็คชื่อ
            </p>

            <!-- วนลูปแสดงประวัติเซสชัน -->
            <div v-for="session in recentSessions" :key="session.id" @click="viewSessionAttendance(session.id)"
              class="flex flex-col md:flex-row md:items-center justify-between py-3 px-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition duration-150 rounded-lg">
              <div>
                <div class="flex items-center">
                  <!-- วงกลมสถานะ (เขียว = Active, เทา = Inactive) -->
                  <div class="w-3 h-3 rounded-full mr-3"
                    :class="{ 'bg-green-500': session.isActive, 'bg-gray-400': !session.isActive }"></div>
                  <span class="text-gray-700 font-medium">{{ session.name }}</span>
                  <span v-if="!session.isActive"
                    class="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">
                    สิ้นสุดแล้ว
                  </span>
                </div>
                <!-- แสดงชื่อผู้สร้าง -->
                <p class="ml-6 text-sm text-gray-500 mt-1">
                  สร้างโดย: {{ session.createdBy || 'ไม่ทราบ' }}
                </p>
              </div>
              <div class="text-right mt-2 md:mt-0">
                <span class="text-sm text-gray-500 block">{{ formatTimestamp(session.createdAt) }}</span>
                <span class="text-xs text-gray-400 block">{{ formatTimeAgo(session.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>



    </main>
  </div>
</template>