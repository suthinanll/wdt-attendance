<!-- src/views/AttendanceDetailsView.vue -->
<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDoc,
  doc
} from 'firebase/firestore'

const props = defineProps({
  sessionId: String
})

const route = useRoute()
const router = useRouter()
const db = getFirestore()

const sessionInfo = ref(null)
const attendees = ref([])
const loading = ref(true)
const error = ref(null)
let unsubscribe = null

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

function getAttendanceStatusText(attendee) {
  if (typeof attendee.score === 'undefined') {
    return { text: 'N/A', class: 'text-gray-500' }
  }

  let statusText = `${attendee.score} คะแนน`
  let cssClass = attendee.score === 1 ? 'text-green-600' : 'text-orange-600' // orange for 0.5

  // Based on the logic in CheckClassView:
  // score 1 means status 'on-time'
  // score 0.5 means status 'late'
  if (attendee.status === 'on-time' || attendee.score === 1) {
    statusText += ' (มาทันเวลา)'
  } else if (attendee.status === 'late' || attendee.score === 0.5) {
    statusText += ' (มาสาย)'
  }
  // Removed 'late-round' and its fallback, as it's no longer a separate concept.

  return { text: statusText, class: cssClass }
}

async function fetchSessionAndAttendance() {
  loading.value = true
  error.value = null
  const currentSessionId = props.sessionId || route.params.sessionId

  if (!currentSessionId) {
    error.value = 'ไม่พบรหัสเซสชัน'
    loading.value = false
    return
  }

  try {
    const sessionDoc = await getDoc(doc(db, 'attendance_sessions', currentSessionId))
    if (sessionDoc.exists()) {
      sessionInfo.value = { id: sessionDoc.id, ...sessionDoc.data() }
    } else {
      error.value = 'ไม่พบข้อมูลเซสชัน'
      loading.value = false
      return
    }
  } catch (e) {
    console.error('Error fetching session info:', e)
    error.value = 'เกิดข้อผิดพลาดในการดึงข้อมูลเซสชัน'
    loading.value = false
    return
  }

  if (unsubscribe) {
    unsubscribe()
  }

  const q = query(
    collection(db, 'attendance_records'),
    where('sessionId', '==', currentSessionId),
    orderBy('timestamp', 'asc')
  )

  unsubscribe = onSnapshot(q, async (snapshot) => {
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    const attendeesWithDetails = await Promise.all(records.map(async (rec) => {
      let name = rec.name || ''
      let major = rec.major || ''
      if (!name || !major) {
        try {
          const stuRef = doc(db, 'students', rec.studentId)
          const stuSnap = await getDoc(stuRef)
          if (stuSnap.exists()) {
            const studentData = stuSnap.data()
            name = name || studentData.name || 'ไม่พบชื่อนักเรียน'
            major = major || studentData.major || 'ไม่พบสาขา'
          } else {
            name = name || 'ไม่พบชื่อนักเรียน'
            major = major || 'ไม่พบสาขา'
          }
        } catch (e) {
          console.warn('Could not fetch student details for ID:', rec.studentId, e)
          name = name || 'Error fetching name'
          major = major || 'Error fetching major'
        }
      }
      const attendanceDisplay = getAttendanceStatusText(rec)
      return { ...rec, name, major, attendanceDisplay }
    }))
    attendees.value = attendeesWithDetails
    loading.value = false
  }, (e) => {
    console.error('Error listening to attendance records:', e)
    error.value = 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้เข้าร่วม'
    loading.value = false
  })
}

onMounted(() => {
  fetchSessionAndAttendance()
})

onBeforeUnmount(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})

watch(() => props.sessionId, (newSessionId) => {
  if (newSessionId) {
    fetchSessionAndAttendance()
  }
}, { immediate: !route.params.sessionId })

watch(() => route.params.sessionId, (newSessionId) => {
  if (newSessionId && newSessionId !== (sessionInfo.value ? sessionInfo.value.id : null)) {
    fetchSessionAndAttendance()
  }
}, { immediate: !props.sessionId })
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
    <div class="max-w-5xl mx-auto bg-white rounded-xl shadow-2xl p-6 md:p-8">
      <!-- Header -->
      <div class="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h1 class="text-3xl font-bold text-gray-800">รายละเอียดการเช็คชื่อ</h1>
          <p v-if="sessionInfo" class="text-gray-600">เซสชัน: <span class="font-semibold">{{ sessionInfo.week ? `สัปดาห์ที่ ${sessionInfo.week}` : `เซสชัน (${formatTimestamp(sessionInfo.createdAt)})` }}</span>
          </p>
        </div>
        <button @click="router.back()"
          class="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg text-sm font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block mr-1 -mt-0.5" viewBox="0 0 20 20"
            fill="currentColor">
            <path fill-rule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clip-rule="evenodd" />
          </svg>
          กลับ
        </button>
      </div>

      <div v-if="loading" class="text-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="text-gray-600 mt-4 text-lg">กำลังโหลดข้อมูลเซสชัน...</p>
      </div>

      <div v-else-if="error" class="text-center py-12">
        <div class="bg-red-50 p-6 rounded-lg inline-block">
          <svg class="w-12 h-12 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-700 text-xl font-medium">{{ error }}</p>
          <p class="text-red-600 mt-1">กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ</p>
        </div>
      </div>

      <div v-else-if="sessionInfo">
        <div class="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-100 rounded-xl shadow-lg">
          <h2 class="text-2xl font-semibold text-blue-800 mb-4">ข้อมูลเซสชัน</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
            <div>
              <p class="text-gray-500">ID เซสชัน:</p>
              <p class="text-gray-800 font-medium break-all">{{ sessionInfo.id }}</p>
            </div>
            <div>
              <p class="text-gray-500">สร้างโดย:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.createdBy }}</p>
            </div>
            <div>
              <p class="text-gray-500">วันที่สร้าง:</p>
              <p class="text-gray-800 font-medium">{{ formatTimestamp(sessionInfo.createdAt) }}</p>
            </div>
            <div>
              <p class="text-gray-500">สถานะ:</p>
              <p class="font-medium" :class="sessionInfo.isActive ? 'text-green-600' : 'text-red-600'">
                {{ sessionInfo.isActive ? 'เปิดใช้งานอยู่' : 'ปิดใช้งานแล้ว' }}
              </p>
            </div>
            <div>
              <p class="text-gray-500">ระยะเวลาทั้งหมด:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.duration ? (sessionInfo.duration / 60) + ' นาที' :
                'N/A' }}</p>
            </div>
            <div v-if="sessionInfo.onTimeDurationSeconds">
              <p class="text-gray-500">เวลาสำหรับคะแนนเต็ม:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.onTimeDurationSeconds / 60 }} นาที</p>
            </div>
            <div>
              <p class="text-gray-500">จำนวนผู้เข้าร่วม:</p>
              <p class="text-gray-800 font-semibold text-lg">{{ attendees.length }} คน</p>
            </div>
          </div>
        </div>

        <div>
          <h2 class="text-2xl font-semibold text-gray-800 mb-6">รายชื่อผู้เข้าร่วม</h2>
          <div v-if="attendees.length === 0" class="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
            <svg class="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p class="text-lg">ยังไม่มีผู้เข้าร่วมในเซสชันนี้</p>
          </div>
          <div v-else class="overflow-x-auto bg-white rounded-lg shadow-md">
            <table class="w-full text-left border-collapse">
              <thead class="bg-gray-100">
                <tr>
                  <th class="p-3 text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider">#</th>
                  <th class="p-3 text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider">รหัสนักศึกษา
                  </th>
                  <th class="p-3 text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider">ชื่อ-สกุล</th>
                  <th class="p-3 text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider">สาขา</th>
                  <th class="p-3 text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider">
                    เวลาที่เช็คชื่อ</th>
                  <th class="p-3 text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider">คะแนน/สถานะ
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="(attendee, index) in attendees" :key="attendee.id"
                  class="hover:bg-gray-50 transition-colors duration-150" :class="{
                    'bg-orange-50 hover:bg-orange-100': attendee.score === 0.5, // Orange for late
                    'bg-green-50 hover:bg-green-100': attendee.score === 1    // Green for on-time
                  }">
                  <td class="p-3 text-sm text-gray-700">{{ index + 1 }}</td>
                  <td class="p-3 text-sm text-gray-700 font-medium">{{ attendee.studentId || '-' }}</td>
                  <td class="p-3 text-sm text-gray-800">{{ attendee.name || 'ไม่พบชื่อ' }}</td>
                  <td class="p-3 text-sm text-gray-800">{{ attendee.major || 'ไม่พบสาขา' }}</td>
                  <td class="p-3 text-sm text-gray-600">{{ formatTimestamp(attendee.checkedAt || attendee.timestamp) }}
                  </td>
                  <td class="p-3 text-sm font-semibold" :class="attendee.attendanceDisplay.class">
                    {{ attendee.attendanceDisplay.text }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div v-else-if="!loading && !error" class="text-center py-10 text-gray-500">
        <p>ไม่พบข้อมูลสำหรับเซสชันนี้</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Optional styles can go here */
</style>