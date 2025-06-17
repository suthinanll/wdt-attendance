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
  sessionId: String // Expecting sessionId as a prop from router
})

const route = useRoute()
const router = useRouter()
const db = getFirestore()

const sessionInfo = ref(null)
const attendees = ref([])
const loading = ref(true)
const error = ref(null)
let unsubscribe = null

// Function to format timestamp for display
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

async function fetchSessionAndAttendance() {
  loading.value = true
  error.value = null
  const currentSessionId = props.sessionId || route.params.sessionId

  if (!currentSessionId) {
    error.value = 'ไม่พบรหัสเซสชัน'
    loading.value = false
    return
  }

  // 1. ดึงข้อมูลเซสชัน
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

  // 2. ฟังการเปลี่ยนแปลงของ attendance_records (Real-time listener)
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

    // ดึงชื่อนักศึกษาจาก collection 'students' หากยังไม่มีใน record
    const attendeesWithNames = await Promise.all(records.map(async (rec) => {
      let name = rec.name || ''
      if (!name && rec.studentId) {
        try {
          const stuRef = doc(db, 'students', rec.studentId)
          const stuSnap = await getDoc(stuRef)
          if (stuSnap.exists()) {
            name = stuSnap.data().name
          }
        } catch (e) {
          console.warn('Could not fetch student name for ID:', rec.studentId, e)
        }
      }
      return { ...rec, name }
    }))
    attendees.value = attendeesWithNames
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

watch(() => props.sessionId, (newSessionId, oldSessionId) => {
  if (newSessionId && newSessionId !== oldSessionId) {
    fetchSessionAndAttendance()
  }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-6">
      <!-- Header -->
      <div class="mb-6 flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-800">รายละเอียดการเช็คชื่อ</h1>
        <button
          @click="router.back()"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          กลับ
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="text-center py-10">
        <p class="text-gray-600">กำลังโหลดข้อมูล...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-10 text-red-600">
        <p>{{ error }}</p>
      </div>

      <!-- Content -->
      <div v-else>
        <!-- Session Information -->
        <div class="mb-6 p-4 bg-blue-50 rounded-lg">
          <h2 class="text-xl font-semibold text-blue-800 mb-2">ข้อมูลเซสชัน</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-gray-600"><strong>รหัสเซสชัน:</strong> {{ sessionInfo.id }}</p>
              <p class="text-gray-600"><strong>วันที่:</strong> {{ formatTimestamp(sessionInfo.createdAt) }}</p>
            </div>
            <div>
              <p class="text-gray-600"><strong>สถานะ:</strong> {{ sessionInfo.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน' }}</p>
              <p class="text-gray-600"><strong>จำนวนผู้เข้าร่วม:</strong> {{ attendees.length }} คน</p>
            </div>
          </div>
        </div>

        <!-- Attendees List -->
        <div>
          <h2 class="text-xl font-semibold text-gray-800 mb-4">รายชื่อผู้เข้าร่วม</h2>
          <div v-if="attendees.length === 0" class="text-center py-6 text-gray-500">
            <p>ยังไม่มีผู้เข้าร่วมในเซสชันนี้</p>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-gray-100">
                  <th class="p-3 text-sm font-semibold text-gray-700">ลำดับ</th>
                  <th class="p-3 text-sm font-semibold text-gray-700">รหัสนักศึกษา</th>
                  <th class="p-3 text-sm font-semibold text-gray-700">ชื่อ</th>
                  <th class="p-3 text-sm font-semibold text-gray-700">เวลาที่เช็คชื่อ</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(attendee, index) in attendees"
                  :key="attendee.id"
                  class="border-b hover:bg-gray-50"
                >
                  <td class="p-3 text-gray-700">{{ index + 1 }}</td>
                  <td class="p-3 text-gray-700">{{ attendee.studentId || '-' }}</td>
                  <td class="p-3 text-gray-700">{{ attendee.name || 'ไม่พบชื่อ' }}</td>
                  <td class="p-3 text-gray-700">{{ formatTimestamp(attendee.timestamp) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
table {
  border-spacing: 0;
}
th, td {
  border-bottom: 1px solid #e2e8f0;
}
</style> เขียนในนี้ด้วยว่ามาสาย