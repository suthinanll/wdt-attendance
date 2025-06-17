<!-- eslint-disable no-unused-vars -->

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { auth } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import {
  getFirestore,
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
const sessionName = ref('')
const sessionStarted = ref(false)
const sessionId = ref(null)
const db = getFirestore()

const durationMinutes = ref(5)
const countdown = ref(0)
let timer = null

const attendeesList = ref([])
let unsubscribe = null

const sidebarVisible = ref(false)

// เพิ่มตรงนี้สำหรับรอบสาย
const lateSession = ref(false)

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
          sessionName.value = latestSession.name
          sessionStarted.value = true
          durationMinutes.value = Math.ceil(latestSession.duration / 60)
          countdown.value = remainingSeconds
          lateSession.value = !!latestSession.isLateRound
          startCountdown()
          Swal.fire({
            title: 'กู้คืนเซสชันสำเร็จ',
            text: `กำลังดำเนินการเช็คชื่อ "${latestSession.name}"`,
            icon: 'info',
            timer: 3000,
            showConfirmButton: false
          })
        } else {
          await updateDoc(doc(db, 'attendance_sessions', latestSession.id), {
            isActive: false
          })
          lateSession.value = false
        }
      }
    }
    // eslint-disable-next-line no-empty
  } catch (error) { }
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
      lateSession.value = false
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
    lateSession.value = false
    await Swal.fire({
      title: 'หยุดการเช็คชื่อเรียบร้อยแล้ว',
      icon: 'success',
      confirmButtonText: 'ตกลง'
    })
  }
}

onMounted(() => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      userEmail.value = user.email
      await checkActiveSession()
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
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
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
  if (!sessionId.value) return
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
          const stuRef = doc(db, 'students', rec.studentId)
          const stuSnap = await getDoc(stuRef)
          if (stuSnap.exists()) {
            name = stuSnap.data().name
          }
        } catch (e) { /* ignore */ }
      }
      return { ...rec, name }
    }))
    attendeesList.value = withName
  }, (error) => {
    console.error('Error listening to attendance:', error)
  })
}

// ฟังก์ชัน "เช็คชื่อปกติ"
async function startSession() {
  if (sessionName.value.trim() === '') {
    Swal.fire('กรุณากรอกชื่อเซสชันก่อนเริ่ม', '', 'warning')
    return
  }
  if (durationMinutes.value <= 0) {
    Swal.fire('กรุณากรอกเวลาที่ถูกต้อง', '', 'warning')
    return
  }
  try {
    lateSession.value = false
    const docRef = await addDoc(collection(db, 'attendance_sessions'), {
      name: sessionName.value.trim(),
      createdAt: serverTimestamp(),
      createdBy: userEmail.value,
      isActive: true,
      duration: durationMinutes.value * 60,
      isLateRound: false
    })
    sessionId.value = docRef.id
    sessionStarted.value = true
    countdown.value = durationMinutes.value * 60
    startCountdown()
    Swal.fire({
      title: 'เริ่มเซสชันการเช็คชื่อเรียบร้อยแล้ว',
      text: `เซสชัน "${sessionName.value}" กำลังดำเนินการ`,
      icon: 'success',
      timer: 2000,
      showConfirmButton: false
    })
  } catch (error) {
    Swal.fire('เกิดข้อผิดพลาดในการสร้างเซสชัน', error.message, 'error')
  }
}


</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Header -->
    <header class="bg-white shadow-lg relative z-10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-6">
          <router-link to="/admin" class="flex-shrink-0 block">
            <h1 class="text-3xl font-bold text-green-700">ระบบเช็คชื่อและให้คะแนน</h1>
            <h1 class="text-xl text-gray-500">CP352201 & SC362201 Web Design Technologies</h1>
          </router-link>
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
    <main class="max-w-6xl mx-auto p-8 relative">
      <div class="text-center mb-8">
        <h2 class="text-4xl font-bold text-gray-800 mb-2">ระบบเช็คชื่อออนไลน์</h2>
        <p class="text-gray-600">สร้างและจัดการการเช็คชื่อสำหรับนักเรียน</p>
      </div>

      <!-- Create Session Card -->
      <div class="bg-white rounded-2xl shadow-xl p-8 mb-8">
        <h3 class="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          {{ sessionStarted
            ? lateSession
              ? 'เซสชันปัจจุบัน (รอบคนมาสาย)'
              : 'เซสชันปัจจุบัน'
            : 'สร้างการเช็คชื่อใหม่' }}
        </h3>

        <div v-if="!sessionStarted" class="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <label class="block text-gray-700 font-semibold mb-3">ชื่อการเช็คชื่อ</label>
            <input v-model="sessionName" type="text"
              class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              placeholder="เช่น การบรรยายสัปดาห์ที่ 5" />
          </div>
          <div>
            <label class="block text-gray-700 font-semibold mb-3">ระยะเวลา (นาที)</label>
            <input v-model.number="durationMinutes" type="number" min="1"
              class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all" />
          </div>
        </div>


        <div v-if="!sessionStarted">
          <button @click="startSession"
            class="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1 font-semibold">
            เริ่มเช็คชื่อ
          </button>
         
        </div>
        <!-- Session Info when active -->
        <div v-if="sessionStarted"
          class="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h4 class="text-xl font-bold text-gray-800">"{{ sessionName }}{{ lateSession ? ' (รอบคนมาสาย)' : '' }}"
              </h4>
              <p class="text-gray-600">Session ID: {{ sessionId }}</p>
              <p v-if="lateSession" class="text-orange-600 font-bold text-xs mt-1">
                รอบคนมาสาย: ผู้เช็คชื่อจะได้ 0.5 คะแนน
              </p>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold text-blue-600">{{ formatTime(countdown) }}</div>
              <p class="text-sm text-gray-600">เวลาที่เหลือ</p>
            </div>
          </div>

          <div class="flex space-x-3">
            <button @click="stopSession"
              class="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 font-semibold text-sm">
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

      <div v-if="sessionStarted" class="bg-white rounded-2xl shadow-xl p-8">
        <div class="text-center mb-8">
          <div class="inline-flex items-center bg-green-100 text-green-800 px-4 py-2 rounded-full font-semibold mb-4">
            <div class="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            การเช็คชื่อกำลังดำเนินอยู่
          </div>
        </div>
        <div
          class="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-300 p-8 rounded-2xl text-center">
          <p class="text-gray-700 mb-4 font-semibold">QR Code สำหรับการเช็คชื่อ</p>
          <div class="bg-white p-4 rounded-xl inline-block shadow-lg">
            <QRCodeVue :value="`http://localhost:5173/attendance/checkclass/${sessionId}`" :size="200" />
          </div>
          <p class="text-sm text-gray-600 mt-4">แชร์ QR Code นี้ให้นักเรียนสแกนเพื่อเช็คชื่อ</p>
          <p class="text-sm text-blue-600 mt-4 break-all">
            ลิงก์สำหรับเช็คชื่อ: <br />
            <a :href="`http://localhost:5173/attendance/checkclass/${sessionId}`" target="_blank"
              class="underline hover:text-blue-800">
              http://localhost:5173/attendance/checkclass/{{ sessionId }}
            </a>
          </p>
        </div>
      </div>
    </main>

    <button @click="toggleSidebar"
      class="fixed top-1/2 right-6 transform -translate-y-1/2 bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-full shadow-2xl hover:from-green-600 hover:to-emerald-700 transition-all duration-300 z-50 group"
      :class="{ 'right-96': sidebarVisible }">
      <div class="flex items-center">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span class="ml-2 font-semibold whitespace-nowrap">{{ attendeesList.length }}</span>
      </div>
      <div
        class="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-2 rounded-lg text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
        รายชื่อผู้เข้าร่วม
      </div>
    </button>

    <div v-if="sidebarVisible" class="fixed inset-0 z-40" @click="closeSidebar">
      <div class="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"></div>
      <div
        class="absolute top-4 right-4 bottom-4 w-96 bg-white rounded-2xl shadow-2xl flex flex-col transform transition-transform duration-300"
        @click.stop>
        <div
          class="p-6 border-b border-gray-200 rounded-t-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white">
          <div class="flex items-center justify-between">
            <h3 class="text-xl font-bold flex items-center">
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
              {{ sessionStarted ? (lateSession ? 'รอบคนมาสาย' : 'กำลังเช็คชื่อ') : 'รอเริ่มต้น' }}
            </span>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="attendeesList.length === 0" class="p-8 text-center">
            <div class="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 919.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p class="text-gray-600 text-lg font-medium">ยังไม่มีผู้เข้าร่วม</p>
            <p class="text-sm text-gray-500 mt-2">เมื่อมีการเช็คชื่อจะแสดงที่นี่</p>
          </div>

          <div v-else class="p-4 space-y-3">
            <div v-for="(attendee, index) in attendeesList" :key="attendee.id"
              class="rounded-xl p-4 border transition-all duration-200" :class="[attendee.status === 'late' || attendee.score === 0.5
                ? 'bg-orange-50 border-orange-300'
                : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200',
                'hover:shadow-md'
              ]">
              <div class="flex items-center">
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" :class="attendee.status === 'late' || attendee.score === 0.5
                  ? 'bg-orange-400'
                  : 'bg-gradient-to-br from-green-400 to-emerald-500'">
                  {{ index + 1 }}
                </div>
                <div class="ml-4 flex-1">
                  <p class="font-semibold text-gray-800">
                    {{ attendee.name || 'ไม่ระบุชื่อ' }}
                    <span v-if="attendee.status === 'late' || attendee.score === 0.5"
                      class="text-orange-500 text-xs font-bold ml-2">
                      (มาสาย)
                    </span>
                  </p>
                  <p class="text-sm text-gray-600">{{ attendee.studentId || 'ไม่ระบุรหัส' }}</p>
                  <div class="flex items-center mt-1">
                    <svg class="w-3 h-3"
                      :class="attendee.status === 'late' || attendee.score === 0.5 ? 'text-orange-500' : 'text-green-500'"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span class="text-xs font-medium"
                      :class="attendee.status === 'late' || attendee.score === 0.5 ? 'text-orange-600' : 'text-green-600'">
                      {{ formatTimestamp(attendee.timestamp) || 'ไม่ได้เช็คชื่อ' }}
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