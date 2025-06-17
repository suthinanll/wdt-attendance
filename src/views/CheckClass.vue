<!-- eslint-disable no-unused-vars -->
<!-- หน้านี้คือ /attendance/checkclass/[sessionId] -->

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDoc,
  doc,
  query,
  where,
  getDocs,
  updateDoc,
} from 'firebase/firestore'

const db = getFirestore()
const route = useRoute()
const router = useRouter()

const sessionId = route.params.sessionId
const studentId = ref('')
const loading = ref(false)
const formDisabled = ref(false)

const session = ref(null)
const errorMessage = ref('')

async function fetchSessionInfo() {
  if (!sessionId) {
    errorMessage.value = 'Session ID ไม่ถูกต้อง'
    return
  }
  try {
    const sessionDoc = await getDoc(doc(db, 'attendance_sessions', sessionId))
    if (!sessionDoc.exists()) {
      errorMessage.value = 'ไม่พบเซสชันนี้'
      return
    }
    session.value = { id: sessionDoc.id, ...sessionDoc.data() }
    // ⭐ ทำให้แน่ใจว่า isLateRound ปลอดภัย
    if (typeof session.value.isLateRound === 'undefined') session.value.isLateRound = false

    // ตรวจสอบสถานะ isActive
    if (!session.value.isActive) {
      errorMessage.value = 'หมดเวลาการเช็คชื่อแล้ว (เซสชันถูกปิด)'
      return
    }

    // ตรวจสอบเวลาที่เหลืออยู่
    if (session.value.createdAt && session.value.duration) {
      const createdAt = session.value.createdAt.toDate()
      const now = new Date()
      const elapsedSeconds = Math.floor((now - createdAt) / 1000)
      const remainingSeconds = session.value.duration - elapsedSeconds

      if (remainingSeconds <= 0) {
        errorMessage.value = 'หมดเวลาการเช็คชื่อแล้ว (เวลาเซสชันหมด)'
        await updateDoc(doc(db, 'attendance_sessions', sessionId), { isActive: false })
        return
      }
    }

    // console.log('ข้อมูลเซสชัน:', session.value)
  } catch (e) {
     
    console.error('Error fetching session:', e)
    errorMessage.value = 'เกิดข้อผิดพลาดในการดึงข้อมูลเซสชัน'
  }
}

// ฟังก์ชันตรวจสอบว่านักศึกษาคนนี้เช็คชื่อเซสชันนี้ไปแล้วหรือยัง
async function alreadyChecked(sid) {
  const q = query(
    collection(db, 'attendance_records'),
    where('sessionId', '==', sessionId),
    where('studentId', '==', sid)
  )
  const snap = await getDocs(q)
  return !snap.empty
}

async function checkIn() {
  const sid = studentId.value.trim()
  if (!sid) {
    Swal.fire('กรุณากรอกรหัสนักศึกษา', '', 'warning')
    return
  }

  if (!session.value || errorMessage.value) {
    Swal.fire('ไม่สามารถเช็คชื่อได้', errorMessage.value || 'ไม่พบข้อมูลเซสชันที่ถูกต้อง', 'error')
    return
  }

  loading.value = true
  try {
    // ตรวจสอบว่าเช็คชื่อไปแล้วหรือยัง
    if (await alreadyChecked(sid)) {
      Swal.fire({
        title: 'คุณได้เช็คชื่อไปแล้ว',
        text: 'สำหรับเซสชันนี้',
        icon: 'info',
        confirmButtonText: 'ตกลง'
      })
      formDisabled.value = true
      return
    }

    // ตรวจสอบนักศึกษามีจริง
    const stuRef = doc(db, 'students', sid)
    const stuSnap = await getDoc(stuRef)
    if (!stuSnap.exists()) {
      Swal.fire({
        title: 'ไม่พบรหัสนักศึกษานี้ในระบบ',
        text: 'กรุณาตรวจสอบรหัสนักศึกษาให้ถูกต้อง',
        icon: 'error',
        confirmButtonText: 'ตกลง'
      })
      return
    }
    const stuData = stuSnap.data()

    // ⭐ คะแนนเช็คชื่อ: 1 ปกติ, 0.5 ถ้า isLateRound
    const score = session.value.isLateRound ? 0.5 : 1

    await addDoc(collection(db, 'attendance_records'), {
      sessionId: sessionId,
      sessionName: session.value.name,
      studentId: sid,
      name: stuData.name || '',
      timestamp: serverTimestamp(),
      score: score
    })

    formDisabled.value = true

    await Swal.fire({
      title: 'เช็คชื่อสำเร็จ!',
      html: `
        <div class="text-center">
          <p class="text-lg mb-2">${stuData.name ? 'ขอบคุณ คุณ ' + stuData.name : 'ขอบคุณ'}</p>
          <p class="text-sm text-gray-600">เซสชัน: ${session.value.name}</p>
          <p class="text-sm font-semibold mt-2 ${score === 0.5 ? 'text-orange-600' : 'text-green-600'}">
            ✓ ได้รับคะแนนเช็คชื่อ ${score === 0.5 ? '0.5 คะแนน (มาสาย)' : '1 คะแนน'}
          </p>
        </div>
      `,
      icon: 'success',
      confirmButtonText: 'ตกลง'
    })

  } catch (e) {
     
    console.error('Error during check-in:', e)
    Swal.fire('เกิดข้อผิดพลาด', e.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSessionInfo()
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-blue-100">
    <div class="bg-white shadow-xl rounded-xl p-8 w-full max-w-md">
      <div class="text-center mb-8">
        <h2 class="text-2xl font-bold mb-2 text-blue-800">เช็คชื่อเข้าห้องเรียน</h2>
        <div v-if="session && !errorMessage" class="text-sm text-gray-600 mt-2">
          <p class="font-semibold">{{ session.name }}</p>
          <div class="flex items-center justify-center mt-1">
            <svg v-if="session.isLateRound" class="w-4 h-4 text-orange-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <svg v-else class="w-4 h-4 text-green-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span :class="session.isLateRound ? 'text-orange-600' : 'text-green-600'" class="text-xs">
              คะแนนเช็คชื่อ: {{ session.isLateRound ? '0.5 คะแนน (มาสาย)' : '1 คะแนน' }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="text-center my-8">
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <svg class="w-8 h-8 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-700 font-medium">{{ errorMessage }}</p>
        </div>
      </div>

      <form v-if="!errorMessage" @submit.prevent="checkIn" class="space-y-6">
        <div>
          <label class="block text-gray-700 font-semibold mb-2">รหัสนักศึกษา</label>
          <input
            v-model="studentId"
            type="text"
            maxlength="15"
            class="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-100 transition-all"
            placeholder="เช่น 653XXXXX"
            :disabled="formDisabled || loading"
            autocomplete="off"
            required
          />
          <p class="text-xs text-gray-500 mt-1">กรอกรหัสนักศึกษาให้ถูกต้อง</p>
        </div>

        <button
          type="submit"
          :disabled="formDisabled || loading"
          class="bg-gradient-to-r from-blue-500 to-teal-500 text-white font-semibold px-8 py-3 rounded-xl hover:from-blue-600 hover:to-teal-600 shadow-md hover:shadow-xl transition-all w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div v-if="loading" class="flex items-center justify-center">
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            กำลังบันทึก...
          </div>
          <span v-else-if="formDisabled">✓ เช็คชื่อแล้ว</span>
          <span v-else>เช็คชื่อ</span>
        </button>
      </form>

      <div v-if="formDisabled && !errorMessage" class="text-center mt-6">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <svg class="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-green-700 font-medium">ขอบคุณที่เช็คชื่อ!</p>
          <p
            :class="session && session.isLateRound ? 'text-orange-600' : 'text-green-600'"
            class="text-sm mt-1">
            คะแนนของคุณได้รับการบันทึกแล้ว
          </p>
        </div>
      </div>
    </div>
  </div>
</template>