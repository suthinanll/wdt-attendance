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
  let cssClass = attendee.score === 1 ? 'text-green-600' : 'text-orange-600'

  if (attendee.status === 'on-time' || attendee.score === 1) {
    statusText += ' (มาทันเวลา)'
  } else if (attendee.status === 'late' || attendee.score === 0.5) {
    statusText += ' (มาสาย)'
  }

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
    const records = snapshot.docs.map(docSnap => ({ // Renamed doc to docSnap to avoid conflict
      id: docSnap.id,
      ...docSnap.data()
    }))

    const attendeesWithDetails = await Promise.all(records.map(async (rec) => {
      let name = rec.name || ''
      let studentMajor = rec.major || '' // Renamed to studentMajor to differentiate from session major
      if (!name || !studentMajor) { // Ensure we try to fetch if either is missing
        if (rec.studentId) { // Only try to fetch if studentId is present
            try {
            const stuRef = doc(db, 'students', rec.studentId) // Use doc directly
            const stuSnap = await getDoc(stuRef)
            if (stuSnap.exists()) {
                const studentData = stuSnap.data()
                name = name || studentData.name || 'ไม่พบชื่อนักเรียน'
                studentMajor = studentMajor || studentData.major || 'ไม่พบสาขา'
            } else {
                name = name || 'ไม่พบชื่อนักเรียน'
                studentMajor = studentMajor || 'ไม่พบสาขา'
            }
            } catch (e) {
            console.warn('Could not fetch student details for ID:', rec.studentId, e)
            name = name || 'Error fetching name'
            studentMajor = studentMajor || 'Error fetching major'
            }
        } else {
            name = name || 'ไม่ระบุชื่อ (ไม่มีรหัส)'
            studentMajor = studentMajor || 'ไม่ระบุสาขา (ไม่มีรหัส)'
        }
      }
      const attendanceDisplay = getAttendanceStatusText(rec)
      // Use studentMajor for the attendee's major in the table
      return { ...rec, name, major: studentMajor, attendanceDisplay }
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
  if (newSessionId && newSessionId !== (sessionInfo.value ? sessionInfo.value.id : null)) { // Check if newSessionId is different
    fetchSessionAndAttendance()
  }
}, { immediate: !route.params.sessionId }) // immediate only if not coming from route params initially

watch(() => route.params.sessionId, (newSessionId) => {
  if (newSessionId && newSessionId !== (sessionInfo.value ? sessionInfo.value.id : null)) {
    fetchSessionAndAttendance()
  }
}, { immediate: !props.sessionId }) // immediate only if not coming from props initially
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 sm:p-4 md:p-8">
    <div class="max-w-5xl mx-auto bg-white rounded-xl shadow-2xl p-4 sm:p-6 md:p-8">
      <!-- Header -->
      <div class="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div class="w-full sm:w-auto">
          <h1 class="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 break-words">รายละเอียดการเช็คชื่อ</h1>
          <p v-if="sessionInfo" class="text-sm sm:text-base text-gray-600 mt-1 break-words">
            เซสชัน:
            <span class="font-semibold">
              {{ sessionInfo.week ? `สัปดาห์ที่ ${sessionInfo.week}` : `เซสชันวันที่ ${formatTimestamp(sessionInfo.createdAt)}` }}
            </span>
            <!-- แสดงสาขาของเซสชัน -->
            <span v-if="sessionInfo.major" class="font-normal text-gray-500 block sm:inline">
              ({{ sessionInfo.major }})
            </span>
          </p>
        </div>
        <button @click="router.back()"
          class="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg text-sm font-medium flex-shrink-0 flex items-center justify-center">

          กลับ
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-8 sm:py-12">
        <div class="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p class="text-gray-600 mt-3 sm:mt-4 text-base sm:text-lg">กำลังโหลดข้อมูลเซสชัน...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-8 sm:py-12">
        <div class="bg-red-50 p-4 sm:p-6 rounded-lg inline-block max-w-md mx-auto">
          <svg class="w-8 h-8 sm:w-12 sm:h-12 text-red-500 mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-700 text-lg sm:text-xl font-medium break-words">{{ error }}</p>
          <p class="text-red-600 mt-1 text-sm sm:text-base">กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ</p>
        </div>
      </div>

      <!-- Main Content -->
      <div v-else-if="sessionInfo">
        <!-- Session Info -->
        <div class="mb-6 sm:mb-8 p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-100 rounded-xl shadow-lg">
          <h2 class="text-lg sm:text-xl md:text-2xl font-semibold text-blue-800 mb-3 sm:mb-4">ข้อมูลเซสชัน</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-4 text-xs sm:text-sm">
            <div class="break-words">
              <p class="text-gray-500 mb-1">ID เซสชัน:</p>
              <p class="text-gray-800 font-medium break-all">{{ sessionInfo.id }}</p>
            </div>
            <div class="break-words">
              <p class="text-gray-500 mb-1">สร้างโดย:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.createdBy }}</p>
            </div>
            <div class="break-words">
              <p class="text-gray-500 mb-1">วันที่สร้าง:</p>
              <p class="text-gray-800 font-medium">{{ formatTimestamp(sessionInfo.createdAt) }}</p>
            </div>
            <!-- เพิ่มการแสดงสาขาวิชาของเซสชัน -->
            <div v-if="sessionInfo.major" class="break-words">
              <p class="text-gray-500 mb-1">สาขาวิชา:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.major }}</p>
            </div>
            <div v-if="sessionInfo.week">
              <p class="text-gray-500 mb-1">สัปดาห์ที่:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.week }}</p>
            </div>
            <div>
              <p class="text-gray-500 mb-1">สถานะ:</p>
              <p class="font-medium" :class="sessionInfo.isActive ? 'text-green-600' : 'text-red-600'">
                {{ sessionInfo.isActive ? 'เปิดใช้งานอยู่' : 'ปิดใช้งานแล้ว' }}
              </p>
            </div>
            <div>
              <p class="text-gray-500 mb-1">ระยะเวลาทั้งหมด:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.duration ? (sessionInfo.duration / 60) + ' นาที' : 'N/A' }}</p>
            </div>
            <div v-if="sessionInfo.onTimeDurationSeconds">
              <p class="text-gray-500 mb-1">เวลาสำหรับคะแนนเต็ม:</p>
              <p class="text-gray-800 font-medium">{{ sessionInfo.onTimeDurationSeconds / 60 }} นาที</p>
            </div>
            <div>
              <p class="text-gray-500 mb-1">จำนวนผู้เข้าร่วม:</p>
              <p class="text-gray-800 font-semibold text-base sm:text-lg">{{ attendees.length }} คน</p>
            </div>
          </div>
        </div>

        <!-- Attendees Section -->
        <div>
          <h2 class="text-lg sm:text-xl md:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">รายชื่อผู้เข้าร่วม</h2>
          
          <!-- No Attendees -->
          <div v-if="attendees.length === 0" class="text-center py-8 sm:py-10 text-gray-500 bg-gray-50 rounded-lg">
            <svg class="w-8 h-8 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p class="text-base sm:text-lg">ยังไม่มีผู้เข้าร่วมในเซสชันนี้</p>
          </div>
          
          <!-- Has Attendees -->
          <div v-else>
            <!-- Attendees Table - Desktop -->
            <div class="hidden md:block overflow-x-auto bg-white rounded-lg shadow-md">
              <table class="w-full text-left border-collapse">
                <thead class="bg-gray-100">
                  <tr>
                    <th class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">#</th>
                    <th class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">รหัสนักศึกษา</th>
                    <th class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">ชื่อ-สกุล</th>
                    <th class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">สาขา (นักศึกษา)</th>
                    <th class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">เวลาที่เช็คชื่อ</th>
                    <th class="p-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">คะแนน/สถานะ</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  <tr v-for="(attendee, index) in attendees" :key="attendee.id"
                    class="hover:bg-gray-50 transition-colors duration-150" :class="{
                      'bg-orange-50 hover:bg-orange-100': attendee.score === 0.5,
                      'bg-green-50 hover:bg-green-100': attendee.score === 1
                    }">
                    <td class="p-3 text-sm text-gray-700 tabular-nums">{{ index + 1 }}</td>
                    <td class="p-3 text-sm text-gray-700 font-medium">{{ attendee.studentId || '-' }}</td>
                    <td class="p-3 text-sm text-gray-800">{{ attendee.name || 'ไม่พบชื่อ' }}</td>
                    <td class="p-3 text-sm text-gray-800">{{ attendee.major || 'ไม่พบสาขา' }}</td>
                    <td class="p-3 text-sm text-gray-600 tabular-nums">{{ formatTimestamp(attendee.checkedAt || attendee.timestamp) }}</td>
                    <td class="p-3 text-sm font-semibold" :class="attendee.attendanceDisplay.class">
                      {{ attendee.attendanceDisplay.text }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Attendees Cards - Mobile/Tablet -->
            <div class="md:hidden space-y-3 sm:space-y-4">
              <div v-for="(attendee, index) in attendees" :key="attendee.id"
                class="bg-white rounded-lg shadow-md p-4 border-l-4 transition-colors duration-150" 
                :class="{
                  'border-orange-400 bg-orange-50': attendee.score === 0.5,
                  'border-green-400 bg-green-50': attendee.score === 1,
                  'border-gray-300': attendee.score !== 0.5 && attendee.score !== 1
                }">
                
                <div class="flex justify-between items-start mb-3">
                  <div class="flex-1 min-w-0">
                    <h3 class="text-sm sm:text-base font-semibold text-gray-800 truncate">
                      {{ attendee.name || 'ไม่พบชื่อ' }}
                    </h3>
                    <p class="text-xs sm:text-sm text-gray-600 mt-1">
                      รหัส: {{ attendee.studentId || '-' }}
                    </p>
                  </div>
                  <div class="flex-shrink-0 ml-3">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
                      :class="attendee.attendanceDisplay.class">
                      {{ attendee.attendanceDisplay.text }}
                    </span>
                  </div>
                </div>
                
                <div class="grid grid-cols-1 gap-2 text-xs sm:text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">ลำดับที่:</span>
                    <span class="text-gray-700 font-medium">{{ index + 1 }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">สาขา:</span>
                    <span class="text-gray-700 break-words text-right">{{ attendee.major || 'ไม่พบสาขา' }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-500">เวลาเช็คชื่อ:</span>
                    <span class="text-gray-700 tabular-nums text-right text-xs">
                      {{ formatTimestamp(attendee.checkedAt || attendee.timestamp) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- No Data -->
      <div v-else class="text-center py-8 sm:py-10 text-gray-500">
        <p class="text-sm sm:text-base">ไม่พบข้อมูลสำหรับเซสชันนี้</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Optional styles can go here */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}

/* Custom breakpoint utilities */
@media (max-width: 640px) {
  .break-words {
    word-break: break-word;
    overflow-wrap: break-word;
  }
}

/* Ensure text doesn't overflow on very small screens */
.truncate-mobile {
  @apply truncate;
}

@media (min-width: 640px) {
  .truncate-mobile {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
  }
}
</style>