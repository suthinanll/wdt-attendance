<!-- src/views/Home.vue หรือ StudentList.vue -->
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
const editingStudent = ref(null)
const isLoading = ref(false)
const isImporting = ref(false)
const searchQuery = ref('')
const selectedMajor = ref('')
const selectedSection = ref('')
const majors = ref([])
const sections = ref([])
const fileInput = ref(null)

// Form data สำหรับ Modal
const formData = ref({
  studentId: '',
  name: '',
  major: '',
  section: ''
})

// ตัวเลือกสำหรับสาขาใน Modal
const majorOptions = ['IT', 'CS']

// ปรับ filteredStudents ให้กรองตามการค้นหา, สาขา และกลุ่มเรียน
const filteredStudents = computed(() => {
  let result = students.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(student =>
      student.studentId.toLowerCase().includes(query) ||
      student.name.toLowerCase().includes(query) ||
      (student.major && student.major.toLowerCase().includes(query)) ||
      (student.section && student.section.toLowerCase().includes(query))
    )
  }

  if (selectedMajor.value) {
    result = result.filter(student => student.major === selectedMajor.value)
  }

  if (selectedSection.value) {
    result = result.filter(student => student.section === selectedSection.value)
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
    const majorSet = new Set()
    const sectionSet = new Set()

    querySnapshot.forEach((doc) => {
      const studentData = {
        id: doc.id,
        studentId: doc.id,
        ...doc.data()
      }
      students.value.push(studentData)

      if (studentData.major) majorSet.add(studentData.major)
      if (studentData.section) sectionSet.add(studentData.section)
    })

    students.value.sort((a, b) => a.studentId.localeCompare(b.studentId))
    majors.value = Array.from(majorSet).sort()
    sections.value = Array.from(sectionSet).sort()
  } catch (error) {
    console.error('Error loading students:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักศึกษาได้', 'error')
  } finally {
    isLoading.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  selectedMajor.value = ''
  selectedSection.value = ''
}

function openAddModal() {
  editingStudent.value = null
  formData.value = {
    studentId: '',
    name: '',
    major: '',
    section: ''
  }
  showModal.value = true
}

function openEditModal(student) {
  editingStudent.value = student
  formData.value = {
    studentId: student.studentId,
    name: student.name,
    major: student.major || '',
    section: student.section || ''
  }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingStudent.value = null
  formData.value = { studentId: '', name: '', major: '', section: '' }
}

async function saveStudent() {
  if (!formData.value.studentId || !formData.value.name) {
    Swal.fire('กรุณากรอกข้อมูล', 'กรุณากรอกข้อมูลให้ครบถ้วน (รหัสนักศึกษา, ชื่อ)', 'warning')
    return
  }

  try {
    isLoading.value = true
    const studentData = {
      name: formData.value.name,
      major: formData.value.major || '',
      section: formData.value.section || ''
    }

    if (editingStudent.value) {
      const studentRef = doc(db, 'students', editingStudent.value.id)
      await updateDoc(studentRef, studentData)
      Swal.fire('สำเร็จ', 'แก้ไขข้อมูลนักศึกษาเรียบร้อย', 'success')
    } else {
      const studentRef = doc(db, 'students', formData.value.studentId)
      await setDoc(studentRef, studentData)
      Swal.fire('สำเร็จ', 'เพิ่มนักศึกษาเรียบร้อย', 'success')
    }
    closeModal()
    loadStudents()
  } catch (error) {
    console.error('Error saving student:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error')
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
      isLoading.value = true
      await deleteDoc(doc(db, 'students', studentToDelete.id))
      Swal.fire('สำเร็จ', 'ลบนักศึกษาเรียบร้อย', 'success')
      loadStudents()
    } catch (error) {
      console.error('Error deleting student:', error)
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error')
    } finally {
      isLoading.value = false
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
  if (!file) return

  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)', 'error')
    return
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
        Swal.fire('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลนักศึกษาในไฟล์ Excel', 'warning')
        isImporting.value = false
        if (fileInput.value) fileInput.value.value = ''
        return
      }

      const rawHeadersFromExcel = jsonData[0]
      if (!rawHeadersFromExcel || rawHeadersFromExcel.length === 0) {
        Swal.fire('หัวคอลัมน์ไม่ถูกต้อง', 'ไม่สามารถอ่านหัวคอลัมน์จากไฟล์ Excel ได้', 'error')
        isImporting.value = false
        if (fileInput.value) fileInput.value.value = ''
        return
      }

      const headers = rawHeadersFromExcel.map(h => String(h || '').trim().toLowerCase())
      const studentIdHeaderExcel = "รหัสประจำตัว"
      const nameHeaderExcel = "ชื่อ"
      const majorHeaderExcel = "สาขา"
      const sectionHeaderExcel = "กลุ่มเรียน"

      const studentIdIndex = headers.indexOf(studentIdHeaderExcel.toLowerCase())
      const nameIndex = headers.indexOf(nameHeaderExcel.toLowerCase())
      const majorIndex = headers.indexOf(majorHeaderExcel.toLowerCase())
      const sectionIndex = headers.indexOf(sectionHeaderExcel.toLowerCase())

      if (studentIdIndex === -1 || nameIndex === -1) {
        let missingHeaders = []
        if (studentIdIndex === -1) missingHeaders.push(`"${studentIdHeaderExcel}"`)
        if (nameIndex === -1) missingHeaders.push(`"${nameHeaderExcel}"`)

        Swal.fire({
          title: 'หัวคอลัมน์ไม่ถูกต้อง',
          html: `ไม่พบหัวคอลัมน์ที่คาดหวังในไฟล์ Excel:<br><strong>${missingHeaders.join(', ')}</strong>`,
          icon: 'error'
        })
        isImporting.value = false
        if (fileInput.value) fileInput.value.value = ''
        return
      }

      const studentsToImport = []
      let skippedRowCount = 0
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (row && row.length > 0 && row.some(cell => cell !== null && String(cell).trim() !== '')) {
          const studentId = String(row[studentIdIndex] || '').trim()
          const name = String(row[nameIndex] || '').trim()
          const majorValue = majorIndex !== -1 ? String(row[majorIndex] || '').trim() : ''
          const sectionValue = sectionIndex !== -1 ? String(row[sectionIndex] || '').trim() : ''

          if (studentId && name) {
            studentsToImport.push({
              studentId: studentId,
              name: name,
              major: majorValue,
              section: sectionValue
            })
          } else {
            skippedRowCount++
          }
        }
      }

      if (studentsToImport.length === 0) {
        Swal.fire('ไม่พบข้อมูล', `ไม่พบข้อมูลนักศึกษาที่ถูกต้องในไฟล์`, 'warning')
        isImporting.value = false
        if (fileInput.value) fileInput.value.value = ''
        return
      }

      const batch = writeBatch(db)
      studentsToImport.forEach(student => {
        const studentRef = doc(db, 'students', student.studentId)
        const studentData = {
          name: student.name || '',
          major: student.major || '',
          section: student.section || ''
        }
        batch.set(studentRef, studentData)
      })

      await batch.commit()
      Swal.fire('นำเข้าสำเร็จ', `เพิ่ม/อัปเดตข้อมูลนักศึกษา ${studentsToImport.length} คนเรียบร้อย${skippedRowCount > 0 ? ` (ข้ามไป ${skippedRowCount} แถวที่ไม่สมบูรณ์)` : ''}`, 'success')
      loadStudents()
    } catch (error) {
      console.error('Error importing students:', error)
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถนำเข้าข้อมูลนักศึกษาได้', 'error')
    } finally {
      isImporting.value = false
      if (fileInput.value) fileInput.value.value = ''
    }

  }
  reader.readAsArrayBuffer(file)

}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
    <!-- Header -->
    <header class="bg-white shadow-lg">
      <!-- ส่วน Header บน: Logo และ User Info/Logout -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-6 border-b border-gray-200">
          <div class="flex items-center">
            <router-link to="/admin" class="flex-shrink-0 block">
              <h1 class="text-2xl font-bold text-green-600">ระบบเช็คชื่อและให้คะแนน</h1>
              <h1 class="text-sm text-gray-500">CP352201 & SC362201 Web Design Technologies</h1>
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

      <!-- ส่วน Navbar ล่าง: เมนูต่างๆ -->
      <nav class="bg-white">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-start space-x-2 sm:space-x-4 py-3">
            <router-link to="/attendance" class="menu-item" active-class="active-menu-item bg-gray-100">
              เช็คชื่อ
            </router-link>
            <router-link to="/students" class="menu-item" active-class="active-menu-item bg-gray-100">
              รายชื่อนักศึกษา
            </router-link>
            <router-link to="/addpoint" class="menu-item" active-class="active-menu-item bg-gray-100">
              บันทึกคะแนน
            </router-link>
            <router-link to="/scoreboard" class="menu-item" active-class="active-menu-item bg-gray-100">
              ตารางคะแนนรวม
            </router-link>
            <!-- เพิ่มเมนูอื่นๆ ตามต้องการ -->
          </div>
        </div>
      </nav>
    </header>


    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold text-gray-900">รายชื่อนักศึกษา</h2>
        <div class="flex flex-col sm:flex-row gap-2">
          <input type="file" ref="fileInput" @change="handleFileUpload" accept=".xlsx, .xls" style="display: none;" />
          <button @click="triggerFileInput" :disabled="isImporting"
            class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-300 font-medium flex items-center justify-center text-sm sm:text-base">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
            </svg>
            {{ isImporting ? 'กำลังนำเข้า...' : 'นำเข้าจาก Excel' }}
          </button>
          <button @click="openAddModal"
            class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300 font-medium flex items-center justify-center text-sm sm:text-base">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6">
              </path>
            </svg>
            เพิ่มนักศึกษา
          </button>
        </div>
      </div>

      <!-- Filters and Search Bar -->
      <div class="mb-6 bg-white rounded-lg shadow p-4">
        <div class="flex flex-col sm:flex-row gap-4 items-center">
          <div class="flex-1 relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <input v-model="searchQuery" type="text"
              class="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm sm:text-base"
              placeholder="ค้นหาด้วยรหัสนักศึกษา ชื่อ หรือสาขา...">
            <button v-if="searchQuery" @click="clearSearch"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <div class="w-full sm:w-auto">
            <select v-model="selectedMajor"
              class="w-full sm:w-48 py-2 px-3 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base">
              <option value="">ทุกสาขา</option>
              <option v-for="major in majors" :key="major" :value="major">{{ major }}</option>
            </select>
          </div>
          <div class="w-full sm:w-auto">
            <select v-model="selectedSection"
              class="w-full sm:w-48 py-2 px-3 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base">
              <option value="">ทุกกลุ่มเรียน</option>
              <option v-for="section in sections" :key="section" :value="section">{{ section }}</option>
            </select>
          </div>
          <button @click="clearSearch"
            class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition duration-300 font-medium flex items-center justify-center text-sm sm:text-base">
            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            ล้างตัวกรอง
          </button>
        </div>

        <div v-if="searchQuery || selectedMajor || selectedSection" class="mt-3 text-sm text-gray-600">
          <span v-if="filteredStudents.length > 0">
            พบ <span class="font-semibold text-green-600">{{ filteredStudents.length }}</span> รายการ
            จากทั้งหมด {{ students.length }} รายการ
          </span>
          <span v-else class="text-red-600">
            ไม่พบรายการที่ตรงกับการค้นหา
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
        <div v-else-if="students.length === 0 && !searchQuery && !selectedMajor && !selectedSection"
          class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p class="mt-2">ยังไม่มีข้อมูลนักศึกษา</p>
          <button @click="openAddModal"
            class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300">
            เพิ่มนักศึกษาคนแรก
          </button>
        </div>
        <div v-else-if="filteredStudents.length === 0" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <p class="mt-2">ไม่พบรายการที่ตรงกับการค้นหา</p>
          <button @click="clearSearch"
            class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300">
            แสดงทั้งหมด
          </button>
        </div>

        <div v-else-if="filteredStudents.length > 0" class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ลำดับ
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  รหัสนักศึกษา
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ชื่อ-นามสกุล
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  สาขา
                </th>
                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  กลุ่มเรียน
                </th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="(student, index) in filteredStudents" :key="student.id" class="hover:bg-gray-50">
                <td class="px-2 py-1.5 border text-center">{{ index + 1 }}</td>

                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {{ student.studentId }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ student.name }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ student.major || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {{ student.section || '-' }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="openEditModal(student)" class="text-blue-600 hover:text-blue-900 mr-4">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z">
                      </path>
                    </svg>
                  </button>
                  <button @click="deleteStudent(student)" class="text-red-600 hover:text-red-900">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                      </path>
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
          <p v-if="searchQuery || selectedMajor || selectedSection">แสดงผล (จากการค้นหา): <span
              class="font-semibold text-blue-600">{{ filteredStudents.length }}</span> คน</p>
        </div>
      </div>
    </main>

    <!-- Modal -->
    <div v-if="showModal"
      class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div class="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4">
            {{ editingStudent ? 'แก้ไขข้อมูลนักศึกษา' : 'เพิ่มนักศึกษาใหม่' }}
          </h3>

          <form @submit.prevent="saveStudent" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">รหัสนักศึกษา *</label>
              <input v-model="formData.studentId" type="text" required :disabled="editingStudent !== null"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="เช่น 663380006-1">
              <p v-if="editingStudent !== null" class="mt-1 text-xs text-gray-500">ไม่สามารถแก้ไขรหัสนักศึกษาได้</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล *</label>
              <input v-model="formData.name" type="text" required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="ชื่อ นามสกุล">
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">สาขา</label>
              <select v-model="formData.major"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">เลือกสาขา</option>
                <option v-for="option in majorOptions" :key="option" :value="option">{{ option }}</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">กลุ่มเรียน</label>
              <div class="flex space-x-4">
                <div class="flex items-center">
                  <input type="radio" id="section1" value="1" v-model="formData.section" class="mr-2">
                  <label for="section1" class="text-sm text-gray-700">1</label>
                </div>
                <div class="flex items-center">
                  <input type="radio" id="section2" value="2" v-model="formData.section" class="mr-2">
                  <label for="section2" class="text-sm text-gray-700">2</label>
                </div>
              </div>
            </div>

            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" @click="closeModal"
                class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition duration-300">
                ยกเลิก
              </button>
              <button type="submit" :disabled="isLoading"
                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition duration-300 disabled:opacity-50 flex items-center justify-center">
                <svg v-if="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                  </path>
                </svg>
                {{ isLoading ? 'กำลังบันทึก...' : 'บันทึก' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>


    <footer class="text-center py-4 text-xs text-gray-500">
      &copy; {{ new Date().getFullYear() }} CP352201 & SC362201 Web Design Technologies
    </footer>
    <br>
  </div>
</template>

<style scoped lang="postcss">
.overflow-x-auto {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

table {
  border-collapse: collapse;
  width: 100%;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

th,
td {
  padding: 12px 16px;
  text-align: left;
  border: 1px solid #e2e8f0;
  font-size: 0.9rem;
  white-space: nowrap;
  font-family: 'kanit';
}

th {
  background-color: #f8fafc;
  color: #2d3748;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  position: sticky;
  top: 0;
  z-index: 10;
}

td {
  background-color: white;
  color: #4a5568;
}

tbody tr:nth-child(even) {
  background-color: #f7fafc;
}

tbody tr:hover {
  background-color: #edf2f7;
}

table {
  border-radius: 8px;
  overflow: hidden;
}

.menu-item {
  @apply px-3 py-2 rounded-md text-sm font-medium text-gray-700 relative;
  @apply hover:text-green-700 transition-colors duration-200;
  /* เพิ่ม position: relative เพื่อให้ pseudo-element จัดตำแหน่งได้ */
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
</style>