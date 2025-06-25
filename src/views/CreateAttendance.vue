// src/views/Attendance.vue หรือชื่อไฟล์ของคุณ
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { auth, db } from '../firebase.js' // ตรวจสอบว่า db ถูก import ถูกต้อง
import { onAuthStateChanged } from 'firebase/auth'
import {
  // getFirestore, // ถ้า db ถูก import แยกแล้ว ไม่ต้องใช้ getFirestore() อีก
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
  getDoc,
  getDocs,
  limit
} from 'firebase/firestore'
import QRCodeVue from 'qrcode.vue'

const router = useRouter()
const userEmail = ref('')
const sessionStarted = ref(false)
const sessionId = ref(null)
// const db = getFirestore() // ถ้า db import มาแล้ว บรรทัดนี้ไม่จำเป็น

const durationMinutes = ref(30)
const onTimeDurationMinutes = ref(15)
const weekNumber = ref('')
const majorName = ref('') // <--- เพิ่ม Ref สำหรับชื่อสาขา
const countdown = ref(0)
let timer = null

const attendeesList = ref([])
let unsubscribe = null

const sidebarVisible = ref(false)
const qrCodeSize = ref(300)

// ... (ฟังก์ชันอื่นๆ formatTime, formatTimestamp, toggleSidebar, closeSidebar, checkActiveSession, startCountdown, stopSession คงเดิม) ...
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

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

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value
}

function closeSidebar() {
  sidebarVisible.value = false
}

async function checkActiveSession() {
  try {
    const q = query(
      collection(db, 'attendance_sessions'),
      where('createdBy', '==', userEmail.value),
      where('isActive', '==', true),
      limit(10)
    )
    const querySnapshot = await getDocs(q)
    if (!querySnapshot.empty) {
      let latestSession = null
      let latestTime = 0
      querySnapshot.docs.forEach(docSnapshot => {
        const data = docSnapshot.data()
        const createdAt = data.createdAt?.toDate() || new Date(0)
        if (createdAt.getTime() > latestTime) {
          latestTime = createdAt.getTime()
          latestSession = { id: docSnapshot.id, ...data }
        }
      })

      if (latestSession) {
        const createdAt = latestSession.createdAt?.toDate() || new Date()
        const now = new Date()
        const elapsedSeconds = Math.floor((now - createdAt) / 1000)
        const remainingSeconds = latestSession.duration - elapsedSeconds

        if (remainingSeconds > 0) {
          sessionId.value = latestSession.id
          sessionStarted.value = true
          durationMinutes.value = Math.ceil(latestSession.duration / 60)
          if (latestSession.onTimeDurationSeconds) {
            onTimeDurationMinutes.value = Math.ceil(latestSession.onTimeDurationSeconds / 60)
          }
          // ดึง week และ major ของ session ที่ active อยู่มาแสดง (ถ้ามี)
          weekNumber.value = latestSession.week || ''
          majorName.value = latestSession.major || ''

          countdown.value = remainingSeconds
          startCountdown()

        } else {
          await updateDoc(doc(db, 'attendance_sessions', latestSession.id), {
            isActive: false
          })
        }
      }
    }
  } catch (error) {
    console.error("Error checking active session:", error)
  }
}

function startCountdown() {
  if (timer) clearInterval(timer)
  timer = setInterval(async () => {
    if (countdown.value > 0) {
      countdown.value--
    } else {
      clearInterval(timer)
      sessionStarted.value = false
      if (sessionId.value) {
        await updateDoc(doc(db, 'attendance_sessions', sessionId.value), {
          isActive: false
        })
      }
      await Swal.fire({
        title: 'หมดเวลาการเช็คชื่อ',
        text: 'เซสชันการเช็คชื่อสิ้นสุดแล้ว',
        icon: 'info',
        confirmButtonText: 'ตกลง'
      })
    }
  }, 1000)
}

async function stopSession() {
  const result = await Swal.fire({
    title: 'ต้องการหยุดการเช็คชื่อจริงหรือไม่?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'หยุดเซสชัน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e53e3e',
    cancelButtonColor: '#909090',
  })
  if (result.isConfirmed) {
    clearInterval(timer)
    sessionStarted.value = false
    if (sessionId.value) {
      await updateDoc(doc(db, 'attendance_sessions', sessionId.value), {
        isActive: false
      })
    }
    await Swal.fire({
      title: 'หยุดการเช็คชื่อเรียบร้อยแล้ว',
      icon: 'success',
      confirmButtonText: 'ตกลง'
    })
  }
}


async function startSession() {
  if (durationMinutes.value <= 0 || !Number.isInteger(durationMinutes.value)) {
    Swal.fire('กรุณากรอกระยะเวลาเซสชันทั้งหมดเป็นจำนวนเต็มบวก', '', 'warning')
    return
  }
  if (weekNumber.value.trim() === '') {
    Swal.fire('กรุณากรอกหมายเลขสัปดาห์', '', 'warning')
    return
  }
  if (majorName.value.trim() === '') {
    Swal.fire('กรุณากรอกชื่อสาขาวิชา', '', 'warning')
    return
  }

  try {
    const docRef = await addDoc(collection(db, 'attendance_sessions'), {
      createdAt: serverTimestamp(),
      createdBy: userEmail.value,
      isActive: true,
      duration: durationMinutes.value * 60,
      onTimeDurationSeconds: onTimeDurationMinutes.value * 60,
      week: weekNumber.value.trim(),
      major: majorName.value.trim() // <--- บันทึกชื่อสาขา
    })
    sessionId.value = docRef.id
    sessionStarted.value = true
    countdown.value = durationMinutes.value * 60
    startCountdown()
    Swal.fire({
      title: 'เริ่มเซสชันการเช็คชื่อเรียบร้อยแล้ว',
      text: `เซสชันสำหรับสัปดาห์ที่ ${weekNumber.value} (${majorName.value.trim()}) กำลังดำเนินการ`, // <--- อัปเดตข้อความ Swal
      icon: 'success',
      timer: 2500,
      showConfirmButton: false
    })
    // ไม่ต้องเคลียร์ weekNumber และ majorName ที่นี่ เพราะ checkActiveSession จะดึงมาแสดงถ้ามี session active
  } catch (error) {
    console.error("Error starting session:", error);
    Swal.fire('เกิดข้อผิดพลาดในการสร้างเซสชัน', error.message, 'error')
  }
}

onMounted(() => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      userEmail.value = user.email
      await checkActiveSession() // ตรวจสอบเซสชันที่ active เมื่อโหลดหน้า
    } else {
      router.push('/')
    }
  })
})

onBeforeUnmount(() => {
  clearInterval(timer)
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
})

watch(sessionId, (newVal, oldVal) => {
  if (newVal === oldVal) return; // ป้องกันการเรียกซ้ำถ้าค่าไม่เปลี่ยน

  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }

  attendeesList.value = [] // Clear list when session ID changes or stops

  if (newVal) {
    listenToAttendance()
  }
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

function listenToAttendance() {
  if (!sessionId.value) {
    return;
  }
  const q = query(
    collection(db, 'attendance_records'),
    where('sessionId', '==', sessionId.value),
    orderBy('timestamp', 'asc')
  )
  unsubscribe = onSnapshot(q, async (snapshot) => {
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
    const withName = await Promise.all(records.map(async (rec) => {
      let name = rec.name || ''
      if (!name && rec.studentId) {
        try {
          const studentDocRef = doc(db, 'students', rec.studentId);
          const studentDocSnap = await getDoc(studentDocRef);

          if (studentDocSnap.exists()) {
            name = studentDocSnap.data().name
          } else {
            name = 'ไม่พบชื่อนักเรียน';
          }
        } catch (e) {
          console.warn("Could not fetch student name for", rec.studentId, e)
          name = 'Error fetching name';
        }
      }
      return { ...rec, name, score: rec.score, status: rec.status }
    }))
    attendeesList.value = withName
  }, (error) => {
    console.error('Error listening to attendance:', error)
  })
}

</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">

   <!-- Header -->
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
              active-class="active-menu-item">
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
    <main class="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 relative">
      <div class="text-center mb-6 sm:mb-8">
        <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 mb-2">ระบบเช็คชื่อออนไลน์</h2>
        <p class="text-sm sm:text-base text-gray-600">สร้างและจัดการการเช็คชื่อสำหรับนักเรียน</p>
      </div>

      <!-- Create Session Card -->
      <div class="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8">
        <h3 class="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
          {{ sessionStarted ? 'เซสชันปัจจุบัน' : 'สร้างการเช็คชื่อใหม่' }}
        </h3>

        <div v-if="!sessionStarted" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <div>
            <label for="durationMinutes"
              class="block text-gray-700 font-semibold mb-2 text-sm sm:text-base">ระยะเวลาทั้งหมด (นาที)</label>
            <input id="durationMinutes" v-model.number="durationMinutes" type="number" min="1"
              class="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm sm:text-base" />
          </div>
          <div>
            <label for="onTimeDurationMinutes"
              class="block text-gray-700 font-semibold mb-2 text-sm sm:text-base">เวลาสำหรับคะแนนเต็ม (นาที)</label>
            <input id="onTimeDurationMinutes" v-model.number="onTimeDurationMinutes" type="number" min="1"
              class="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm sm:text-base"
              placeholder="เช่น 15" />
          </div>
          <div>
            <label for="weekNumber"
              class="block text-gray-700 font-semibold mb-2 text-sm sm:text-base">สัปดาห์ที่</label>
            <input id="weekNumber" v-model="weekNumber" type="text"
              class="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm sm:text-base"
              placeholder="เช่น 1, 2," />
          </div>
          <div>
            <label for="majorName" class="block text-gray-700 font-semibold mb-2 text-sm sm:text-base">สาขาวิชา</label>
            <input id="majorName" v-model="majorName" type="text"
              class="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-2 sm:py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm sm:text-base"
              placeholder="เช่น IT , CS" />
          </div>
        </div>

        <div v-if="!sessionStarted">
          <button @click="startSession"
            class="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 sm:px-8 py-3 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-semibold text-base sm:text-lg">
            เริ่มเช็คชื่อ
          </button>
        </div>

        <!-- Session Info when active -->
        <div v-if="sessionStarted"
          class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 sm:p-6">
          <div
            class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 space-y-3 sm:space-y-0">
            <div>
              <h4 class="text-lg sm:text-xl font-bold text-gray-800">เซสชันการเช็คชื่อ</h4>
              <p class="text-sm sm:text-base text-gray-600 break-all">Session ID: {{ sessionId }}</p>
            </div>
            <div class="text-center sm:text-right">
              <div class="text-xl sm:text-2xl font-bold text-blue-600">{{ formatTime(countdown) }}</div>
              <p class="text-xs sm:text-sm text-gray-600">เวลาที่เหลือ</p>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-3">
            <button @click="stopSession"
              class="w-full sm:w-auto bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-semibold text-sm">
              หยุดเซสชัน
            </button>
            <div class="text-sm text-gray-600 flex items-center">
              <svg class="w-4 h-4 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              {{ attendeesList.length }} คนเข้าร่วมแล้ว
            </div>
          </div>
        </div>
      </div>

      <!-- QR Code Section -->
      <div v-if="sessionStarted" class="bg-white rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
        <div class="text-center mb-6 sm:mb-8">
          <div
            class="inline-flex items-center bg-green-100 text-green-800 px-3 sm:px-4 py-2 rounded-full font-semibold mb-4 text-sm sm:text-base">
            <div class="w-2 h-2 sm:w-3 sm:h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            การเช็คชื่อกำลังดำเนินอยู่
          </div>
        </div>
        <div
          class="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 p-4 sm:p-6 lg:p-8 rounded-2xl text-center">
          <p class="text-gray-700 mb-4 font-semibold text-sm sm:text-base">QR Code สำหรับการเช็คชื่อ</p>
          <div class="bg-white p-3 sm:p-4 rounded-xl inline-block shadow-lg">
            <QRCodeVue :value="`https://wed-ds2025.vercel.app/attendance/checkclass/${sessionId}`" :size="qrCodeSize" />
          </div>
          <p class="text-xs sm:text-sm text-gray-600 mt-4">แชร์ QR Code นี้ให้นักเรียนสแกนเพื่อเช็คชื่อ</p>
          <div class="mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg">
            <p class="text-xs sm:text-sm text-blue-600 font-medium mb-2">ลิงก์สำหรับเช็คชื่อ:</p>
            <a :href="`https://web-ds2025.vercel.app/attendance/checkclass/${sessionId}`" target="_blank"
              class="text-xs sm:text-sm text-blue-600 underline hover:text-blue-800 break-all block">
              https://web-ds2025.vercel.app/attendance/checkclass/{{ sessionId }}
            </a>
          </div>
        </div>
      </div>
      <br>
      <footer class="text-center py-6 text-xs text-gray-500">
        &copy; 2025 CP352201 & SC362201 Web Design Technologies. <br>
        Developed by suthinanll
      </footer>
      
    </main>

    <!-- Floating Button -->
    <button @click="toggleSidebar"
      class="fixed bottom-6 right-4 sm:top-1/2 sm:right-6 sm:bottom-auto sm:transform sm:-translate-y-1/2 bg-gradient-to-r from-green-500 to-emerald-600 text-white p-3 sm:p-4 rounded-full shadow-2xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 z-50 group"
      :class="{ 'sm:right-96': sidebarVisible }">
      <div class="flex items-center">
        <svg class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span class="ml-2 font-semibold whitespace-nowrap text-sm sm:text-base">{{ attendeesList.length }}</span>
      </div>
      <div
        class="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-2 rounded-lg text-xs sm:text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap hidden sm:block">
        รายชื่อผู้เข้าร่วม
      </div>
    </button>

    <!-- Sidebar -->
    <div v-if="sidebarVisible" class="fixed inset-0 z-40" @click="closeSidebar">
      <div class="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"></div>
      <div
        class="absolute top-0 right-0 bottom-0 w-full sm:top-4 sm:right-4 sm:bottom-4 sm:w-80 lg:w-96 bg-white sm:rounded-2xl shadow-2xl flex flex-col transform transition-transform duration-300"
        @click.stop>
        <div
          class="p-4 sm:p-6 border-b border-gray-200 sm:rounded-t-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white">
          <div class="flex items-center justify-between">
            <h3 class="text-lg sm:text-xl font-bold flex items-center">
              รายชื่อผู้เข้าร่วม
            </h3>
            <button @click="closeSidebar" class="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex items-center justify-between mt-3">
            <span class="text-sm text-green-100">ทั้งหมด {{ attendeesList.length }} คน</span>
            <span class="bg-white bg-opacity-20 px-3 py-1 rounded-full text-xs font-semibold">
              {{ sessionStarted ? 'กำลังเช็คชื่อ' : 'รอเริ่มต้น' }}
            </span>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="attendeesList.length === 0" class="p-6 sm:p-8 text-center">
            <div
              class="bg-gray-100 rounded-full w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p class="text-gray-600 text-base sm:text-lg font-medium">ยังไม่มีผู้เข้าร่วม</p>
            <p class="text-xs sm:text-sm text-gray-500 mt-2">เมื่อมีการเช็คชื่อจะแสดงที่นี่</p>
          </div>

          <div v-else class="p-3 sm:p-4 space-y-3">
            <div v-for="(attendee, index) in attendeesList" :key="attendee.id"
              class="rounded-xl p-3 sm:p-4 border transition-all duration-200 hover:shadow-md" :class="[
                attendee.status === 'late' || attendee.score === 0.5
                  ? 'bg-orange-50 border-orange-300'
                  : (attendee.status === 'on-time' || attendee.score === 1
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                    : 'bg-gray-50 border-gray-200')
              ]">
              <div class="flex items-center">
                <div
                  class="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base"
                  :class="attendee.status === 'late' || attendee.score === 0.5
                    ? 'bg-orange-400'
                    : (attendee.status === 'on-time' || attendee.score === 1
                      ? 'bg-gradient-to-br from-green-400 to-emerald-500'
                      : 'bg-gray-400')">
                  {{ index + 1 }}
                </div>
                <div class="ml-3 sm:ml-4 flex-1 min-w-0">
                  <p class="font-semibold text-gray-800 text-sm sm:text-base truncate">
                    {{ attendee.name || 'ไม่ระบุชื่อ' }}
                    <span v-if="attendee.status === 'late' || attendee.score === 0.5"
                      class="text-orange-500 text-xs font-bold ml-1 sm:ml-2">
                      (มาสาย)
                    </span>
                    <span v-else-if="attendee.status === 'on-time' || attendee.score === 1"
                      class="text-green-600 text-xs font-bold ml-1 sm:ml-2">
                      (ทันเวลา)
                    </span>
                  </p>
                  <p class="text-xs sm:text-sm text-gray-600 truncate">{{ attendee.studentId || 'ไม่ระบุรหัส' }}</p>
                  <div class="flex items-center mt-1">
                    <svg class="w-3 h-3 flex-shrink-0"
                      :class="attendee.status === 'late' || attendee.score === 0.5 ? 'text-orange-500' : (attendee.status === 'on-time' || attendee.score === 1 ? 'text-green-500' : 'text-gray-500')"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span class="text-xs font-medium ml-1 truncate"
                      :class="attendee.status === 'late' || attendee.score === 0.5 ? 'text-orange-600' : (attendee.status === 'on-time' || attendee.score === 1 ? 'text-green-600' : 'text-gray-600')">
                      {{ formatTimestamp(attendee.timestamp || attendee.checkedAt) || 'ไม่ได้เช็คชื่อ' }}
                      <span v-if="typeof attendee.score !== 'undefined'" class="whitespace-nowrap"> - {{ attendee.score
                        }} คะแนน</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  
</template>

<script>
import { computed } from 'vue'

export default {
  // ... existing script content
  setup() {
    // QR Code size based on screen size
    const qrCodeSize = computed(() => {
      // You might want to use a reactive screen size detection here
      // For now, we'll use a default size that works well on most screens
      return window.innerWidth < 640 ? 150 : 200
    })

    return {
      qrCodeSize
    }
  }
}
</script>

<style scoped lang="postcss">
.menu-item {
  @apply px-2 sm:px-3 py-2 rounded-md text-xs sm:text-sm font-medium text-gray-700 relative;
  @apply hover:text-green-700 transition-colors duration-200;
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

/* Custom scrollbar for sidebar */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  @apply bg-gray-100;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded-full;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400;
}

/* Ensure content doesn't get cut off on very small screens */
@media (max-width: 640px) {
  .break-all {
    word-break: break-all;
    overflow-wrap: break-word;
  }
}
</style>