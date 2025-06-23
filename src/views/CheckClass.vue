<!-- eslint-disable no-unused-vars -->
<script setup>
import { ref, onMounted, computed } from 'vue'
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
  Timestamp,
} from 'firebase/firestore'

const db = getFirestore()
const route = useRoute()
const router = useRouter()

const sessionIdFromRoute = route.params.sessionId
const studentId = ref('')
const loading = ref(false)
const formDisabled = ref(false)

const sessionInfo = ref(null)
const errorMessage = ref('')
const calculatedScore = ref(0) // สำหรับเก็บคะแนนหลัง submit
const attendanceStatus = ref('') // สำหรับเก็บสถานะหลัง submit ('on-time', 'late')

async function fetchSessionInfo() {
  if (!sessionIdFromRoute) {
    errorMessage.value = 'Session ID ไม่ถูกต้อง'
    formDisabled.value = true
    return
  }
  try {
    const sessionDocRef = doc(db, 'attendance_sessions', sessionIdFromRoute)
    const sessionDocSnap = await getDoc(sessionDocRef)

    if (!sessionDocSnap.exists()) {
      errorMessage.value = 'ไม่พบเซสชันนี้'
      formDisabled.value = true
      return
    }

    const data = sessionDocSnap.data()
    sessionInfo.value = {
      id: sessionDocSnap.id,
      ...data,
      onTimeDurationSeconds: typeof data.onTimeDurationSeconds === 'number' ? data.onTimeDurationSeconds : 0,
      duration: typeof data.duration === 'number' ? data.duration : 0,
    }

    if (!sessionInfo.value.isActive) {
      errorMessage.value = 'หมดเวลาการเช็คชื่อแล้ว '
      formDisabled.value = true
      return
    }

    if (sessionInfo.value.createdAt && sessionInfo.value.duration) {
      const createdAt = sessionInfo.value.createdAt.toDate()
      const now = new Date()
      const elapsedSeconds = Math.floor((now - createdAt) / 1000)
      const remainingSecondsInSession = sessionInfo.value.duration - elapsedSeconds

      if (remainingSecondsInSession <= 0) {
        errorMessage.value = 'หมดเวลาการเช็คชื่อแล้ว (เวลาเซสชันทั้งหมดสิ้นสุดลง)'
        formDisabled.value = true
        if (sessionInfo.value.isActive) {
          await updateDoc(sessionDocRef, { isActive: false })
        }
        return
      }
    } else {
      errorMessage.value = 'ข้อมูลเซสชันไม่สมบูรณ์ ไม่สามารถคำนวณเวลาได้'
      formDisabled.value = true
      return
    }
  } catch (e) {
    console.error('Error fetching session:', e)
    errorMessage.value = 'เกิดข้อผิดพลาดในการดึงข้อมูลเซสชัน: ' + e.message
    formDisabled.value = true
  }
}

async function alreadyChecked(sId) {
  if (!sId || !sessionIdFromRoute) return false
  const q = query(
    collection(db, 'attendance_records'),
    where('sessionId', '==', sessionIdFromRoute),
    where('studentId', '==', sId.trim())
  )
  const snap = await getDocs(q)
  if (!snap.empty) {
    // ถ้าเช็คไปแล้ว ดึงข้อมูลการเช็คครั้งนั้นมาแสดง
    const checkedRecord = snap.docs[0].data()
    calculatedScore.value = checkedRecord.score
    attendanceStatus.value = checkedRecord.status
    return true
  }
  return false
}

const checkInDetails = computed(() => {
  if (!sessionInfo.value || !sessionInfo.value.createdAt) {
    return { score: 0, status: 'error', message: 'ข้อมูลเซสชันไม่พร้อม' }
  }

  const sessionCreatedAt = sessionInfo.value.createdAt.toDate()
  const currentTime = new Date()
  const timeDifferenceSeconds = (currentTime.getTime() - sessionCreatedAt.getTime()) / 1000
  const onTimeWindowSeconds = sessionInfo.value.onTimeDurationSeconds

  if (onTimeWindowSeconds > 0 && timeDifferenceSeconds <= onTimeWindowSeconds) {
    return { score: 1, status: 'on-time', message: '1 คะแนน (มาทันเวลา)' }
  } else {
    return { score: 0.5, status: 'late', message: '0.5 คะแนน (มาสาย)' }
  }
})

async function submitCheckIn() {
  const sIdValue = studentId.value.trim()
  if (!sIdValue) {
    Swal.fire('กรุณากรอกรหัสนักศึกษา', '', 'warning')
    return
  }

  if (!sessionInfo.value || errorMessage.value) {
    Swal.fire('ไม่สามารถเช็คชื่อได้', errorMessage.value || 'ไม่พบข้อมูลเซสชันที่ถูกต้อง', 'error')
    return
  }

  if (sessionInfo.value.createdAt && sessionInfo.value.duration) {
    const createdAt = sessionInfo.value.createdAt.toDate()
    const now = new Date()
    const elapsedSeconds = Math.floor((now - createdAt) / 1000)
    const remainingSecondsInSession = sessionInfo.value.duration - elapsedSeconds
    if (remainingSecondsInSession <= 0) {
      errorMessage.value = 'หมดเวลาการเช็คชื่อแล้วก่อนที่คุณจะกดส่ง'
      formDisabled.value = true
      Swal.fire('หมดเวลา', errorMessage.value, 'error')
      return
    }
  }

  loading.value = true
  try {
    if (await alreadyChecked(sIdValue)) {
      Swal.fire({
        title: 'คุณได้เช็คชื่อไปแล้ว',
        text: `สำหรับเซสชันนี้`,
        icon: 'info',
        confirmButtonText: 'ตกลง'
      })
      formDisabled.value = true
      return
    }

    const stuRef = doc(db, 'students', sIdValue)
    const stuSnap = await getDoc(stuRef)
    if (!stuSnap.exists()) {
      Swal.fire({
        title: 'ไม่พบรหัสนักศึกษานี้ในระบบ',
        text: 'กรุณาตรวจสอบรหัสนักศึกษาให้ถูกต้อง หรือติดต่อผู้สอน',
        icon: 'error',
        confirmButtonText: 'ตกลง'
      })
      return
    }
    const stuData = stuSnap.data()

    const details = checkInDetails.value
    const finalScore = details.score
    const finalStatus = details.status

    await addDoc(collection(db, 'attendance_records'), {
      sessionId: sessionIdFromRoute,
      studentId: sIdValue,
      name: stuData.name || '',
      timestamp: serverTimestamp(),
      score: finalScore,
      status: finalStatus, // 'on-time' or 'late'
      checkedAt: Timestamp.fromDate(new Date()),
    })

    formDisabled.value = true
    calculatedScore.value = finalScore // อัปเดต ref สำหรับแสดงผลหลัง submit
    attendanceStatus.value = finalStatus // อัปเดต ref สำหรับแสดงผลหลัง submit

    let scoreMessage = ''
    if (finalStatus === 'on-time') scoreMessage = '1 คะแนน (มาทันเวลา)'
    else if (finalStatus === 'late') scoreMessage = '0.5 คะแนน (มาสาย)'

    await Swal.fire({
      title: 'เช็คชื่อสำเร็จ!',
      html: `
        <div class="text-center">
          <p class="text-lg mb-2">${stuData.name ? 'ขอบคุณ คุณ ' + stuData.name : 'ขอบคุณสำหรับการเช็คชื่อ'}</p>
          <p class="text-sm font-semibold mt-2 ${finalScore === 0.5 ? 'text-orange-600' : 'text-green-600'}">
            ✓ ได้รับ ${scoreMessage}
          </p>
        </div>
      `,
      icon: 'success',
      confirmButtonText: 'ตกลง'
    })
  } catch (e) {
    console.error('Error during check-in:', e)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการเช็คชื่อได้: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchSessionInfo()
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 to-blue-100 p-3 sm:p-4 md:p-6">
    <div class="bg-white shadow-xl rounded-xl p-4 sm:p-6 md:p-8 w-full max-w-xs sm:max-w-md md:max-w-lg">
      <div class="text-center mb-4 sm:mb-6">
        <h2 class="text-xl sm:text-2xl md:text-3xl font-bold mb-2 text-blue-800">เช็คชื่อเข้าห้องเรียน</h2>
        <div v-if="sessionInfo && !errorMessage" class="text-xs sm:text-sm text-gray-600 mt-2">
          <div v-if="!formDisabled" class="flex items-center justify-center mt-2 p-2 sm:p-3 rounded-lg"
               :class="{
                 'bg-green-50 text-green-700': checkInDetails.status === 'on-time',
                 'bg-orange-50 text-orange-700': checkInDetails.status === 'late',
                 'bg-gray-100 text-gray-600': checkInDetails.status === 'error'
               }">
            <svg v-if="checkInDetails.status === 'on-time'" class="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-1.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <svg v-else-if="checkInDetails.status === 'late'" class="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-1.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z" clip-rule="evenodd"></path>
            </svg>
            <span class="text-xs sm:text-sm font-medium">
              สถานะปัจจุบัน: {{ checkInDetails.message }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="errorMessage" class="text-center my-4 sm:my-6">
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <svg class="w-6 h-6 sm:w-8 sm:h-8 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-red-700 font-medium text-sm sm:text-base break-words">{{ errorMessage }}</p>
        </div>
      </div>

      <form v-if="!errorMessage && !formDisabled" @submit.prevent="submitCheckIn" class="space-y-4 sm:space-y-6">
        <div>
          <label for="studentIdInput" class="block text-gray-700 font-semibold mb-2 text-sm sm:text-base">รหัสนักศึกษา</label>
          <input
            id="studentIdInput"
            v-model="studentId"
            type="text"
            maxlength="15"
            class="w-full border-2 border-gray-200 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all text-sm sm:text-base"
            placeholder="เช่น 67XXXXXXX-X"
            :disabled="loading"
            autocomplete="off"
            required
          />
          <p class="text-xs sm:text-sm text-gray-500 mt-1">กรอกรหัสนักศึกษาและกด "เช็คชื่อ"</p>
        </div>

        <button
          type="submit"
          :disabled="loading || !sessionInfo"
          class="bg-gradient-to-r from-blue-500 to-teal-500 text-white font-semibold px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl hover:from-blue-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all w-full disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base active:scale-95"
        >
          <div v-if="loading" class="flex items-center justify-center">
            <svg class="animate-spin -ml-1 mr-2 sm:mr-3 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            กำลังบันทึก...
          </div>
          <span v-else>เช็คชื่อ</span>
        </button>
      </form>

      <div v-if="formDisabled && !errorMessage" class="text-center mt-4 sm:mt-6">
        <div
          class="rounded-lg p-3 sm:p-4 border"
          :class="{
            'bg-green-50 border-green-200': calculatedScore === 1,
            'bg-orange-50 border-orange-200': calculatedScore === 0.5,
            'bg-gray-100 border-gray-300': calculatedScore === 0 && attendanceStatus !== ''
          }"
        >
          <svg v-if="calculatedScore > 0" class="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2"
            :class="calculatedScore === 1 ? 'text-green-500' : 'text-orange-500'"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <svg v-else-if="attendanceStatus !== ''" class="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <svg v-else class="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>

          <p class="font-medium text-sm sm:text-base break-words"
            :class="{
              'text-green-700': calculatedScore === 1,
              'text-orange-700': calculatedScore === 0.5,
              'text-gray-700': calculatedScore === 0 && attendanceStatus !== ''
            }"
          >
            {{ studentId ? studentId : 'คุณ' }} ได้เช็คชื่อแล้ว!
          </p>
          <p v-if="calculatedScore > 0"
            :class="calculatedScore === 1 ? 'text-green-600' : 'text-orange-600'"
            class="text-xs sm:text-sm mt-1">
            ได้รับ {{ attendanceStatus === 'on-time' ? '1 คะแนน' : '0.5 คะแนน' }}
          </p>
          <p v-else-if="attendanceStatus === '' && errorMessage === '' && formDisabled" class="text-xs sm:text-sm mt-1 text-gray-600">
            คุณได้ทำการเช็คชื่อในเซสชันนี้ไปแล้ว
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* เพิ่ม custom styles สำหรับ mobile */
@media (max-width: 479px) {
  .break-words {
    word-break: break-word;
    overflow-wrap: break-word;
  }
}

/* ปรับขนาดตัวอักษรสำหรับหน้าจอเล็กมาก */
@media (max-width: 360px) {
  h2 {
    font-size: 1.125rem; /* 18px */
    line-height: 1.5;
  }
  
  .text-xs {
    font-size: 0.625rem; /* 10px */
  }
}

/* Ensure touch targets are at least 44px */
button {
  min-height: 44px;
}

input {
  min-height: 44px;
}

/* Custom focus styles for better mobile experience */
input:focus {
  transform: scale(1.02);
  transition: transform 0.2s ease;
}

button:active {
  transform: scale(0.98);
}

/* Prevent zoom on iOS */
@media screen and (-webkit-min-device-pixel-ratio: 0) {
  input[type="text"] {
    font-size: 16px;
  }
}
</style>