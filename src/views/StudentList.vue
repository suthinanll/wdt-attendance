<!-- src/views/Home.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import * as XLSX from 'xlsx'

import { auth, db } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore'

const router = useRouter()
const userEmail = ref('')
const students = ref([])
const showModal = ref(false)
const editingStudent = ref(null) // เก็บ object student ที่กำลังแก้ไข
const isLoading = ref(false)
const isImporting = ref(false)
const searchQuery = ref('')
const fileInput = ref(null)

// 1. เพิ่ม ref สำหรับตัวกรองหลักสูตร
const selectedProgramFilter = ref('') // '' หมายถึงทั้งหมด, หรือ 'SC-CS', 'SC-IT'

// Form data สำหรับ Modal
const formData = ref({
  studentId: '',
  name: '',
  program: '' // ชื่อฟิลด์ใน Firestore ของคุณสำหรับหลักสูตร
})

// 2. ปรับ filteredStudents
const filteredStudents = computed(() => {
  let result = students.value

  // กรองตาม searchQuery ก่อน
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(student =>
      student.studentId.toLowerCase().includes(query) ||
      student.name.toLowerCase().includes(query) ||
      (student.program && student.program.toLowerCase().includes(query))
    )
  }

  // กรองตาม selectedProgramFilter
  if (selectedProgramFilter.value) {
    result = result.filter(student =>
      student.program && student.program.toUpperCase() === selectedProgramFilter.value.toUpperCase()
    )
  }
  return result
})

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userEmail.value = user.email
      loadStudents()
    } else {
      router.push('/')
    }
  })
})

async function loadStudents() {
  try {
    isLoading.value = true
    const querySnapshot = await getDocs(collection(db, 'students'))
    students.value = []
    querySnapshot.forEach((doc) => {
      students.value.push({
        id: doc.id, // Firestore document ID
        studentId: doc.id, // Assuming studentId is the document ID and is unique
        ...doc.data()
      })
    })
    students.value.sort((a, b) => a.studentId.localeCompare(b.studentId))
  } catch (error) {
    console.error('Error loading students:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักศึกษาได้', 'error')
  } finally {
    isLoading.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
}

function openAddModal() {
  editingStudent.value = null
  formData.value = {
    studentId: '',
    name: '',
    program: ''
  }
  showModal.value = true
}

function openEditModal(student) {
  editingStudent.value = student // student object from the list
  formData.value = {
    studentId: student.studentId, // รหัสนักศึกษา (document ID) จะไม่ให้แก้
    name: student.name,
    program: student.program || ''
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingStudent.value = null
  formData.value = { studentId: '', name: '', program: '' }
}

async function saveStudent() {
  if (!formData.value.studentId || !formData.value.name || !formData.value.program) {
    Swal.fire('กรุณากรอกข้อมูล', 'กรุณากรอกข้อมูลให้ครบถ้วน (รหัสนักศึกษา, ชื่อ, หลักสูตร)', 'warning')
    return
  }

  try {
    isLoading.value = true // ใช้ isLoading สำหรับ modal save ด้วย
    const studentData = {
      name: formData.value.name,
      program: formData.value.program
      // studentId ไม่ต้องใส่ใน data ที่จะ set/update เพราะมันคือ ID ของ document
    }

    if (editingStudent.value) {
      // แก้ไขข้อมูล: editingStudent.value.id คือ ID ของ document ที่จะแก้ไข
      const studentRef = doc(db, 'students', editingStudent.value.id)
      await updateDoc(studentRef, studentData)
      Swal.fire('สำเร็จ', 'แก้ไขข้อมูลนักศึกษาเรียบร้อย', 'success')
    } else {
      // เพิ่มข้อมูลใหม่: formData.value.studentId คือ ID ของ document ใหม่
      // ตรวจสอบว่ารหัสนักศึกษานี้ยังไม่มีในระบบก่อน (อาจจะต้อง query Firestore)
      // หรือถ้ามั่นใจว่า Firestore rules จัดการได้ ก็ setDoc ไปเลย
      const studentRef = doc(db, 'students', formData.value.studentId)
      await setDoc(studentRef, studentData) // setDoc จะสร้างใหม่ถ้าไม่มี หรือเขียนทับถ้ามี
      Swal.fire('สำเร็จ', 'เพิ่มนักศึกษาเรียบร้อย', 'success')
    }
    closeModal()
    loadStudents() // โหลดข้อมูลใหม่หลังบันทึก
  } catch (error) {
    console.error('Error saving student:', error)
    if (error.code === 'permission-denied') {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่มีสิทธิ์ในการเข้าถึงข้อมูล', 'error')
    } else if (error.code === 'already-exists' && !editingStudent.value) { // Firestore ไม่ได้ throw already-exists สำหรับ setDoc โดยตรง
      Swal.fire('เกิดข้อผิดพลาด', `รหัสนักศึกษา ${formData.value.studentId} มีอยู่ในระบบแล้ว`, 'error')
    }
    else {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error')
    }
  } finally {
    isLoading.value = false
  }
}

async function deleteStudent(studentToDelete) {
  const result = await Swal.fire({
    title: 'ต้องการลบนักศึกษาคนนี้หรือไม่?',
    text: `${studentToDelete.name} (${studentToDelete.studentId})`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e53e3e',
    cancelButtonColor: '#909090',
  })

  if (result.isConfirmed) {
    try {
      isLoading.value = true; // อาจจะเพิ่ม loading state สำหรับการลบ
      await deleteDoc(doc(db, 'students', studentToDelete.id)) // studentToDelete.id คือ document ID
      Swal.fire('สำเร็จ', 'ลบนักศึกษาเรียบร้อย', 'success')
      loadStudents()
    } catch (error) {
      console.error('Error deleting student:', error)
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error')
    } finally {
      isLoading.value = false;
    }
  }
}

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

function triggerFileInput() {
  fileInput.value.click()
}

async function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) {
    return
  }

  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)', 'error');
    return;
  }

  isImporting.value = true
  const reader = new FileReader()

  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (jsonData.length < 2) {
        Swal.fire('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลนักศึกษาในไฟล์ Excel (ต้องมีอย่างน้อย 1 แถวข้อมูลหลัง Header)', 'warning')
        isImporting.value = false
        if (fileInput.value) fileInput.value.value = ''
        return
      }
      
      const rawHeadersFromExcel = jsonData[0];
      if (!rawHeadersFromExcel || rawHeadersFromExcel.length === 0) {
        Swal.fire('หัวคอลัมน์ไม่ถูกต้อง', 'ไม่สามารถอ่านหัวคอลัมน์จากไฟล์ Excel ได้ (แถวแรกอาจว่างเปล่า)', 'error');
        isImporting.value = false;
        if (fileInput.value) fileInput.value.value = '';
        return;
      }

      const headers = rawHeadersFromExcel.map(h => String(h || '').trim().toLowerCase())

      // --- กำหนดชื่อหัวคอลัมน์ใน Excel ของคุณ ---
      const studentIdHeaderExcel = "รหัสประจำตัว"; // หรือ "รหัสนักศึกษา" หรือชื่อที่คุณใช้
      const nameHeaderExcel = "ชื่อ";            // หรือ "ชื่อ-สกุล"
      const programHeaderExcel = "เอก";          // หรือ "หลักสูตร"
      // --- จบการกำหนด ---

      const studentIdIndex = headers.indexOf(studentIdHeaderExcel.toLowerCase())
      const nameIndex = headers.indexOf(nameHeaderExcel.toLowerCase())
      const programIndex = headers.indexOf(programHeaderExcel.toLowerCase()) // คอลัมน์หลักสูตร

      if (studentIdIndex === -1 || nameIndex === -1 || programIndex === -1) {
        let missingHeaders = [];
        if(studentIdIndex === -1) missingHeaders.push(`"${studentIdHeaderExcel}"`);
        if(nameIndex === -1) missingHeaders.push(`"${nameHeaderExcel}"`);
        if(programIndex === -1) missingHeaders.push(`"${programHeaderExcel}"`); // เพิ่มการตรวจสอบ program

        Swal.fire({
          title: 'หัวคอลัมน์ไม่ถูกต้อง',
          html: `ไม่พบหัวคอลัมน์ที่คาดหวังในไฟล์ Excel:<br><strong>${missingHeaders.join(', ')}</strong>.<br><br>
                 <u>หัวคอลัมน์ที่อ่านได้จากไฟล์ (หลัง trim และ toLowerCase):</u><br>
                 <code>[${headers.join('", "')}]</code><br><br>
                 กรุณาตรวจสอบว่าไฟล์มีคอลัมน์: ${studentIdHeaderExcel}, ${nameHeaderExcel}, ${programHeaderExcel}`,
          icon: 'error'
        });
        isImporting.value = false;
        if (fileInput.value) fileInput.value.value = '';
        return;
      }

      const studentsToImport = []
      let skippedRowCount = 0;
      for (let i = 1; i < jsonData.length; i++) { // เริ่มจาก 1 เพื่อข้าม header
        const row = jsonData[i];
        // ตรวจสอบว่า row ไม่ใช่ null และมีข้อมูลอย่างน้อย 1 cell ที่ไม่ว่างเปล่า
        if (row && row.length > 0 && row.some(cell => cell !== null && String(cell).trim() !== '')) {
          const studentId = String(row[studentIdIndex] || '').trim();
          const name = String(row[nameIndex] || '').trim();
          let programValue = String(row[programIndex] || '').trim().toUpperCase(); // ทำเป็นตัวใหญ่เพื่อเทียบง่าย

          // ตัวอย่าง: ถ้าข้อมูล Program ใน Excel เป็นชื่อเต็ม และต้องการให้เป็น SC-CS/SC-IT
          // if (programValue.includes("วิทยาการคอมพิวเตอร์") || programValue.includes("COMPUTER SCIENCE")) {
          //   programValue = "SC-CS";
          // } else if (programValue.includes("เทคโนโลยีสารสนเทศ") || programValue.includes("INFORMATION TECHNOLOGY")) {
          //   programValue = "SC-IT";
          // } // ถ้าใน Excel เป็น SC-CS/SC-IT อยู่แล้ว ก็ไม่ต้อง map

          if (studentId && name && programValue) { // ตรวจสอบว่ามีข้อมูลครบ
            studentsToImport.push({
              studentId: studentId, // นี่จะเป็น ID ของ document
              name: name,
              program: programValue
            });
          } else if (studentId || name || programValue) { // ถ้ามีข้อมูลบางส่วน แต่ไม่ครบ ให้ log เตือน
             console.warn(`Skipping row ${i+1} due to missing required data ("${studentIdHeaderExcel}", "${nameHeaderExcel}", or "${programHeaderExcel}"):`, row.map(cell => String(cell || '').trim()));
             skippedRowCount++;
          }
          // ถ้าแถวว่างเปล่าทั้งหมด จะถูกข้ามไปโดยปริยาย
        }
      }

      if (studentsToImport.length === 0) {
        Swal.fire('ไม่พบข้อมูล', `ไม่พบข้อมูลนักศึกษาที่ถูกต้องตามรูปแบบ ("${studentIdHeaderExcel}", "${nameHeaderExcel}", "${programHeaderExcel}") ในไฟล์${skippedRowCount > 0 ? ` (ข้ามไป ${skippedRowCount} แถวที่ไม่สมบูรณ์)` : ''}`, 'warning');
        isImporting.value = false;
        if (fileInput.value) fileInput.value.value = '';
        return;
      }

      const batch = writeBatch(db)
      studentsToImport.forEach(student => {
        const studentRef = doc(db, 'students', student.studentId) // ใช้ studentId เป็น document ID
        const studentData = { // ข้อมูลที่จะเขียนลง Firestore
          name: student.name,
          program: student.program
          // ไม่ต้องใส่ studentId ที่นี่อีก เพราะมันเป็น ID ของ doc แล้ว
        }
        batch.set(studentRef, studentData) // setDoc จะสร้างใหม่หรือเขียนทับ
      })

      await batch.commit()

      Swal.fire('นำเข้าสำเร็จ', `เพิ่ม/อัปเดตข้อมูลนักศึกษา ${studentsToImport.length} คนเรียบร้อย${skippedRowCount > 0 ? ` (ข้ามไป ${skippedRowCount} แถวที่ไม่สมบูรณ์)` : ''}`, 'success')
      loadStudents()

    } catch (error) {
      console.error('Error importing students:', error)
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถนำเข้าข้อมูลนักศึกษาได้ โปรดตรวจสอบรูปแบบไฟล์ Excel และ Console Log', 'error')
    } finally {
      isImporting.value = false
      if (fileInput.value) {
        fileInput.value.value = '' // Reset file input
      }
    }
  }
  reader.readAsArrayBuffer(file)
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
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold text-gray-900">รายชื่อนักศึกษา</h2>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="file" ref="fileInput" @change="handleFileUpload" accept=".xlsx, .xls" style="display: none;" />
          <button @click="triggerFileInput" :disabled="isImporting"
            class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 font-medium flex items-center justify-center text-sm sm:text-base">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            {{ isImporting ? 'กำลังนำเข้า...' : 'นำเข้าจาก Excel' }}
          </button>
          <button @click="openAddModal"
            class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300 font-medium flex items-center justify-center text-sm sm:text-base">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
            เพิ่มนักศึกษา
          </button>
        </div>
      </div>

      <!-- Filters and Search Bar -->
      <div class="mb-6 bg-white rounded-lg shadow p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div class="md:col-span-2 flex-1 relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <input v-model="searchQuery" type="text"
              class="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base"
              placeholder="ค้นหาด้วยรหัสนักศึกษา ชื่อ หรือหลักสูตร...">
            <button v-if="searchQuery" @click="clearSearch"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div class="relative">
            <select v-model="selectedProgramFilter"
              class="block w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm sm:text-base">
              <option value="">หลักสูตรทั้งหมด</option>
              <option value="SC-CS">SC-CS (วิทยาการคอมพิวเตอร์)</option>
              <option value="SC-IT">SC-IT (เทคโนโลยีสารสนเทศ)</option>
              <!-- เพิ่ม option อื่นๆ ตามหลักสูตรที่มี -->
            </select>
          </div>
        </div>

        <div v-if="searchQuery || selectedProgramFilter" class="mt-3 text-sm text-gray-600">
          <span v-if="filteredStudents.length > 0">
            พบ <span class="font-semibold text-green-600">{{ filteredStudents.length }}</span> รายการ
            จากทั้งหมด {{ students.length }} รายการ
            <span v-if="selectedProgramFilter" class="ml-2">(กรองจากหลักสูตร: <span class="font-semibold">{{ selectedProgramFilter.toUpperCase() }}</span>)</span>
          </span>
          <span v-else class="text-red-600">
            ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง
            <span v-if="selectedProgramFilter" class="ml-1">(หลักสูตร: {{ selectedProgramFilter.toUpperCase() }})</span>
          </span>
        </div>
      </div>

      <!-- Students Table -->
      <div class="bg-white rounded-lg shadow-lg overflow-hidden">
        <div v-if="isLoading && !isImporting" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <p class="mt-2 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
        <div v-else-if="isImporting" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p class="mt-2 text-gray-600">กำลังนำเข้าข้อมูลจาก Excel...</p>
        </div>
        <div v-else-if="students.length === 0 && !searchQuery && !selectedProgramFilter" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p class="mt-2">ยังไม่มีข้อมูลนักศึกษา</p>
          <button @click="openAddModal" class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300">
            เพิ่มนักศึกษาคนแรก
          </button>
        </div>
        <div v-else-if="filteredStudents.length === 0 && (searchQuery || selectedProgramFilter)" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <p class="mt-2">ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง</p>
          <button @click="searchQuery = ''; selectedProgramFilter = ''" class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300">
            แสดงทั้งหมด
          </button>
        </div>

        <div v-else-if="filteredStudents.length > 0" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  รหัสนักศึกษา
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ชื่อ
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  หลักสูตร
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="student in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <span v-html="highlightMatch(student.studentId, searchQuery)"></span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span v-html="highlightMatch(student.name, searchQuery)"></span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span v-html="highlightMatch(student.program, searchQuery)"></span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="openEditModal(student)"
                    class="text-blue-600 hover:text-blue-900 mr-4">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                  </button>
                  <button @click="deleteStudent(student)"
                    class="text-red-600 hover:text-red-900">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary -->
      <div class="mt-6 bg-white rounded-lg shadow p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-2">สรุปข้อมูล</h3>
        <div class="flex flex-col sm:flex-row gap-4 text-gray-600 text-sm">
          <p>จำนวนนักศึกษาทั้งหมด: <span class="font-semibold text-green-600">{{ students.length }}</span> คน</p>
          <p v-if="searchQuery || selectedProgramFilter">แสดงผล (จากการค้นหา/กรอง): <span class="font-semibold text-blue-600">{{ filteredStudents.length }}</span> คน</p>
        </div>
      </div>
    </main>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div class="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
            {{ editingStudent ? 'แก้ไขข้อมูลนักศึกษา' : 'เพิ่มนักศึกษาใหม่' }}
          </h3>

          <form @submit.prevent="saveStudent" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">รหัสนักศึกษา *</label>
              <input v-model="formData.studentId" type="text" required
                :disabled="editingStudent !== null"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="เช่น 663380006-1">
                <p v-if="editingStudent !== null" class="mt-1 text-xs text-gray-500">ไม่สามารถแก้ไขรหัสนักศึกษาได้</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ *</label>
              <input v-model="formData.name" type="text" required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="ชื่อ นามสกุล">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">หลักสูตร *</label>
              <input v-model="formData.program" type="text" required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="เช่น SC-CS, SC-IT">
            </div>

            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" @click="closeModal"
                class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition duration-300">
                ยกเลิก
              </button>
              <button type="submit" :disabled="isLoading"
                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition duration-300 disabled:opacity-50 flex items-center justify-center">
                <svg v-if="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ isLoading ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// Existing script block for methods if not using <script setup> for everything
// For <script setup>, methods are defined directly in the setup context.
// This highlightMatch can be defined globally or as a utility if preferred.
export default {
  methods: {
    highlightMatch(text, searchQuery) {
      if (!searchQuery || !text) return String(text || ''); // Ensure text is always a string
      const textStr = String(text);
      // Escape special characters in searchQuery for RegExp
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedQuery})`, 'gi');
      return textStr.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>');
    }
  }
}
</script>