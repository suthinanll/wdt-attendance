รายชื่อนักศึกษา
<!-- src/views/Home.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'

import { auth, db } from '../firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc,
} from 'firebase/firestore'

const router = useRouter()
const userEmail = ref('')
const students = ref([])
const showModal = ref(false)
const editingStudent = ref(null)
const isLoading = ref(false)
const searchQuery = ref('') // เพิ่มตัวแปรสำหรับค้นหา

// Form data
const formData = ref({
  studentId: '',
  name: '',
  major: ''
})

// ฟังก์ชันกรองข้อมูลตามการค้นหา
const filteredStudents = computed(() => {
  if (!searchQuery.value) {
    return students.value
  }
  
  const query = searchQuery.value.toLowerCase()
  return students.value.filter(student => 
    student.studentId.toLowerCase().includes(query) ||
    student.name.toLowerCase().includes(query) ||
    student.major.toLowerCase().includes(query)
  )
})

// ดึงข้อมูล user ที่ล็อกอินอยู่
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

// โหลดข้อมูลนักศึกษา
async function loadStudents() {
  try {
    isLoading.value = true
    const querySnapshot = await getDocs(collection(db, 'students'))
    students.value = []
    querySnapshot.forEach((doc) => {
      students.value.push({
        id: doc.id,
        studentId: doc.id,
        ...doc.data()
      })
    })
    // เรียงลำดับตาม studentId
    students.value.sort((a, b) => a.studentId.localeCompare(b.studentId))
  } catch (error) {
    console.error('Error loading students:', error)
    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักศึกษาได้', 'error')
  } finally {
    isLoading.value = false
  }
}

// ล้างการค้นหา
function clearSearch() {
  searchQuery.value = ''
}

// เปิด Modal สำหรับเพิ่มนักศึกษา
function openAddModal() {
  editingStudent.value = null
  formData.value = {
    studentId: '',
    name: '',
    major: ''
  }
  showModal.value = true
}

// เปิด Modal สำหรับแก้ไขนักศึกษา
function openEditModal(student) {
  editingStudent.value = student
  formData.value = {
    studentId: student.studentId,
    name: student.name,
    major: student.major
  }
  showModal.value = true
}

// ปิด Modal
function closeModal() {
  showModal.value = false
  editingStudent.value = null
  formData.value = {
    studentId: '',
    name: '',
    major: ''
  }
}

// บันทึกข้อมูลนักศึกษา
async function saveStudent() {
  // Validation
  if (!formData.value.studentId || !formData.value.name || !formData.value.major) {
    Swal.fire('กรุณากรอกข้อมูล', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning')
    return
  }

  try {
    isLoading.value = true
    
    const studentData = {
      name: formData.value.name,
      major: formData.value.major
    }
    
    if (editingStudent.value) {
      // แก้ไขข้อมูล
      const studentRef = doc(db, 'students', editingStudent.value.id)
      await updateDoc(studentRef, studentData)
      Swal.fire('สำเร็จ', 'แก้ไขข้อมูลนักศึกษาเรียบร้อย', 'success')
    } else {
      // เพิ่มข้อมูลใหม่
      const studentRef = doc(db, 'students', formData.value.studentId)
      await setDoc(studentRef, studentData)
      Swal.fire('สำเร็จ', 'เพิ่มนักศึกษาเรียบร้อย', 'success')
    }
    
    closeModal()
    loadStudents()
  } catch (error) {
    console.error('Error saving student:', error)
    if (error.code === 'permission-denied') {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่มีสิทธิ์ในการเข้าถึงข้อมูล', 'error')
    } else {
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error')
    }
  } finally {
    isLoading.value = false
  }
}

// ลบนักศึกษา
async function deleteStudent(student) {
  const result = await Swal.fire({
    title: 'ต้องการลบนักศึกษาคนนี้หรือไม่?',
    text: `${student.name} (${student.studentId})`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#e53e3e',
    cancelButtonColor: '#909090',
  })

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'students', student.id))
      Swal.fire('สำเร็จ', 'ลบนักศึกษาเรียบร้อย', 'success')
      loadStudents()
    } catch (error) {
      console.error('Error deleting student:', error)
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error')
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
      <!-- Page Title and Add Button -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
        <h2 class="text-2xl font-bold text-gray-900">รายชื่อนักศึกษา</h2>
        <button @click="openAddModal"
          class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300 font-medium flex items-center justify-center">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          เพิ่มนักศึกษา
        </button>
      </div>

      <!-- Search Bar -->
      <div class="mb-6 bg-white rounded-lg shadow p-4">
        <div class="flex flex-col sm:flex-row gap-4 items-center">
          <div class="flex-1 relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <input v-model="searchQuery" type="text" 
              class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="ค้นหาด้วยรหัสนักศึกษา ชื่อ หรือสาขา...">
          </div>
          <button v-if="searchQuery" @click="clearSearch"
            class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition duration-300 flex items-center">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
            ล้าง
          </button>
        </div>
        
        <!-- Search Results Info -->
        <div v-if="searchQuery" class="mt-3 text-sm text-gray-600">
          <span v-if="filteredStudents.length > 0">
            พบ <span class="font-semibold text-green-600">{{ filteredStudents.length }}</span> รายการ 
            จากทั้งหมด {{ students.length }} รายการ
          </span>
          <span v-else class="text-red-600">
            ไม่พบรายการที่ตรงกับ "{{ searchQuery }}"
          </span>
        </div>
      </div>

      <!-- Students Table -->
      <div class="bg-white rounded-lg shadow-lg overflow-hidden">
        <div v-if="isLoading" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <p class="mt-2 text-gray-600">กำลังโหลดข้อมูล...</p>
        </div>
        
        <div v-else-if="students.length === 0" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p class="mt-2">ยังไม่มีข้อมูลนักศึกษา</p>
          <button @click="openAddModal" class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300">
            เพิ่มนักศึกษาคนแรก
          </button>
        </div>

        <div v-else-if="filteredStudents.length === 0" class="p-8 text-center text-gray-500">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <p class="mt-2">ไม่พบรายการที่ตรงกับการค้นหา</p>
          <button @click="clearSearch" class="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-300">
            แสดงทั้งหมด
          </button>
        </div>

        <div v-else class="overflow-x-auto">
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
                  สาขา
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
                  <span v-html="highlightMatch(student.major, searchQuery)"></span>
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
        <div class="flex flex-col sm:flex-row gap-4 text-gray-600">
          <p>จำนวนนักศึกษาทั้งหมด: <span class="font-semibold text-green-600">{{ students.length }}</span> คน</p>
          <p v-if="searchQuery">แสดงผล: <span class="font-semibold text-blue-600">{{ filteredStudents.length }}</span> คน</p>
        </div>
      </div>
    </main>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="mt-3">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            {{ editingStudent ? 'แก้ไขข้อมูลนักศึกษา' : 'เพิ่มนักศึกษาใหม่' }}
          </h3>
          
          <form @submit.prevent="saveStudent" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">รหัสนักศึกษา *</label>
              <input v-model="formData.studentId" type="text" required
                :disabled="editingStudent !== null"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                placeholder="เช่น 663380006-1">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อ *</label>
              <input v-model="formData.name" type="text" required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="ชื่อ นามสกุล">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">สาขา *</label>
              <input v-model="formData.major" type="text" required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="เช่น IT">
            </div>
            
            <div class="flex justify-end space-x-3 pt-4">
              <button type="button" @click="closeModal"
                class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition duration-300">
                ยกเลิก
              </button>
              <button type="submit" :disabled="isLoading"
                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition duration-300 disabled:opacity-50">
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
export default {
  methods: {
    // ฟังก์ชันเน้นข้อความที่ค้นหา
    highlightMatch(text, searchQuery) {
      if (!searchQuery || !text) return text
      
      const regex = new RegExp(`(${searchQuery})`, 'gi')
      return text.replace(regex, '<mark class="bg-yellow-200 px-1 rounded">$1</mark>')
    }
  }
}
</script>