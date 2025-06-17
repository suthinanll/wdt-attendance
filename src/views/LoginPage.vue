<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gray-100">
    <div class="bg-white p-8 rounded shadow-md w-80">
      <h2 class="text-2xl font-bold mb-6 text-center">เข้าสู่ระบบ</h2>

      <input v-model="email" type="email" placeholder="อีเมล" class="input mb-4" />
      <input v-model="password" type="password" placeholder="รหัสผ่าน" class="input mb-4" />

      <button @click="loginWithEmail" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 mb-2">
        ล็อกอินด้วยอีเมล
      </button>

      <button @click="loginWithGoogle" class="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700">
        ล็อกอินด้วย Google
      </button>
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

const allowedEmails = ['suthinan.l@kkumail.com', 's@gmail.com']

const loginWithEmail = async () => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value)
    const userEmail = userCredential.user.email

    if (!allowedEmails.includes(userEmail)) {
      Swal.fire('ไม่ได้รับอนุญาต', 'อีเมลนี้ไม่ได้รับสิทธิ์เข้าระบบ', 'error')
      return
    }

    Swal.fire('สำเร็จ!', 'เข้าสู่ระบบเรียบร้อย', 'success')
    router.push('/admin')
  } catch (error) {
    Swal.fire('เกิดข้อผิดพลาด', error.message, 'error')
  }
}

const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider()
  try {
    const result = await signInWithPopup(auth, provider)
    const userEmail = result.user.email

    if (!allowedEmails.includes(userEmail)) {
      Swal.fire('ไม่ได้รับอนุญาต', 'อีเมลนี้ไม่ได้รับสิทธิ์เข้าระบบ', 'error')
      return
    }

    Swal.fire('สำเร็จ!', 'ล็อกอินด้วย Google สำเร็จ', 'success')
    router.push('/admin')
  } catch (error) {
    Swal.fire('เกิดข้อผิดพลาด', error.message, 'error')
  }
}
</script>
