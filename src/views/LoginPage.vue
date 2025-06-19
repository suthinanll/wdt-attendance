<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-300 to-green-200 p-4">
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
      <!-- Header -->
      <div class="text-center">
        <br><br>
        <h2 class="text-2xl font-medium text-gray-800">เข้าสู่ระบบ</h2>
      </div>
      
      <!-- Form -->
      <div class="p-8">
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
              </span>
              <input 
                v-model="email" 
                type="email" 
                placeholder="your@email.com" 
                class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
              />
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
                </svg>
              </span>
              <input 
                v-model="password" 
                type="password" 
                placeholder="รหัสผ่าน" 
                class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
              />
            </div>
          </div>
          
          <div class="pt-2">
            <button 
              @click="loginWithEmail" 
              class="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-2.5 rounded-lg hover:from-blue-700 hover:to-indigo-800 transition-all shadow-md flex items-center justify-center font-medium"
            >
              
              เข้าสู่ระบบ
            </button>
          </div>
          
          <div class="relative py-3">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-gray-500">หรือ</span>
            </div>
          </div>
          
          <div>
            <button 
              @click="loginWithGoogle" 
              class="w-full bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-all shadow-sm flex items-center justify-center font-medium"
            >
              <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              เข้าสู่ระบบด้วย Google
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { auth } from '../firebase'
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth'

const router = useRouter()
const email = ref('')
const password = ref('')

const allowedEmails = ['suthinan.l@kkumail.com', 's@gmail.com','phattiyaphorn.k@kkumail.com','patiphan.k@kkumail.com']

const loginWithEmail = async () => {
  if (!email.value || !password.value) {
    Swal.fire({
      title: 'ข้อมูลไม่ครบถ้วน',
      text: 'กรุณากรอกอีเมลและรหัสผ่าน',
      icon: 'warning',
      confirmButtonColor: '#4F46E5'
    })
    return
  }

  try {
    Swal.fire({
      title: 'กำลังเข้าสู่ระบบ...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading()
      }
    })

    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value)
    const userEmail = userCredential.user.email

    if (!allowedEmails.includes(userEmail)) {
      Swal.fire({
        title: 'ไม่ได้รับอนุญาต', 
        text: 'อีเมลนี้ไม่ได้รับสิทธิ์เข้าระบบ', 
        icon: 'error',
        confirmButtonColor: '#4F46E5'
      })
      return
    }

    Swal.fire({
      title: 'สำเร็จ!', 
      text: 'เข้าสู่ระบบเรียบร้อย', 
      icon: 'success',
      confirmButtonColor: '#4F46E5'
    })
    router.push('/admin')
  } catch (error) {
    let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
    if (error.code === 'auth/invalid-credential') {
      errorMessage = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'มีการพยายามเข้าสู่ระบบหลายครั้ง กรุณาลองใหม่ภายหลัง'
    }
    
    Swal.fire({
      title: 'เกิดข้อผิดพลาด', 
      text: errorMessage, 
      icon: 'error',
      confirmButtonColor: '#4F46E5'
    })
  }
}

const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider()
  try {
    Swal.fire({
      title: 'กำลังเข้าสู่ระบบด้วย Google...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading()
      }
    })

    const result = await signInWithPopup(auth, provider)
    const userEmail = result.user.email

    if (!allowedEmails.includes(userEmail)) {
      Swal.fire({
        title: 'ไม่ได้รับอนุญาต', 
        text: 'อีเมลนี้ไม่ได้รับสิทธิ์เข้าระบบ', 
        icon: 'error',
        confirmButtonColor: '#4F46E5'
      })
      return
    }

    Swal.fire({
      title: 'สำเร็จ!', 
      text: 'ล็อกอินด้วย Google สำเร็จ', 
      icon: 'success',
      confirmButtonColor: '#4F46E5'
    })
    router.push('/admin')
  } catch (error) {
    Swal.fire({
      title: 'เกิดข้อผิดพลาด', 
      text: error.message, 
      icon: 'error',
      confirmButtonColor: '#4F46E5'
    })
  }
}
</script>

<style scoped>
/* เพิ่มเอฟเฟกต์เล็กน้อย */
button {
  transition: all 0.3s ease;
}
button:active {
  transform: scale(0.98);
}
input {
  transition: all 0.2s ease;
}
</style>