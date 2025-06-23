<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import { auth, db } from '../firebase.js' // ตรวจสอบว่า db ถูก export จาก firebase.js
import { onAuthStateChanged } from 'firebase/auth'

// เพิ่ม Firestore imports ที่จำเป็นสำหรับการลบ
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,        
  writeBatch,
  where       
} from 'firebase/firestore'


const router = useRouter()
const userEmail = ref('')

// เพิ่ม ref สำหรับเก็บประวัติการเช็คชื่อ และสถานะการโหลด/การลบ
const recentSessions = ref([])
const isLoadingSessions = ref(false) // สถานะกำลังโหลดประวัติ
const isDeletingSession = ref(null)  // ID ของ session ที่กำลังลบ

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

  if (seconds < 0) return 'ในอนาคต' // กรณีเวลาไม่ถูกต้อง
  if (seconds < 5) return 'เมื่อสักครู่'
  if (seconds < 60) return `${seconds} วินาทีที่แล้ว`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} วันที่แล้ว`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks} สัปดาห์ที่แล้ว`
  const months = Math.floor(days / 30) // โดยประมาณ
  if (months < 12) return `${months} เดือนที่แล้ว`
  const years = Math.floor(days / 365) // โดยประมาณ
  return `${years} ปีที่แล้ว`
}

// ฟังก์ชันดึงประวัติการเช็คชื่อ
async function fetchRecentSessions() {
  isLoadingSessions.value = true
  recentSessions.value = [] // Clear old data before fetching
  try {
    const q = query(
      collection(db, 'attendance_sessions'),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    recentSessions.value = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    // console.log('Fetched sessions:', recentSessions.value);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดประวัติการเช็คชื่อได้', 'error')
  } finally {
    isLoadingSessions.value = false
  }
}

// ฟังก์ชันนำทางไปยังหน้ารายละเอียดการเช็คชื่อของแต่ละเซสชัน
function viewSessionAttendance(sessionId) {
  router.push(`/admin/attendance-details/${sessionId}`); // ตรวจสอบ path ให้ตรงกับ router ของคุณ
}

// ฟังก์ชันยืนยันการลบเซสชัน
async function confirmDeleteSession(session) {
  const sessionName = session.week ? `สัปดาห์ที่ ${session.week}` : `เซสชัน (${formatTimestamp(session.createdAt)})`;

  const result = await Swal.fire({
    title: 'ยืนยันการลบเซสชัน?',
    html: `คุณต้องการลบเซสชัน <strong>"${sessionName}"</strong> ใช่หรือไม่?<br><strong class="text-red-600">การกระทำนี้จะลบข้อมูลการเช็คชื่อทั้งหมดที่เกี่ยวข้องกับเซสชันนี้ และไม่สามารถกู้คืนได้!</strong>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ใช่, ลบเลย',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e53e3e',
    cancelButtonColor: '#718096',
    reverseButtons: true
  });

  if (result.isConfirmed) {
    await deleteSessionAndRecords(session.id);
  }
}

// ฟังก์ชันลบเซสชันและข้อมูลการเช็คชื่อที่เกี่ยวข้อง
async function deleteSessionAndRecords(sessionId) {
  isDeletingSession.value = sessionId;
  try {
    const batch = writeBatch(db);

    // 1. เตรียมลบ session document
    const sessionRef = doc(db, 'attendance_sessions', sessionId);
    batch.delete(sessionRef);

    // 2. เตรียมลบ attendance records ที่เกี่ยวข้อง (สมมติว่า collection คือ 'attendance_records')
    // และมี field 'sessionId' ชี้กลับมาที่ session
    const recordsQuery = query(collection(db, 'attendance_records'), where('sessionId', '==', sessionId));
    const recordsSnapshot = await getDocs(recordsQuery);
    recordsSnapshot.forEach(recordDoc => {
      batch.delete(recordDoc.ref);
    });

    // 3. Commit การลบทั้งหมด
    await batch.commit();

    Swal.fire('สำเร็จ!', 'ลบเซสชันและข้อมูลการเช็คชื่อที่เกี่ยวข้องเรียบร้อยแล้ว', 'success');

    // อัปเดต UI โดยการกรอง session ที่ถูกลบออกจาก list
    recentSessions.value = recentSessions.value.filter(s => s.id !== sessionId);
    // หรือถ้าต้องการความสดใหม่เสมอ ก็เรียก fetchRecentSessions() อีกครั้ง
    // await fetchRecentSessions();

  } catch (error) {
    console.error('Error deleting session and related records:', error);
    Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถลบเซสชันได้: ${error.message}`, 'error');
  } finally {
    isDeletingSession.value = null; // เคลียร์สถานะการลบ
  }
}


// ดึงข้อมูล user ที่ล็อกอินอยู่
onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email
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
        <div class="flex flex-col sm:flex-row justify-between items-center py-4 sm:py-6 space-y-4 sm:space-y-0">
          <div class="flex items-center text-center sm:text-left">
            <router-link to="/admin" class="flex-shrink-0 block">
              <h1 class="text-xl sm:text-2xl font-bold text-green-600">ระบบเช็คชื่อและให้คะแนน</h1>
              <h1 class="text-xs sm:text-sm text-gray-500">CP352201 & SC362201 Web Design Technologies</h1>
            </router-link>
          </div>
          <div class="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
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
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <!-- Welcome Section -->
      <div class="text-center mb-8 sm:mb-12">
        <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 mb-4">
          ยินดีต้อนรับสู่ระบบจัดการชั้นเรียน
        </h2>
        <p class="text-base sm:text-lg lg:text-xl text-gray-600 px-4">
          เลือกเมนูด้านล่างเพื่อเริ่มจัดการชั้นเรียนของคุณ
        </p>
      </div>

      <!-- Menu Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mb-8 sm:mb-12">
        <!-- เช็คชื่อ -->
        <div @click="goToAttendance"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105 active:scale-95">
          <div class="p-6 sm:p-8 text-center">
            <div class="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">✅</div>
            <h3 class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 mb-2">เช็คชื่อ</h3>
            <p class="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4 line-clamp-2">
              บันทึกการเข้าเรียนของนักศึกษา
            </p>
            <div class="bg-blue-100 text-blue-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium">
              จัดการการเข้าเรียน
            </div>
          </div>
        </div>

        <!-- รายชื่อนักศึกษา -->
        <div @click="goToStudentList"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105 active:scale-95">
          <div class="p-6 sm:p-8 text-center">
            <div class="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">👥</div>
            <h3 class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 mb-2">รายชื่อนักศึกษา</h3>
            <p class="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4 line-clamp-2">
              จัดการข้อมูลนักศึกษาในชั้นเรียน
            </p>
            <div class="bg-green-100 text-green-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium">
              จัดการนักศึกษา
            </div>
          </div>
        </div>

        <!-- ให้คะแนน -->
        <div @click="goTopoint"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105 active:scale-95">
          <div class="p-6 sm:p-8 text-center">
            <div class="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">📝</div>
            <h3 class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 mb-2">ให้คะแนน</h3>
            <p class="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4 line-clamp-2">
              บันทึกคะแนน
            </p>
            <div class="bg-yellow-100 text-yellow-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium">
              ประเมินผล
            </div>
          </div>
        </div>

        <!-- ตารางคะแนนรวม -->
        <div @click="goToScoreboard"
          class="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 cursor-pointer transform hover:scale-105 active:scale-95">
          <div class="p-6 sm:p-8 text-center">
            <div class="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">📊</div>
            <h3 class="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 mb-2">ตารางคะแนนรวม</h3>
            <p class="text-sm sm:text-base text-gray-600 mb-3 sm:mb-4 line-clamp-2">
              ดูสรุปคะแนนและผลการเรียน
            </p>
            <div class="bg-purple-100 text-purple-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium">
              รายงานผล
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activities -->
      <div class="mt-12 sm:mt-16">
        <h3 class="text-xl sm:text-2xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">
          ประวัติการเช็คชื่อ
        </h3>
        <div class="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <div class="space-y-4">
            <!-- แสดงข้อความเมื่อกำลังโหลด -->
            <div v-if="isLoadingSessions" class="text-center text-gray-500 py-8 sm:py-10">
              <div class="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-500"></div>
              <p class="mt-2 text-sm sm:text-base">กำลังโหลดประวัติการเช็คชื่อ...</p>
            </div>

            <!-- แสดงข้อความเมื่อไม่มีประวัติ -->
            <div v-else-if="!isLoadingSessions && recentSessions.length === 0" class="text-center text-gray-500 py-8 sm:py-10">
              <svg class="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                aria-hidden="true">
                <path vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <p class="mt-2 text-base sm:text-lg">ยังไม่มีประวัติการเช็คชื่อ</p>
              <p class="text-xs sm:text-sm text-gray-400">เริ่มสร้างเซสชันการเช็คชื่อใหม่ได้เลย</p>
            </div>

            <!-- วนลูปแสดงประวัติเซสชัน -->
            <div v-else v-for="session in recentSessions" :key="session.id"
              class="flex flex-col lg:flex-row lg:items-center justify-between py-3 sm:py-4 px-3 sm:px-5 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition duration-150 rounded-lg group">

              <div @click="viewSessionAttendance(session.id)" class="flex-grow cursor-pointer pr-2 sm:pr-4 mb-3 lg:mb-0">
                <div class="flex flex-col sm:flex-row sm:items-center mb-1">
                  <div class="flex items-center mb-1 sm:mb-0">
                    <div class="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mr-2 sm:mr-3 flex-shrink-0"
                      :class="{ 'bg-green-500': session.isActive, 'bg-gray-400': !session.isActive }"></div>
                    <span class="text-gray-800 font-semibold text-sm sm:text-base lg:text-lg">
                      {{ session.week ? `สัปดาห์ที่ ${session.week}` : `เซสชัน` }}
                    </span>
                    <span v-if="!session.isActive"
                      class="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                      สิ้นสุดแล้ว
                    </span>
                  </div>
                  
                  <!-- สาขาวิชา -->
                  <span v-if="session.major" class="font-normal text-gray-600 text-xs sm:text-sm lg:text-base sm:ml-1">
                    ({{ session.major }})
                  </span>
                </div>
                
                <!-- หัวข้อ -->
                <p v-if="session.topic" class="ml-5 sm:ml-6 text-xs sm:text-sm text-gray-500 mb-1 line-clamp-2">
                  หัวข้อ: {{ session.topic }}
                </p>
                
                <p class="ml-5 sm:ml-6 text-xs sm:text-sm text-gray-500">
                  สร้างเมื่อ: {{ formatTimestamp(session.createdAt) }} ({{ formatTimeAgo(session.createdAt) }})
                </p>
                <p class="ml-5 sm:ml-6 text-xs text-gray-400 mt-0.5">
                  สร้างโดย: {{ session.createdBy || 'ไม่ระบุ' }}
                </p>
              </div>

              <div class="flex items-center justify-end lg:justify-center flex-shrink-0">
                <!-- ปุ่มลบ -->
                <button @click.stop="confirmDeleteSession(session)" :disabled="isDeletingSession === session.id"
                  class="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full transition duration-150 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-50"
                  :title="`ลบเซสชัน ${session.week ? 'สัปดาห์ที่ ' + session.week : ''} ${session.major ? '(' + session.major + ')' : ''}`.trim()">
                  <svg v-if="isDeletingSession !== session.id" class="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg">
                    <path fill-rule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clip-rule="evenodd"></path>
                  </svg>
                  <svg v-else class="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none"
                    viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                    </path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="text-center py-4 mt-8 sm:mt-12 text-xs text-gray-500">
        &copy; {{ new Date().getFullYear() }} CP352201 & SC362201 Web Design Technologies
      </footer>
    </main>
  </div>
</template>