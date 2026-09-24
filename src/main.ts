import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { preloadCourtImages } from './composables/preloadCourtImages'

preloadCourtImages()
createApp(App).use(createPinia()).mount('#app')
