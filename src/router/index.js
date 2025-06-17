import { createRouter, createWebHistory } from 'vue-router'
import LoginPage from '../views/LoginPage.vue'
import HomeView from '../views/HomeView.vue'
import CreateAttendance from '@/views/CreateAttendance.vue'
import CheckClass from '../views/CheckClass.vue' // 👈 เพิ่มการ import ไฟล์
import AtdDatalist from '@/views/AtdDatalist.vue' 

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: LoginPage },
  { path: '/admin', component: HomeView },
  { path: '/attendance', component: CreateAttendance },
  {
    path: '/attendance/checkclass/:sessionId',
    name: 'checkclass',
    component: CheckClass,
    props: true
  },
  {
    path: '/admin/attendance-details/:sessionId',
    name: 'AttendanceDetails',
    component: AtdDatalist,
    props: true, // เพื่อให้สามารถรับ sessionId ผ่าน props ได้
  },

]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
